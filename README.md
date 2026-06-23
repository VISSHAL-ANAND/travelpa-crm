# Travel-PA CRM Platform

A comprehensive Customer Relationship Management (CRM) system for travel agencies, built with Node.js, Express.js, and Supabase. Features AI-powered client management, agent dashboard, feedback tracking, and PDF report generation.

---

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Running Locally](#running-locally)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Deployment Guide](#deployment-guide)
- [Troubleshooting](#troubleshooting)
- [Contact & Support](#contact--support)

---

## 🎯 Project Overview

The **Travel-PA CRM Platform** is a full-stack application designed to manage travel agency operations. It enables:

- **Admins** to manage agents and view system analytics
- **Agents** to manage client information and travel bookings
- **Clients** to submit travel requests and provide feedback
- **Automated** email notifications and AI-powered client suggestions
- **PDF reports** generation for travel itineraries and documentation

This is a **multi-user** system with role-based access (Admin, Agent, Client).

---

## ✨ Features

### Admin Dashboard
- User management (agents, clients)
- View all bookings and client data
- Analytics and reporting
- System configuration

### Agent Portal
- Manage assigned clients
- Create and update travel bookings
- View client feedback and ratings
- Generate travel reports (PDF)
- Email client directly from the system

### Client Interface
- Submit travel requests
- View booking status
- Provide feedback and ratings
- Download booking confirmations

### Additional Features
- 🤖 **AI Integration** - Google Gemini API for intelligent suggestions
- 📧 **Email Notifications** - Nodemailer for automated email alerts
- 🔐 **Secure Authentication** - Bcrypt password hashing
- 📊 **Feedback System** - Client ratings and reviews
- 📄 **PDF Generation** - Travel reports and confirmations
- 🌐 **CORS Enabled** - API ready for frontend integration

---

## 🛠️ Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Runtime** | Node.js | >=20.0.0 |
| **Backend Framework** | Express.js | ^5.2.1 |
| **Database** | Supabase (PostgreSQL) | - |
| **Authentication** | Bcrypt | ^6.0.0 |
| **AI Engine** | Google Gemini API | ^2.8.0 |
| **Email Service** | Nodemailer | ^8.0.10 |
| **PDF Generation** | PDFKit | ^0.18.0 |
| **CORS** | CORS | ^2.8.6 |
| **Environment Config** | Dotenv | ^17.4.2 |

---

## 📦 Prerequisites

Before you start, ensure you have:

1. **Node.js** v20.0.0 or higher
   - Download from: https://nodejs.org/
   - Verify: `node --version`

2. **npm** or **yarn** (comes with Node.js)
   - Verify: `npm --version`

3. **Git** (for version control)
   - Download from: https://git-scm.com/

4. **External Accounts**:
   - **Supabase Account** (for database) - https://supabase.com
   - **Google Gemini API Key** - https://ai.google.dev/
   - **Gmail Account** (for email notifications)

---

## 🚀 Installation & Setup

### Step 1: Clone the Repository

```bash
git clone <your-repo-url>
cd TRAVEL-PA_CRM
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages from `package.json`:
- Express.js
- Supabase JS client
- Google Gemini API
- Nodemailer
- Bcrypt
- PDFKit
- And more...

### Step 3: Set Up Environment Variables

Create a `.env` file in the root directory (already exists in your project):

```env
# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Admin Setup
DEFAULT_ADMIN_NAME=Admin
DEFAULT_ADMIN_EMAIL=your_admin_email@gmail.com
ADMIN_PASSWORD=secure_password_here

# Email Configuration (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_gmail_app_password

# Fallback Email
DEFAULT_AGENT_FALLBACK_EMAIL=your_gmail@gmail.com
```

---

## ⚙️ Environment Configuration

### 1. Google Gemini API Setup

1. Go to [Google AI Studio](https://ai.google.dev/)
2. Click "Get API Key"
3. Create a new API key
4. Copy and paste into `GEMINI_API_KEY` in `.env`

### 2. Supabase Setup

1. Sign up at [Supabase](https://supabase.com)
2. Create a new project
3. Go to **Settings → API**
4. Copy `Project URL` → `SUPABASE_URL`
5. Copy `Service Role Key` → `SUPABASE_SERVICE_ROLE_KEY`
6. Run the database schema (see Database Setup below)

### 3. Gmail App Password Setup

1. Enable 2-Factor Authentication on your Gmail account
2. Go to [Gmail App Passwords](https://myaccount.google.com/apppasswords)
3. Generate an app password for "Mail"
4. Use this 16-character password as `SMTP_PASS`

### Current Configuration Example

```env
GEMINI_API_KEY="your-gemini-api-key"
SUPABASE_URL="your-supabase-url"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
DEFAULT_ADMIN_EMAIL="your-admin-email"
SMTP_USER="your-smtp-user"
```

---

## 🗄️ Database Setup

### Option 1: Using Supabase Console (Recommended)

1. Log in to your Supabase project
2. Go to **SQL Editor**
3. Click **New Query**
4. Copy the entire content from `db/schema.sql`
5. Paste it into the SQL editor and click **RUN**

### Option 2: Using SQL File

```bash
# Connect to your Supabase database and run:
psql -h your-supabase-host -U postgres -d postgres -f db/schema.sql
```

### Database Schema Overview

The application creates 5 main tables:

#### `admins`
- ID, Name, Email
- Root user for the system

#### `agents`
- ID, Admin ID, Name, Email, Password (hashed)
- Travel agents assigned to admins

#### `clients`
- ID, Agent ID, Name, Email, Phone, Region
- Destination, Budget, Travel Dates, Notes, Status
- Assigned to specific agents

#### `feedback`
- ID, Client ID, Agent ID, Email
- Ratings (Overall, Service, Value, Recommendation)
- Messages and timestamps

#### `feedback_analytics` (auto-generated)
- Aggregated rating statistics

---

## 🏃 Running Locally

### Start the Server

```bash
npm start
```

Or for development (same as start):

```bash
npm run dev
```

### Expected Output

```
🔑 Gemini API Key loaded.
🔌 Supabase client configured.
✅ Admin User found/created with ID: <uuid>
🚀 Server running at http://localhost:3000
```

### Default Port

- **Frontend**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin
- **Client Portal**: http://localhost:3000/client
- **Feedback Page**: http://localhost:3000/feedback

### Accessing the Application

1. **Admin Login**
   - URL: http://localhost:3000/admin/login.html
   - Email: `visshalsingiri@gmail.com` (from .env)
   - Password: `12345678` (from .env)

2. **Client Portal**
   - URL: http://localhost:3000/client/client_UI.html
   - Self-register or login with existing credentials

3. **Feedback Form**
   - URL: http://localhost:3000/client/feedback.html
   - Open for all users

---

## 📁 Project Structure

```
TRAVEL-PA_CRM/
├── server.js                 # Main Express server
├── package.json              # Dependencies & scripts
├── .env                      # Environment variables (create/update)
├── Readme.txt               # Old readme
├── README.md                # This file
│
├── admin/                   # Admin panel
│   ├── dashboard.html       # Admin dashboard
│   └── login.html           # Admin login
│
├── client/                  # Client-facing pages
│   ├── client_UI.html       # Main client interface
│   ├── feedback.html        # Feedback form
│   └── index.html           # Landing page
│
├── db/                      # Database
│   └── schema.sql           # Database schema & tables
│
├── assets/                  # Static assets
│   └── (styles, images, etc.)
│
└── node_modules/            # Installed dependencies (auto-generated)
```

---

## 🔌 API Endpoints

### Authentication
- `POST /auth/admin-login` - Admin login
- `POST /auth/agent-login` - Agent login
- `POST /auth/client-login` - Client login
- `POST /auth/client-register` - Client registration

### Admin Routes
- `GET /admin/stats` - Get system statistics
- `GET /admin/agents` - List all agents
- `POST /admin/agents` - Create new agent
- `DELETE /admin/agents/:id` - Delete agent

### Agent Routes
- `GET /agent/clients` - List agent's clients
- `POST /agent/clients` - Create new client
- `PUT /agent/clients/:id` - Update client
- `GET /agent/feedback` - Agent's feedback summary
- `POST /agent/generate-report` - Generate PDF report

### Client Routes
- `GET /client/bookings` - Get client's bookings
- `POST /client/submit-request` - Submit travel request
- `GET /client/status/:id` - Check booking status

### Feedback Routes
- `POST /feedback/submit` - Submit feedback
- `GET /feedback/stats` - Get feedback statistics
- `GET /feedback/agent-ratings/:agent_id` - Agent ratings

### Utility Routes
- `GET /Report_*.pdf` - Retrieve generated PDF reports
- `GET /` - Serve main landing page

---

## 🌐 Deployment Guide

### Option 1: Deploy to Heroku

1. Install Heroku CLI: https://devcenter.heroku.com/articles/heroku-cli
2. Create Heroku account and app:
   ```bash
   heroku login
   heroku create your-app-name
   ```

3. Set environment variables:
   ```bash
   heroku config:set GEMINI_API_KEY="your_key"
   heroku config:set SUPABASE_URL="your_url"
   heroku config:set SUPABASE_SERVICE_ROLE_KEY="your_key"
   # ... set all other variables
   ```

4. Deploy:
   ```bash
   git push heroku main
   ```

### Option 2: Deploy to Vercel

Vercel is optimized for frontend but can host Node.js:

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

3. Add environment variables in Vercel dashboard

### Option 3: Deploy to AWS/DigitalOcean

1. Set up a Linux server (Ubuntu 20.04+)
2. Install Node.js v20+
3. Clone repository and install dependencies
4. Use PM2 for process management:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "travel-crm"
   pm2 startup
   pm2 save
   ```

5. Set up Nginx as reverse proxy
6. Enable SSL with Let's Encrypt

### Option 4: Deploy with Docker

Create `Dockerfile`:
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t travel-pa-crm .
docker run -p 3000:3000 --env-file .env travel-pa-crm
```

---

## 🔧 Troubleshooting

### Issue: "GEMINI_API_KEY is missing"

**Solution**: 
1. Ensure `.env` file exists in root directory
2. Add `GEMINI_API_KEY=your_key` to `.env`
3. Restart server: `npm start`

### Issue: "Supabase not configured"

**Solution**:
1. Get `SUPABASE_URL` from Supabase dashboard → Settings → API
2. Get `SUPABASE_SERVICE_ROLE_KEY` from same location
3. Add to `.env` and restart

### Issue: "DEFAULT_ADMIN_EMAIL is missing" / Server exits on startup

**Solution**:
1. Add `DEFAULT_ADMIN_EMAIL` to `.env`
2. Ensure email is valid format
3. Run `npm start` again

### Issue: Email not sending

**Solution**:
1. Verify Gmail 2FA is enabled
2. Generate new app password: https://myaccount.google.com/apppasswords
3. Update `SMTP_USER` and `SMTP_PASS` in `.env`
4. Verify `SMTP_HOST=smtp.gmail.com` and `SMTP_PORT=587`

### Issue: "Cannot connect to database"

**Solution**:
1. Verify Supabase project is active (not paused)
2. Check `SUPABASE_URL` format is correct
3. Verify `SUPABASE_SERVICE_ROLE_KEY` is correct (not public key)
4. Run `db/schema.sql` in Supabase SQL editor

### Issue: Port 3000 already in use

**Solution**:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <process_id> /F

# Mac/Linux
lsof -i :3000
kill -9 <process_id>
```

Or use a different port by modifying `server.js`:
```javascript
const PORT = process.env.PORT || 3001;
```

---

## 📝 Default Credentials

Use these to test the system locally (from `.env`):

| Role | Email | Password |
|------|-------|----------|
| Admin | visshalsingiri@gmail.com | 12345678 |

**⚠️ IMPORTANT**: Change these credentials before deploying to production!

---

## 🔐 Security Best Practices

1. **Never commit `.env` to Git**
   - Add `.env` to `.gitignore` (already done)

2. **Use Strong Passwords**
   - Admin password should be 12+ characters
   - Include uppercase, lowercase, numbers, symbols

3. **Rotate API Keys Regularly**
   - Update Gemini API key every 3 months
   - Regenerate Supabase keys if compromised

4. **Enable HTTPS**
   - Use Let's Encrypt for free SSL certificates
   - Enable in production environment

5. **Keep Dependencies Updated**
   ```bash
   npm audit
   npm update
   ```

---

## 📞 Contact & Support

For issues or questions:
- **Developer Email**: visshalsingiri@gmail.com
- **Gmail Support**: visshal1v2v3@gmail.com
- **Repository**: [Your GitHub URL]

---

## 📄 License

This project is proprietary and intended for Travel-PA use only.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-06-23 | Initial release |

---

**Last Updated**: 2026-06-23
**Maintained By**: Travel-PA Development Team