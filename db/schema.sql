-- Drop and recreate cleanly
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS clients;
DROP TABLE IF EXISTS agents;
DROP TABLE IF EXISTS admins;

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Admins table
CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL
);

-- 3. Agents table
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
);

-- 4. Clients table
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    region TEXT,
    destination_specific TEXT,
    destination TEXT,
    budget TEXT,
    travel_date TEXT,          -- Start date
    travel_date_end TEXT,      -- ✅ NEW: End date for date range
    notes TEXT,
    status TEXT DEFAULT 'new',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Feedback table
CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    message TEXT NOT NULL,
    overall_rating INTEGER NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
    service_rating INTEGER NOT NULL CHECK (service_rating BETWEEN 1 AND 5),
    value_rating INTEGER NOT NULL CHECK (value_rating BETWEEN 1 AND 5),
    recommend_rating INTEGER NOT NULL CHECK (recommend_rating BETWEEN 1 AND 5),
    continue_booking TEXT NOT NULL CHECK (continue_booking IN ('yes', 'maybe', 'no')),
    agent_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. Indexes
CREATE INDEX idx_agents_admin_id ON agents(admin_id);
CREATE INDEX idx_clients_agent_id ON clients(agent_id);
CREATE INDEX idx_feedback_client_id ON feedback(client_id);
CREATE INDEX idx_feedback_agent_id ON feedback(agent_id);
CREATE INDEX idx_feedback_created_at ON feedback(created_at DESC);