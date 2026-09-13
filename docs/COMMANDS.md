# ================================================================
# DentXcribe AI — Supabase CLI Commands
# ================================================================
# Usage: copy these commands and run them in PowerShell/Terminal

# ── 1. LINK to your Supabase project ────────────────────────────
#    Get your project ref from: https://supabase.com/dashboard
#    Project ref is the part after https://supabase.com/dashboard/project/
#
#    npx supabase link --project-ref YOUR_PROJECT_REF
#    (It will prompt for your database password)

# ── 2. PUSH all migrations to Supabase ──────────────────────────
#    npx supabase db push

# ── 3. CHECK migration status ───────────────────────────────────
#    npx supabase migration list

# ── 4. PULL current remote schema (to sync local) ───────────────
#    npx supabase db pull

# ── 5. CREATE a new migration file ──────────────────────────────
#    npx supabase migration new <migration_name>
#    Example: npx supabase migration new add_perio_chart_table

# ── 6. RESET local dev database (starts local Supabase) ─────────
#    npx supabase db reset

# ── 7. START local Supabase (requires Docker) ───────────────────
#    npx supabase start

# ── 8. STOP local Supabase ──────────────────────────────────────
#    npx supabase stop

# ── 9. GENERATE TypeScript types from DB schema ─────────────────
#    npx supabase gen types typescript --linked > frontend/src/types/database.types.ts

# ── 10. VIEW logs ───────────────────────────────────────────────
#    npx supabase db logs

# ================================================================
# COMPLETE SETUP WORKFLOW (run in order)
# ================================================================
#
#  Step 1: Create project at https://supabase.com/dashboard/new
#
#  Step 2: Link locally
#    npx supabase link --project-ref YOUR_PROJECT_REF
#
#  Step 3: Push schema + seed data
#    npx supabase db push
#
#  Step 4: Copy your .env values
#    - Go to: Dashboard → Settings → API
#    - Copy SUPABASE_URL and SUPABASE_ANON_KEY into backend/.env
#    - Copy DATABASE_URL from: Dashboard → Settings → Database
#
#  Step 5: Generate TypeScript types (optional but recommended)
#    npx supabase gen types typescript --linked > frontend/src/types/database.types.ts
#
#  Step 6: Start backend
#    cd backend && uvicorn app.main:app --reload
#
#  Step 7: Start frontend
#    cd frontend && npm run dev
#
# ================================================================
# Demo login credentials (after db push with seed)
# ================================================================
#  Email:    dr.kim@brightsmile.com
#  Password: Demo@12345
# ================================================================
