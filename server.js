require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

const app = express();

app.use(cors());
app.use(express.json());

// ─── STATIC ROUTING ───
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/client', express.static(path.join(__dirname, 'client')));
app.use('/feedback', express.static(path.join(__dirname, 'feedback')));
app.use(express.static(__dirname));

// ─── SERVE PDF FILES ─── (Fixed - using regex instead of wildcard)
app.get(/^\/Report_.*\.pdf$/, (req, res) => {
    const fileName = req.path.substring(1);
    const filePath = path.join(__dirname, fileName);
    
    if (fs.existsSync(filePath)) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="' + fileName + '"');
        res.sendFile(filePath);
    } else {
        console.log('❌ PDF not found:', filePath);
        res.status(404).send('PDF file not found');
    }
});

app.get('/', (req, res) => {
    res.redirect('/client/client_UI.html');
});

// ─── GEMINI INIT ───
if (!process.env.GEMINI_API_KEY) {
    console.warn("⚠️  WARNING: GEMINI_API_KEY is missing in .env!");
} else {
    console.log("🔑 Gemini API Key loaded.");
}

let ai;
try {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
} catch (e) {
    console.error("❌ Failed to initialize Gemini SDK:", e.message);
}

// ─── SUPABASE INIT ───
const SUPABASE_URL = process.env.SUPABASE_URL || null;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

if (supabase) {
    console.log('🔌 Supabase client configured.');
} else {
    console.warn('⚠️  Supabase not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.');
}

// ─── NODEMAILER INIT ───
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// =========================================================================
// ─── ADMIN ID CACHE — resolved ONCE at startup, reused everywhere ───
// =========================================================================

let cachedAdminId = null;

async function resolveAdminId() {
    if (!supabase) {
        console.warn('⚠️  Skipping admin resolve — Supabase not configured.');
        return;
    }

    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL;

    if (!adminEmail) {
        console.error('❌ STARTUP ERROR: DEFAULT_ADMIN_EMAIL is missing in .env');
        process.exit(1);
    }

    try {
        const { data: rows, error: selectErr } = await supabase
            .from('admins')
            .select('id')
            .eq('email', adminEmail.trim().toLowerCase())
            .limit(1);

        if (selectErr) throw selectErr;

        if (rows && rows.length > 0) {
            cachedAdminId = rows[0].id;
            console.log(`✅ Admin resolved. admin_id: ${cachedAdminId}`);
        } else {
            const { data: inserted, error: insertErr } = await supabase
                .from('admins')
                .insert({
                    email: adminEmail.trim().toLowerCase(),
                    admin_name: (process.env.DEFAULT_ADMIN_NAME || 'Admin').trim()
                })
                .select('id')
                .single();

            if (insertErr) throw insertErr;
            cachedAdminId = inserted.id;
            console.log(`✅ Admin row created. admin_id: ${cachedAdminId}`);
        }
    } catch (err) {
        console.error('❌ Failed to resolve admin_id at startup:', err.message);
        process.exit(1);
    }
}

// =========================================================================
// ─── AUTHENTICATION ───
// =========================================================================

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'SuperSecureAdmin2026';

function decodeAgentToken(token) {
    try {
        const b64 = token.replace('token-agent-', '');
        return Buffer.from(b64, 'base64').toString('utf8');
    } catch {
        return null;
    }
}

const requireAuth = (role) => {
    return (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            if (role === 'admin') return next();
            if (role === 'agent' && req.query.email) return next();
            return res.status(401).json({ success: false, message: "Access Denied: Auth token missing." });
        }

        if (role === 'admin' && token === `token-admin-${ADMIN_PASSWORD}`) return next();

        if (role === 'agent' && token.startsWith('token-agent-')) {
            const email = decodeAgentToken(token);
            if (email) {
                req.agentEmail = email;
                return next();
            }
        }

        return res.status(403).json({ success: false, message: "Forbidden: Invalid token." });
    };
};

// ─── Unified Login ───
app.post('/api/auth/login', async (req, res) => {
    const { role, email, password } = req.body;

    if (role === 'admin') {
        if (password === ADMIN_PASSWORD) {
            return res.status(200).json({
                success: true,
                token: `token-admin-${ADMIN_PASSWORD}`,
                redirect: '/admin/dashboard.html'
            });
        }
        return res.status(401).json({ success: false, message: "Invalid admin password." });
    }

    if (role === 'agent') {
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password are required." });
        }
        if (!supabase) {
            return res.status(500).json({ success: false, message: "Database not configured." });
        }

        const { data: agentRows, error: agentErr } = await supabase
            .from('agents')
            .select('id, email, password, agent_name')
            .eq('email', email.trim().toLowerCase())
            .limit(1);

        if (agentErr) {
            console.error("❌ DB error during agent login:", agentErr.message);
            return res.status(500).json({ success: false, message: "Database error." });
        }
        if (!agentRows || agentRows.length === 0) {
            return res.status(404).json({ success: false, message: "No agent found with that email." });
        }

        const agent = agentRows[0];

        let passwordMatch = false;
        if (agent.password.startsWith('$2b$') || agent.password.startsWith('$2a$')) {
            passwordMatch = await bcrypt.compare(password, agent.password);
        } else {
            passwordMatch = (password === agent.password);
        }

        if (!passwordMatch) {
            return res.status(401).json({ success: false, message: "Incorrect password." });
        }

        const b64Email = Buffer.from(agent.email).toString('base64');
        return res.status(200).json({
            success: true,
            token: `token-agent-${b64Email}`,
            agentName: agent.agent_name,
            agentId: agent.id,
            redirect: `/admin/dashboard.html?email=${encodeURIComponent(agent.email)}`
        });
    }

    return res.status(400).json({ success: false, message: "Invalid role specified." });
});

// =========================================================================
// ─── ADMIN ENDPOINTS ───
// =========================================================================

// GET /api/admin/agents — list all agents with customer count
app.get('/api/admin/agents', requireAuth('admin'), async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, message: "Database not configured." });
    try {
        const { data: agents, error: agentsErr } = await supabase
            .from('agents')
            .select('id, agent_name, email');

        if (agentsErr) throw agentsErr;

        const agentsWithCount = await Promise.all(agents.map(async (agent) => {
            const { count, error: countErr } = await supabase
                .from('clients')
                .select('*', { count: 'exact', head: true })
                .eq('agent_id', agent.id);

            if (countErr) throw countErr;

            return {
                id: agent.id,
                name: agent.agent_name,
                email: agent.email,
                client_count: count || 0
            };
        }));

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const mapped = agentsWithCount.map(a => ({
            id: a.id,
            name: a.name,
            email: a.email,
            client_count: a.client_count,
            intakeLink: `${baseUrl}/client/client_UI.html?agent=${a.id}`
        }));
        
        res.status(200).json({ success: true, data: mapped });
    } catch (err) {
        console.error("❌ Error fetching agents:", err.message);
        res.status(500).json({ success: false, message: "Failed to fetch agents.", error: err.message });
    }
});

// GET /api/admin/leads — all clients across all agents
app.get('/api/admin/leads', requireAuth('admin'), async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, message: "Database not configured." });
    try {
        const { data, error } = await supabase.from('clients').select('*');
        if (error) throw error;

        const processed = data.map(lead => buildLeadObject(lead));
        res.status(200).json({ success: true, data: processed });
    } catch (err) {
        console.error("❌ Error fetching all leads:", err.message);
        res.status(500).json({ success: false, message: "Failed to fetch leads.", error: err.message });
    }
});

// POST /api/admin/agents — create a new agent
app.post('/api/admin/agents', requireAuth('admin'), async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, message: "Database not configured." });

    try {
        const { name, email, password } = req.body;

        if (!name || !name.trim()) return res.status(400).json({ success: false, message: "Agent name is required." });
        if (!email || !email.includes('@')) return res.status(400).json({ success: false, message: "A valid email address is required." });
        if (!password || password.length < 8) return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });

        const { data: existing, error: checkErr } = await supabase
            .from('agents')
            .select('id')
            .eq('email', email.trim().toLowerCase())
            .limit(1);
        if (checkErr) throw checkErr;
        if (existing && existing.length > 0) {
            return res.status(409).json({ success: false, message: "An agent with this email already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const { data, error } = await supabase
            .from('agents')
            .insert({
                admin_id:   cachedAdminId,
                agent_name: name.trim(),
                email:      email.trim().toLowerCase(),
                password:   hashedPassword
            })
            .select('id, agent_name, email')
            .single();

        if (error) throw error;

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        console.log(`✅ Agent created: ${data.agent_name} (${data.email})`);
        res.status(200).json({
            success: true,
            data: {
                ...data,
                name: data.agent_name,
                client_count: 0,
                intakeLink: `${baseUrl}/client/client_UI.html?agent=${data.id}`
            }
        });

    } catch (err) {
        console.error("❌ Error creating agent:", err.message);
        res.status(500).json({ success: false, message: "Failed to create agent.", error: err.message });
    }
});

// DELETE /api/admin/agents/:id
app.delete('/api/admin/agents/:id', requireAuth('admin'), async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, message: "Database not configured." });
    try {
        const { id } = req.params;
        const { error } = await supabase.from('agents').delete().eq('id', id);
        if (error) throw error;
        res.status(200).json({ success: true, message: "Agent deleted." });
    } catch (err) {
        console.error("❌ Error deleting agent:", err.message);
        res.status(500).json({ success: false, message: "Failed to delete agent.", error: err.message });
    }
});

// =========================================================================
// ─── AGENT ENDPOINTS ───
// =========================================================================

// GET /api/agent/leads?email= — leads belonging to one agent
app.get('/api/agent/leads', requireAuth('agent'), async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, message: "Database not configured." });
    try {
        const email = req.agentEmail || req.query.email;
        if (!email) return res.status(400).json({ success: false, message: "Agent email is required." });

        const { data: agentRows, error: agentErr } = await supabase
            .from('agents')
            .select('id')
            .eq('email', email.trim().toLowerCase())
            .limit(1);
        if (agentErr) throw agentErr;

        if (!agentRows || agentRows.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const { data: clients, error: clientsErr } = await supabase
            .from('clients')
            .select('*')
            .eq('agent_id', agentRows[0].id);
        if (clientsErr) throw clientsErr;

        res.status(200).json({ success: true, data: clients.map(lead => buildLeadObject(lead)) });
    } catch (err) {
        console.error("❌ Error fetching agent leads:", err.message);
        res.status(500).json({ success: false, message: "Failed to fetch leads.", error: err.message });
    }
});

// GET /api/agent/link — get agent's own shareable intake link
app.get('/api/agent/link', requireAuth('agent'), async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, message: "Database not configured." });
    try {
        const email = req.agentEmail || req.query.email;
        if (!email) return res.status(400).json({ success: false, message: "Agent email is required." });

        const { data: agentRows, error } = await supabase
            .from('agents')
            .select('id, agent_name')
            .eq('email', email.trim().toLowerCase())
            .limit(1);
        if (error) throw error;

        if (!agentRows || agentRows.length === 0) {
            return res.status(404).json({ success: false, message: "Agent not found." });
        }

        const agent = agentRows[0];
        const link = `${req.protocol}://${req.get('host')}/client/client_UI.html?agent=${agent.id}`;
        res.status(200).json({ success: true, link, agentName: agent.agent_name });
    } catch (err) {
        console.error("❌ Error fetching agent link:", err.message);
        res.status(500).json({ success: false, message: "Failed to fetch link.", error: err.message });
    }
});

// PATCH /api/agent/leads/:id/status
app.patch('/api/agent/leads/:id/status', requireAuth('agent'), async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, message: "Database not configured." });
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) return res.status(400).json({ success: false, message: "status is required." });

        const { data, error } = await supabase
            .from('clients')
            .update({ status })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        res.status(200).json({ success: true, data });
    } catch (err) {
        console.error("❌ Error updating lead status:", err.message);
        res.status(500).json({ success: false, message: "Failed to update status.", error: err.message });
    }
});

// =========================================================================
// ─── FEEDBACK ENDPOINTS ───
// =========================================================================

// POST /api/feedback — Submit new feedback
app.post('/api/feedback', async (req, res) => {
    if (!supabase) {
        return res.status(500).json({ success: false, message: "Database not configured." });
    }

    try {
        const {
            client_name,
            client_email,
            message,
            overall_rating,
            service_rating,
            value_rating,
            recommend_rating,
            continue_booking,
            agent_email
        } = req.body;

        // --- Validation ---
        if (!client_name || client_name.trim().length < 2) {
            return res.status(400).json({ success: false, message: "Name is required." });
        }
        if (!client_email || !client_email.includes('@')) {
            return res.status(400).json({ success: false, message: "Valid email is required." });
        }
        if (!message || message.trim().length < 5) {
            return res.status(400).json({ success: false, message: "Feedback message is required." });
        }
        if (!overall_rating || overall_rating < 1 || overall_rating > 5) {
            return res.status(400).json({ success: false, message: "Valid overall rating is required." });
        }
        if (!service_rating || service_rating < 1 || service_rating > 5) {
            return res.status(400).json({ success: false, message: "Valid service rating is required." });
        }
        if (!value_rating || value_rating < 1 || value_rating > 5) {
            return res.status(400).json({ success: false, message: "Valid value rating is required." });
        }
        if (!recommend_rating || recommend_rating < 1 || recommend_rating > 5) {
            return res.status(400).json({ success: false, message: "Valid recommend rating is required." });
        }
        if (!continue_booking || !['yes', 'maybe', 'no'].includes(continue_booking)) {
            return res.status(400).json({ success: false, message: "Continue booking selection is required." });
        }

        // --- Find or create client ---
        let clientId = null;
        const { data: existingClient, error: clientFindErr } = await supabase
            .from('clients')
            .select('id')
            .eq('email', client_email.trim().toLowerCase())
            .limit(1);

        if (clientFindErr) throw clientFindErr;

        if (existingClient && existingClient.length > 0) {
            clientId = existingClient[0].id;
        } else {
            const { data: newClient, error: clientInsertErr } = await supabase
                .from('clients')
                .insert({
                    first_name: client_name.split(' ')[0] || client_name,
                    last_name: client_name.split(' ').slice(1).join(' ') || '',
                    email: client_email.trim().toLowerCase(),
                    status: 'new'
                })
                .select('id')
                .single();

            if (clientInsertErr) throw clientInsertErr;
            clientId = newClient.id;
        }

        // --- Find agent ID if agent_email provided ---
        let agentId = null;
        if (agent_email) {
            const { data: agentRows, error: agentFindErr } = await supabase
                .from('agents')
                .select('id')
                .eq('email', agent_email.trim().toLowerCase())
                .limit(1);

            if (!agentFindErr && agentRows && agentRows.length > 0) {
                agentId = agentRows[0].id;
            }
        }

        // --- Insert feedback ---
        const { data: feedback, error: feedbackErr } = await supabase
            .from('feedback')
            .insert({
                client_id: clientId,
                agent_id: agentId,
                client_name: client_name.trim(),
                client_email: client_email.trim().toLowerCase(),
                message: message.trim(),
                overall_rating: overall_rating,
                service_rating: service_rating,
                value_rating: value_rating,
                recommend_rating: recommend_rating,
                continue_booking: continue_booking,
                agent_email: agent_email || null
            })
            .select()
            .single();

        if (feedbackErr) throw feedbackErr;

        // --- Update client's agent if they don't have one ---
        if (agentId) {
            const { data: clientCheck } = await supabase
                .from('clients')
                .select('agent_id')
                .eq('id', clientId)
                .single();

            if (clientCheck && !clientCheck.agent_id) {
                await supabase
                    .from('clients')
                    .update({ agent_id: agentId })
                    .eq('id', clientId);
            }
        }

        console.log(`✅ Feedback submitted by ${client_name} (${client_email})`);
        return res.status(201).json({
            success: true,
            message: "Thank you for your feedback!"
        });

    } catch (error) {
        console.error("❌ Error submitting feedback:", error.message);
        return res.status(500).json({
            success: false,
            message: "Server error. Please try again."
        });
    }
});

// GET /api/agent/feedback — Get feedback for a specific agent
app.get('/api/agent/feedback', requireAuth('agent'), async (req, res) => {
    if (!supabase) {
        return res.status(500).json({ success: false, message: "Database not configured." });
    }

    try {
        const email = req.agentEmail || req.query.email;
        if (!email) {
            return res.status(400).json({ success: false, message: "Agent email is required." });
        }

        // First, get the agent ID
        const { data: agentData, error: agentError } = await supabase
            .from('agents')
            .select('id')
            .eq('email', email.trim().toLowerCase())
            .single();

        if (agentError) {
            console.error("❌ Error finding agent:", agentError.message);
            return res.status(404).json({ success: false, message: "Agent not found." });
        }

        const agentId = agentData.id;

        // Then get feedback for this agent
        const { data: feedback, error } = await supabase
            .from('feedback')
            .select('id, client_name, client_email, message, overall_rating, service_rating, value_rating, recommend_rating, continue_booking, created_at')
            .or(`agent_id.eq.${agentId},agent_email.eq.${email.trim().toLowerCase()}`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return res.status(200).json({
            success: true,
            data: feedback || []
        });

    } catch (error) {
        console.error("❌ Error fetching agent feedback:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch feedback."
        });
    }
});

// GET /api/admin/feedback — Get all feedback for admin
app.get('/api/admin/feedback', requireAuth('admin'), async (req, res) => {
    if (!supabase) {
        return res.status(500).json({ success: false, message: "Database not configured." });
    }

    try {
        const { data: feedback, error } = await supabase
            .from('feedback')
            .select(`
                id,
                client_name,
                client_email,
                message,
                overall_rating,
                service_rating,
                value_rating,
                recommend_rating,
                continue_booking,
                created_at,
                agent_email,
                agents:agent_id (
                    agent_name,
                    email
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Format the response to match what the dashboard expects
        const formattedData = feedback.map(item => ({
            id: item.id,
            client_name: item.client_name,
            client_email: item.client_email,
            message: item.message,
            overall_rating: item.overall_rating,
            service_rating: item.service_rating,
            value_rating: item.value_rating,
            recommend_rating: item.recommend_rating,
            continue_booking: item.continue_booking,
            created_at: item.created_at,
            agent_name: item.agents ? item.agents.agent_name : null,
            agent_email: item.agent_email || (item.agents ? item.agents.email : null)
        }));

        return res.status(200).json({
            success: true,
            data: formattedData
        });

    } catch (error) {
        console.error("❌ Error fetching all feedback:", error.message);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch feedback."
        });
    }
});

// =========================================================================
// ─── NEW LEAD INTAKE (CLIENT QUESTIONNAIRE) ───
// =========================================================================

app.post('/api/new-lead', async (req, res) => {
    let dynamicAiSummary = "Fallback Summary: Onboarding details captured and forwarded to queue.";
    let finalStructuredReport = "";

    try {
        console.log("📥 Parsing incoming lead form...");
        const userData = req.body || {};

        const customerName  = `${userData.firstName || 'Unknown'} ${userData.lastName || 'Client'}`;
        const customerEmail = userData.email || 'No Email';
        const customerPhone = userData.phone || 'Not Provided';
        const contactMethod = userData.contactMethod || 'Email';
        const assignedAgent = userData.assignedAgent || 'Unassigned';

        const userOptionsText = buildOptionsText(userData);

        // ── Gemini AI Summary ──
        if (ai) {
            try {
                const aiPrompt = `
You are an expert luxury travel consultant helper. Write a highly professional,
3-sentence custom travel vibe summary and matching strategy for a travel agent to read before contacting this client.
Base your analysis strictly on the user's actual questionnaire choices below:
${userOptionsText}
Keep the tone polished, exclusive, and tailored exactly to their profile. Do not invent details outside of their choices.
                `.trim();

                const aiResponse = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: aiPrompt,
                });
                dynamicAiSummary = aiResponse.text ? aiResponse.text.trim() : "No summary generated.";
            } catch (aiErr) {
                console.error("❌ Gemini error:", aiErr.message);
            }
        }

        finalStructuredReport = buildTextReport(customerName, customerEmail, customerPhone, contactMethod, assignedAgent, userOptionsText, dynamicAiSummary);
        console.log("\n--- ✨ REPORT GENERATED ✨ ---\n", finalStructuredReport, "\n");

        // ── DB Write ──
        let targetAgentEmail = process.env.DEFAULT_AGENT_FALLBACK_EMAIL || 'agent@agency.com';

        if (supabase) {
            try {
                let agentId = null;

                // Priority 1: use agentId from the unique link URL
                if (userData.agentId) {
                    const { data: agentRows, error: agentSelectErr } = await supabase
                        .from('agents')
                        .select('id, email')
                        .eq('id', userData.agentId)
                        .limit(1);
                    if (agentSelectErr) throw agentSelectErr;
                    if (agentRows && agentRows.length > 0) {
                        agentId = agentRows[0].id;
                        if (agentRows[0].email) targetAgentEmail = agentRows[0].email;
                    }
                }

                // Priority 2: fallback to agent name lookup
                if (!agentId && assignedAgent && assignedAgent !== 'Direct Web Traffic') {
                    let agentQuery = supabase
                        .from('agents')
                        .select('id, email')
                        .eq('agent_name', assignedAgent)
                        .limit(1);
                    if (cachedAdminId) agentQuery = agentQuery.eq('admin_id', cachedAdminId);
                    const { data: agentRows, error: agentSelectErr } = await agentQuery;
                    if (agentSelectErr) throw agentSelectErr;
                    if (agentRows && agentRows.length > 0) {
                        agentId = agentRows[0].id;
                        if (agentRows[0].email) targetAgentEmail = agentRows[0].email;
                    }
                }

                if (!agentId) {
                    console.warn(`⚠️  No agent matched — client saved without agent_id.`);
                }

                const clientRow = {
                    agent_id:             agentId,
                    first_name:           userData.firstName           || null,
                    last_name:            userData.lastName            || null,
                    email:                userData.email               || null,
                    phone:                userData.phone               || null,
                    region:               userData.region              || null,
                    destination_specific: userData.destination_specific || null,
                    destination: Array.isArray(userData.destinationVibes) && userData.destinationVibes.length > 0
                                    ? userData.destinationVibes.join(', ')
                                    : (userData.destination || null),
                    budget:      userData.nightlyBudget || null,
                    travel_date: userData.travelDateStart || null,
                    travel_date_end: userData.travelDateEnd || null,
                    notes:       Array.isArray(userData.specialDetails) && userData.specialDetails.length > 0
                                    ? userData.specialDetails.join(', ')
                                    : (userData.notes || null),
                    status: 'new'
                };

                const { data: clientInsert, error: clientInsertErr } = await supabase
                    .from('clients')
                    .insert(clientRow)
                    .select()
                    .single();

                if (clientInsertErr) {
                    console.error('⚠️  Supabase client insert error:', clientInsertErr.message);
                } else {
                    console.log('✅ Client stored. customer_id:', clientInsert.id);
                }

            } catch (dbErr) {
                console.error('⚠️  DB write error (non-fatal):', dbErr.message || dbErr);
            }
        }

        res.status(200).json({
            success: true,
            message: "Report compiled!",
            report: finalStructuredReport
        });

        setImmediate(async () => {
            try {
                const generatedFilename = generateLeadPDF(userData, dynamicAiSummary);
                const fullPdfPath = path.join(__dirname, generatedFilename);

                const mailOptions = {
                    from: `"Travel-PA Platform" <${process.env.SMTP_USER}>`,
                    to: targetAgentEmail,
                    subject: `✨ New AI Travel Report: ${customerName}`,
                    html: buildEmailHtml(customerName, contactMethod, customerEmail, customerPhone, assignedAgent, dynamicAiSummary),
                    attachments: [{ filename: generatedFilename, path: fullPdfPath }]
                };

                const emailStatus = await transporter.sendMail(mailOptions);
                console.log(`✉️  Email sent to [${targetAgentEmail}]. ID: ${emailStatus.messageId}`);
            } catch (bgErr) {
                console.error("❌ Background worker error:", bgErr.message);
            }
        });

    } catch (error) {
        console.error("💥 Pipeline error:", error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Failed to process lead.", error: error.message || error });
        }
    }
});

// =========================================================================
// ─── HELPERS ───
// =========================================================================

function buildLeadObject(lead) {
    const cleanName = `${lead.first_name || 'Unknown'}_${lead.last_name || 'Client'}`.replace(/[^a-zA-Z0-9]/g, '_');
    const dateStr   = lead.created_at
        ? new Date(lead.created_at).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
    
    let budget = lead.budget;
    if (budget && !isNaN(parseFloat(budget))) {
        budget = parseFloat(budget);
    } else {
        budget = null;
    }
    
    return {
        ...lead,
        name:       `${lead.first_name || 'Unknown'} ${lead.last_name || 'Client'}`,
        concept:    lead.destination_specific || lead.destination || "Custom Itinerary",
        reportFile: `Report_${cleanName}_${dateStr}.pdf`,
        budget:     budget
    };
}

function buildOptionsText(d) {
    return `
- Trip Concept: ${arr(d.tripDreams)}
- Region: ${d.region || 'Not Specified'}
- Destination: ${d.destination_specific || 'Not Specified'}
- Travel Party: ${arr(d.travelers)}
- Date Flexibility: ${d.datesPreference || 'Not Specified'}
- Stay Length: ${d.stayDuration || 'Not Specified'}
- Travel Date Start: ${d.travelDateStart || 'Not Specified'}
- Travel Date End: ${d.travelDateEnd || 'Not Specified'}
- Required Assistance: ${arr(d.helpNeeded)}
- Special Occasions/Priorities: ${arr(d.specialDetails)}
- Accommodation Style: ${d.travelStyle || 'Not Specified'}
- Nightly Budget Tier: £${d.nightlyBudget || 'Not Specified'}
- Departing From (UK Airport): ${d.ukBaseLocation || 'Not Specified'}
    `.trim();
}

function arr(v) {
    return Array.isArray(v) && v.length > 0 ? v.join(', ') : 'None selected';
}

function buildTextReport(name, email, phone, contact, agent, options, aiSummary) {
    return `
==================================================
            TRAVEL ONBOARDING REPORT
==================================================

CUSTOMER DETAILS
--------------------------------------------------
• Name: ${name}
• Email: ${email}
• Phone: ${phone}
• Preferred Contact Method: ${contact}
• Assigned Agent: ${agent}

QUESTIONNAIRE SELECTIONS
--------------------------------------------------
${options}

AI SUMMARY
--------------------------------------------------
${aiSummary}

==================================================
    `.trim();
}

function buildEmailHtml(name, contact, email, phone, agent, aiSummary) {
    return `
        <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;max-width:600px;margin:0 auto;padding:30px;border:1px solid #cbd5e1;border-radius:12px;background:#ffffff;">
            <h2 style="color:#0284c7;margin-bottom:4px;font-size:22px;">New Strategic Lead Report Ready</h2>
            <p style="color:#475569;font-size:15px;margin-top:0;">Gemini has processed a fresh onboarding questionnaire.</p>
            <div style="background:#f8fafc;padding:20px;border-radius:8px;margin:24px 0;border-left:4px solid #f59e0b;">
                <h3 style="margin-top:0;color:#0f172a;font-size:13px;text-transform:uppercase;letter-spacing:.08em;">Client Details</h3>
                <p style="margin:8px 0;font-size:14px;"><strong>Name:</strong> ${name}</p>
                <p style="margin:8px 0;font-size:14px;"><strong>Contact:</strong> ${contact} — ${email} / ${phone}</p>
                <p style="margin:8px 0;font-size:14px;"><strong>Assigned Agent:</strong> ${agent}</p>
            </div>
            <h3 style="color:#1a365d;font-size:14px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">AI Strategy Assessment</h3>
            <p style="color:#334155;font-size:14px;line-height:1.6;background:#fff7ed;padding:14px;border-radius:6px;border:1px dashed #fed7aa;">${aiSummary}</p>
            <p style="font-size:14px;margin-top:24px;">Full client report attached as PDF.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:30px 0;"/>
            <p style="font-size:11px;color:#64748b;text-align:center;">Travel-PA Automated CRM</p>
        </div>
    `;
}

// ─── PDF GENERATOR ───
function generateLeadPDF(userData, aiReportText) {
    const cleanName  = `${userData.firstName || 'Unknown'}_${userData.lastName || 'Client'}`.replace(/[^a-zA-Z0-9]/g, '_');
    const dateString = new Date().toISOString().split('T')[0];
    const filename   = `Report_${cleanName}_${dateString}.pdf`;
    const filePath   = path.join(__dirname, filename);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(fs.createWriteStream(filePath));

    const drawPageFrame = () => {
        doc.roundedRect(25, 25, 545, 792, 18).lineWidth(2.5).stroke('#1A365D');
    };
    drawPageFrame();
    doc.on('pageAdded', drawPageFrame);

    const logoPath = ['assets/logo.png', 'logo.png']
        .map(p => path.join(__dirname, p))
        .find(p => fs.existsSync(p));
    const logoWidth = 90;
    const centerX   = (595 - logoWidth) / 2;

    if (logoPath) {
        doc.image(logoPath, centerX, 45, { width: logoWidth });
        doc.moveDown(4.5);
    } else {
        doc.fillColor('#1A365D').font('Helvetica-Bold').fontSize(16).text('T R A V E L   C O .', 50, 55, { align: 'center' });
        doc.moveDown(3);
    }

    doc.fillColor('#2D3748').font('Helvetica-Bold').fontSize(16).text('CLIENT ONBOARDING PROFILE BRIEF', { align: 'center' });
    doc.moveDown(1.5);

    const metaY = doc.y;

    doc.fillColor('#1A365D').font('Helvetica-Bold').fontSize(10).text('CUSTOMER PROFILE', 55, metaY);
    doc.font('Helvetica').fontSize(9.5).fillColor('#4A5568');
    doc.text(`Name: ${userData.firstName || 'Unknown'} ${userData.lastName || 'Client'}`, 55, metaY + 18);
    doc.text(`Email: ${userData.email || 'Not Provided'}`, 55, metaY + 32);
    doc.text(`Phone: ${userData.phone || 'Not Provided'}`, 55, metaY + 46);
    doc.text(`Preferred Contact: ${userData.contactMethod || 'Email'}`, 55, metaY + 60);

    doc.fillColor('#1A365D').font('Helvetica-Bold').fontSize(10).text('TRIP DIMENSIONS', 320, metaY);
    doc.font('Helvetica').fontSize(9.5).fillColor('#4A5568');
    doc.text(`Region: ${userData.region || 'Not Specified'}`, 320, metaY + 18);
    doc.text(`Destination: ${userData.destination_specific || 'Not Specified'}`, 320, metaY + 32);
    const dateRange = userData.travelDateStart && userData.travelDateEnd 
        ? `${userData.travelDateStart} — ${userData.travelDateEnd}` 
        : userData.travelDateStart || 'Not Specified';
    doc.text(`Travel Dates: ${dateRange}`, 320, metaY + 46);
    doc.text(`Duration: ${userData.stayDuration || 'Not Specified'}`, 320, metaY + 60);
    doc.text(`Nightly Budget: £${userData.nightlyBudget || 'Not Specified'}`, 320, metaY + 74);

    doc.moveTo(55, metaY + 95).lineTo(540, metaY + 95).strokeColor('#E2E8F0').lineWidth(1).stroke();
    doc.x = 55;
    doc.y = metaY + 115;

    doc.fillColor('#1A365D').font('Helvetica-Bold').fontSize(12).text('AI CONSULTANT STRATEGY ASSESSMENT');
    doc.font('Helvetica').fontSize(10).fillColor('#2D3748').moveDown(1);
    doc.text(aiReportText, { align: 'left', lineGap: 5, paragraphGap: 12, width: 485 });
    doc.moveDown(2);

    doc.fillColor('#1A365D').font('Helvetica-Bold').fontSize(12).text('SUBMITTED QUESTIONNAIRE SPECIFICATIONS');
    doc.font('Helvetica').fontSize(9.5).fillColor('#4A5568').moveDown(1);

    doc.text(`• Selected Trip Concepts: ${arr(userData.tripDreams)}`,      { lineGap: 4, width: 485 });
    doc.text(`• Region: ${userData.region || 'Not Specified'}`,             { lineGap: 4, width: 485 });
    doc.text(`• Destination: ${userData.destination_specific || 'Not Specified'}`, { lineGap: 4, width: 485 });
    doc.text(`• Group Setup: ${arr(userData.travelers)}`,                   { lineGap: 4, width: 485 });
    doc.text(`• Travel Dates: ${dateRange || 'Not Specified'}`,             { lineGap: 4, width: 485 });
    doc.text(`• Service Requests: ${arr(userData.helpNeeded)}`,             { lineGap: 4, width: 485 });
    doc.text(`• Priorities & Occasions: ${arr(userData.specialDetails)}`,   { lineGap: 4, width: 485 });
    doc.text(`• UK Departure Airport: ${userData.ukBaseLocation || 'Not Specified'}`, { lineGap: 4, width: 485 });

    doc.end();
    console.log(`📑 PDF generated: ${filename}`);
    return filename;
}

// ─── GLOBAL ERROR HANDLERS ───
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('🚨 Uncaught Exception:', err);
});

// =========================================================================
// ─── START SERVER ───
// =========================================================================

const PORT = process.env.PORT || 5005;

resolveAdminId().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🚀 Server running on https://travelpa-crm.onrender.com/`);
        console.log(`   Client Portal: https://travelpa-crm.onrender.com/client/client_UI.html`);
        console.log(`   Admin Portal:  https://travelpa-crm.onrender.com/admin/login.html\n`);
    });
});