# Civic Connect

Civic Connect is a full-stack civic issue reporting platform where residents can report local problems and municipal teams can triage, prioritize, and resolve them with AI assistance.

## What This Project Does
- Lets citizens submit complaints with title, description, category, location, optional image, and geo coordinates
- Provides complaint feed, personal complaint tracking, and community upvotes
- Gives admins a dashboard for status updates, workload visibility, and complaint operations
- Uses AI to classify issue images, generate complaint descriptions, and analyze complaints for actionable insights
- Includes an AI assistant for admin-side complaint analytics conversations

## Tech Stack
- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS
- Backend: Node.js, Express, MongoDB (Mongoose), JWT auth
- AI Integrations:
- Ollama for complaint analysis, dashboard insights, and assistant chat
- Azure Vision + Gemini fallback for image classification
- Hugging Face for complaint description generation

## Repository Structure
```text
civic-connect/
  backend/                  # Express API + MongoDB models + AI services
  frontend/                 # Next.js app (citizen + admin interfaces)
  docker/                   # Container-related assets
  OLLAMA_SETUP_GUIDE.md     # Local Ollama setup/troubleshooting
```

## Core Product Flows
1. Citizen registers/logs in and creates a complaint from `/report`
2. Backend stores complaint, including optional base64 image and geo metadata
3. Community can upvote complaints to signal urgency
4. Admin reviews complaints in dashboard and updates status (`pending`, `in progress`, `completed`, `resolved`)
5. Admin can run AI analysis per complaint and use AI dashboard insights/assistant for decision support

## Local Development Setup

### Prerequisites
- Node.js 18+
- npm
- MongoDB instance (local or cloud)
- Ollama installed and running locally (recommended for AI admin features)

### 1) Clone & Install
```bash
git clone <your-repo-url>
cd civic-connect

cd backend
npm install

cd ../frontend
npm install
```

### 2) Environment Variables

Create `backend/.env`:
```env
MONGO_URI=mongodb://localhost:27017/civic-connect
JWT_SECRET=replace_with_a_secure_secret

# Ollama (primary admin AI engine)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_RETRY_COUNT=3
OLLAMA_RETRY_DELAY=1000
OLLAMA_CACHE_TTL=3600
OLLAMA_FALLBACK_MODELS=

# Optional cloud AI providers
AZURE_VISION_ENDPOINT=
AZURE_VISION_KEY=
GEMINI_API_KEY=
HUGGINGFACE_API_KEY=
HUGGINGFACE_MODEL=google/flan-t5-base
HUGGINGFACE_CHAT_MODEL=Qwen/Qwen2.5-7B-Instruct
```

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### 3) Run the Apps

Backend:
```bash
cd backend
npm run dev
```
Backend runs on `http://localhost:5000`.

Frontend:
```bash
cd frontend
npm run dev
```
Frontend runs on `http://localhost:3000`.

## API Overview

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PUT /api/auth/profile`

### Admin Auth
- `POST /api/admin/register`
- `POST /api/admin/login`

### Complaints
- `POST /api/complaints` (multipart form, supports image upload)
- `GET /api/complaints`
- `GET /api/complaints/my-complaints`
- `POST /api/complaints/:id/upvote`
- `POST /api/complaints/:id/status`
- `PUT /api/complaints/:id`
- `DELETE /api/complaints/:id`

### AI
- `POST /api/ai/classify` (image -> category suggestion)
- `POST /api/ai/generate` (metadata -> complaint description)
- `POST /api/ai-admin/analyze/:complaintId`
- `GET /api/ai-admin/insights`
- `POST /api/ai-admin/chat`
- `GET /api/ai-admin/suggest-actions/:complaintId`
- `POST /api/ai-admin/batch-analyze`

### Health Check
- `GET /api/test`

## Frontend Routes
- `/` - landing page
- `/register`, `/login` - citizen auth
- `/report` - submit complaint
- `/my-complaints` - user-specific issues
- `/community` - complaint feed/community view
- `/profile` - citizen profile
- `/admin/register`, `/admin/login` - admin auth
- `/admin/dashboard` - admin operations + AI panels

## AI Notes
- If Ollama is unavailable, complaint analysis endpoints return graceful fallback responses.
- For full local AI setup and diagnostics, see [OLLAMA_SETUP_GUIDE.md](./OLLAMA_SETUP_GUIDE.md).
- A diagnostic utility exists at `backend/diagnose-ollama.js`.

## Current Implementation Notes
- User auth in `backend/routes/auth.js` currently uses in-memory storage for users (suitable for development/demo, not production).
- Admin auth uses MongoDB model persistence.

## Scripts

Backend (`backend/package.json`)
- `npm run dev` - start API server
- `npm start` - start API server

Frontend (`frontend/package.json`)
- `npm run dev` - start Next.js dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - lint code


