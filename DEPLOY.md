# Deployment Instructions

## Backend → Render.com (Free)

### 1. Create Render Account & Connect Repo
1. Go to [render.com](https://render.com) → Sign up with GitHub
2. New → Web Service → Connect your `DentalScribeAI` repo
3. Select `backend` folder as root directory

### 2. Configure Environment Variables in Render
In Render Dashboard → Environment, add these **exact keys** (values from your `backend/.env`):

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | *(from your Supabase project → Settings → API)* |
| `SUPABASE_ANON_KEY` | *(from your Supabase project → Settings → API)* |
| `SUPABASE_SERVICE_KEY` | *(from your Supabase project → Settings → API — keep secret)* |
| `DATABASE_URL` | *(from your Supabase project → Settings → Database → Connection string; URL-encode special characters in the password)* |
| `SECRET_KEY` | *(generate a new random secret, e.g. `openssl rand -hex 32`)* |
| `ALLOWED_ORIGINS` | `https://YOUR-VERCEL-APP.vercel.app,http://localhost:3000` |
| `PAGEINDEX_API_KEY` | *(from your PageIndex account)* |
| `PAGEINDEX_DOCUMENT_ID` | *(from your PageIndex account)* |
| `GROQ_API_KEY` | *(from your Groq console — keep secret)* |

> ⚠️ Replace `YOUR-VERCEL-APP` with your actual Vercel domain (e.g., `dentalscribeai.vercel.app`)

### 3. Deploy
- Click **Create Web Service**
- Wait for build (2-3 min)
- Copy your Render URL: `https://dentalscribe-api.onrender.com`

---

## Frontend → Vercel

### 1. Vercel Project Settings
1. Go to [vercel.com](https://vercel.com) → Your project → Settings → Environment Variables
2. Add:

| Name | Value | Environment |
|------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://dentalscribe-api.onrender.com/api/v1` | Production, Preview, Development |

3. Redeploy: Deployments → ⋯ → Redeploy

### 2. Verify Frontend Calls Backend
- Open your Vercel URL
- Go to `/poc` page
- Click **"Use Demo Transcript"** → should load from backend
- Click **"Extract Chart"** → should call backend

---

## Quick Test

```bash
# Test backend directly
curl https://dentalscribe-api.onrender.com/api/v1/poc/demo-transcript
# Should return: {"transcript":"DR: Good morning..."}

# Test CORS from browser console on your Vercel domain
fetch("https://dentalscribe-api.onrender.com/api/v1/poc/demo-transcript").then(r=>r.json()).then(console.log)
# Should work without CORS error
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Backend returns 500 | Check Render logs → ensure all env vars set |
| CORS error | Verify `ALLOWED_ORIGINS` in Render includes your Vercel URL exactly |
| Frontend shows "Backend unavailable" | Check `NEXT_PUBLIC_API_URL` in Vercel env vars matches Render URL + `/api/v1` |
| Supabase connection fails | Verify `DATABASE_URL` password is URL-encoded (`@` → `%40`) |

---

## Files Created
- `backend/render.yaml` — Render deployment config
- `frontend/vercel.json` — API rewrites + CORS headers