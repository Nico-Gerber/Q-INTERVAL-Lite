# Q-INTERVAL-Lite+

> **Revealing the Invisible: Advanced AI for Interval Cancer Detection.**
> An interactive, educational dashboard comparing Classical Convolutional Neural Networks (CNN) and Quantum Machine Learning (QML) models for breast cancer risk assessment.

**Research prototype. Not for clinical use.**

---

## What's in the repo

| Part | Tech | Folder |
|---|---|---|
| Web app | React (Create React App), Material UI | `src/` |
| Model + admin API | Python, FastAPI, PyTorch, PennyLane | `backend/` |
| Auth, database, file storage | Supabase (Postgres + RLS + Storage) | `supabase/migrations/` |
| LLM explanations | OpenRouter (text + vision models) | called from `backend/routers/shared/Explain.py` |

```
Browser (React) ──► FastAPI backend ──► OpenRouter
     │                    │
     └──── Supabase ◄─────┘   (the browser talks to Supabase directly for login and stored sessions)
```

Accounts have three roles. **Patients** run analyses and see their own sessions. **Clinicians** see the patients assigned to them and verify results. **Admins** approve new accounts, assign patients to clinicians and manage users. New accounts must be approved by an admin before they can use the app.

---

## Run it locally

### 0. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js + npm | 20 or newer (developed on 24) | frontend |
| Python | 3.13 (3.11+ should work) | backend |
| Git **and Git LFS** | any recent | the model weights are stored with Git LFS |
| A Supabase project | free tier is fine | https://supabase.com |
| An OpenRouter API key | free account is fine | https://openrouter.ai (only needed for the AI explanations) |
| Free RAM | **about 4 GB** | the classical analysis peaks at roughly 2.5 GB |

### 1. Get the code and the model files

```bash
git lfs install                  # once per machine
git clone <repo-url>
cd q-interval-lite
git lfs pull                     # downloads the real model weights (about 1 GB)
```

If you cloned **before** installing Git LFS, the `.pth` / `.npy` files are tiny text stubs and the first analysis will fail with `invalid load key, 'v'`. Run `git lfs pull` to fix it.

### 2. Set up Supabase

1. Create a project at supabase.com. From **Project Settings → API** note the **Project URL**, the **anon (public) key** and the **service-role key**. The service-role key is secret: it goes only in the backend `.env`, never in the frontend.
2. Open **SQL Editor** and run every file in `supabase/migrations/` **in filename order**, one at a time:

   0. `20261002000000_baseline_schema.sql` (creates the `sessions`, `ai_results` and `risk_assessments` tables and the public report function; it only creates what is missing, so it is safe on a project that already has them)
   1. `20261003000000_signup_approval.sql`
   2. `20261003010000_verify_clinician_only.sql`
   3. `20261004000000_clinician_patients.sql`
   4. `20261004010000_session_access_rls.sql`
   5. `20261005000000_session_persistence.sql`
   6. `20261005010000_clinician_read_assigned_profiles.sql`
   7. `20261005020000_session_images_exam.sql`
   8. `20261006000000_training_consent_and_delete_rules.sql`

   If a script shows an error, stop and fix it before continuing: each one rolls back as a whole. The baseline file was reconstructed from how the app uses those tables, so if you have the original Supabase project, compare it with `supabase db dump --schema public`.
3. **Authentication → Sign In / Providers → Email**: for local testing, turn **Confirm email off**. (Supabase's built-in email sender allows only a few emails an hour and will block signups.)
4. Create your first admin: sign up through the app (step 5 below), then run this in the SQL Editor:

   ```sql
   update public.profiles
      set role = 'admin', status = 'approved', reviewed_at = now()
    where id = (select id from auth.users where email = 'you@example.com');
   ```

### 3. Start the backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env` (this file is git-ignored; never commit it):

```ini
APP_ENV=development
ALLOWED_ORIGINS=http://localhost:3000

SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role key>

OPENROUTER_API_KEY=<your key>
OPENROUTER_VLM_MODEL=google/gemma-4-31b-it:free          # image explanations (must accept images)
OPENROUTER_TEXT_MODEL=google/gemma-4-31b-it:free         # text explanations (can be the same model)
```

Then run it:

```bash
uvicorn main:app --reload --port 8000
```

Check it at http://localhost:8000/health (should return `{"status":"ok"}`) and the API docs at http://localhost:8000/docs. In the log you should see `All 8 model files present`.

Notes:
- **Restart the backend after editing `.env`.** `--reload` only watches `.py` files, so changes to `.env` are not picked up until you stop and start it again. The startup log prints the explanation models in use, so you can confirm.
- The first analysis after a start takes longer (about a minute) because the models load into memory.
- Every analysis and explanation call requires a signed-in, **approved** user. `REQUIRE_AUTH=false` in `.env` disables that for local debugging only.

<details>
<summary>All backend environment variables</summary>

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | `production` turns on strict startup checks and hides `/docs` |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated frontend addresses allowed by CORS. Must be `https://` in production |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | required | Login verification and admin actions |
| `OPENROUTER_API_KEY` | required for explanations | |
| `OPENROUTER_VLM_MODEL` / `OPENROUTER_TEXT_MODEL` | Gemma 4 31B (free) | Text model defaults to the VLM model |
| `OPENROUTER_VLM_FALLBACKS` / `OPENROUTER_TEXT_FALLBACKS` | none | Comma-separated backup models. Free models get rate-limited or retired, so list a backup |
| `REQUIRE_AUTH` | `true` | Set `false` only for local debugging |
| `MAX_CONCURRENT_ANALYSES` | `1` | Analyses run one at a time to limit memory |
| `LOG_LEVEL` | `INFO` | |
| `TORCH_NUM_THREADS` | library default | Limits CPU threads. Useful on shared cloud CPUs |
| `HEATMAP_WORKERS` | `4` | Parallel heatmap renders (classical model) |
| `OCC_BATCH` | `8` | Heatmap batch size. Smaller uses less memory |
| `HF_MODEL_REPO`, `HF_TOKEN` | none | Only for deployments without Git LFS: downloads model weights from a private Hugging Face repo at startup |

</details>

### 4. Start the frontend

In a second terminal, from the repo root:

```bash
npm install
```

Create `.env.local` in the repo root (git-ignored):

```ini
REACT_APP_API_BASE=http://localhost:8000
REACT_APP_SUPABASE_URL=https://<project-ref>.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<anon (public) key>
```

```bash
npm start
```

Open http://localhost:3000. Restart `npm start` after changing `.env.local`, because React reads it only at startup. Use the **anon** key only; never put the service-role key in a `REACT_APP_` variable.

### 5. Try it end to end

1. Click **Request Access** and create an account. You'll land on "Awaiting Approval".
2. Make that account an admin with the SQL in step 2.4, then sign in again. An **admin** icon appears in the top bar.
3. In **User Management**, approve any other accounts as Clinician or Patient, and assign patients to clinicians.
4. As an approved user, open **Analysis**, upload four views (L-CC, L-MLO, R-CC, R-MLO), and run it. Try **Future Risk** too.
5. The result is saved. Open it again later from **My Sessions** (patients/admins) or **My Patients** (clinicians).

### Useful commands

```bash
npm run build                 # production build of the frontend
npm test                      # frontend tests
pip install -r backend/requirements.lock.txt   # reproduce the exact tested Python versions
```

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `invalid load key, 'v'` in the backend log | Model files are Git LFS stubs. Run `git lfs install && git lfs pull` |
| Analysis returns "model service unavailable" | Look at the backend terminal. Common causes: models still loading (wait a minute), out of memory (needs about 3 GB free), or the traceback shows the real error |
| Browser console: CORS error / pre-flight `400` | `ALLOWED_ORIGINS` in `backend/.env` doesn't include the frontend's exact address. Fix it and restart the backend |
| `401` or `403` from the API | Not signed in, or the account isn't approved yet. Sign out and in again; check the account status in Supabase |
| "Cannot read properties of null (reading 'auth')" or a blank login | `REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_ANON_KEY` missing or misspelled. Names must match exactly; restart `npm start` |
| "email rate limit exceeded" on signup | Supabase's built-in email sender is rate-limited. Turn off **Confirm email** for local testing, or configure custom SMTP |
| Explanations say "service is busy" | The free OpenRouter model is rate-limited. Wait a minute, or set `OPENROUTER_*_FALLBACKS` to other models, or add OpenRouter credit |
| Explanations fail with 503 and a 404 from OpenRouter | The configured model name no longer exists. Pick a current one at https://openrouter.ai/models |
| Quantum future-risk numbers look off | `scikit-image` must be installed (it is in `requirements.txt`). If it is missing, 24 of the model's 61 input features silently become zero |
| Stuck on "Awaiting approval" | An admin must approve the account (see step 5.2) |

---

## Deploying to the web (overview)

The tested setup is: **backend on Railway**, **frontend on Vercel**, **Supabase** for data, and model weights in a **private Hugging Face repo**, because Railway does not fetch Git LFS files.

1. **Backend (Railway):** deploy from GitHub with root directory `backend`. Set `APP_ENV=production`, `ALLOWED_ORIGINS` (the frontend's `https://` address), the Supabase and OpenRouter variables, and `HF_MODEL_REPO` + `HF_TOKEN`. The file `backend/models_manifest.json` lists which weights are downloaded at startup. Expect to need the Hobby plan: loading all models uses roughly 2.5-3 GB of memory.
2. **Frontend (Vercel):** import the repo (root `./`). `vercel.json` already handles page refreshes and lint warnings. Set `REACT_APP_API_BASE` to the Railway address, plus the two Supabase variables. These are baked in at build time, so redeploy after changing them.
3. **Supabase:** add the frontend address under **Authentication → URL Configuration** (Site URL and Redirect URLs) and configure custom SMTP for sign-up emails.
4. **Check:** `https://<backend>/health` returns ok, `/docs` returns "Not Found" (disabled in production), and an unauthenticated call to `/admin/users` returns 401.
