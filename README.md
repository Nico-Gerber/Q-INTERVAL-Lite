# Q-INTERVAL-Lite+

> **Revealing the Invisible: Advanced AI for Interval Cancer Detection.**
> An interactive, educational dashboard comparing Classical Convolutional Neural Networks (CNN) and Quantum Machine Learning (QML) models for breast cancer risk assessment.

**Research prototype. Not for clinical use.**

---

## What's in the repo

| Part | Tech | Folder |
|---|---|---|
| Web app | React, Material UI | `src/` |
| Model + admin API | Python, FastAPI, PyTorch, PennyLane | `backend/` |
| Login, database, file storage | Supabase (hosted) | `supabase/schema.sql` |
| AI explanations | OpenRouter (hosted) | n/a |
| Model weights | Git LFS + a Hugging Face repo | `backend/routers/*/models/` |

You run two things locally: the **backend** (port 8000) and the **frontend** (port 3000). Supabase, OpenRouter and Hugging Face are hosted, so there's nothing to install for them, but you need an account/key for each (step 2).

---

## Run it locally

### 0. You need

- **Node.js 20+** and npm
- **Python 3.13** (3.11+ should work)
- **Git and Git LFS** (the model weights are stored with LFS)
- **About 4 GB of free RAM** (the classical analysis peaks at roughly 2.5 GB)
- A free **Supabase** project, an **OpenRouter** API key, and access to the **Hugging Face** model repo (step 2)

### 1. Get the code and the models

```bash
git lfs install            # once per machine
git clone <repo-url>
cd q-interval-lite
git lfs pull               # downloads the real model files (about 1 GB)
```

If you cloned before installing Git LFS, run `git lfs pull` now. Otherwise the first analysis fails with `invalid load key, 'v'`.

### 2. Set up Supabase, then add the env files

**a. Database.** Create a Supabase project, open **SQL Editor > New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. This creates the tables, access rules, private image storage and the public report function in one go.

**b. Env files.** Copy the two examples and fill them in (the real files are git-ignored, never commit them):

```bash
cp .env.example .env.local              # frontend: API URL + Supabase URL and anon key
cp backend/.env.example backend/.env    # backend: Supabase service-role key, OpenRouter key, Hugging Face repo
```

Supabase values are in **Project Settings > API**. Each variable is explained in the example files.

**c. Model weights.** Most weights come with `git lfs pull`, but the 2.6 GB `convnextv2h_model_bundle.pth` does not. Set `HF_MODEL_REPO` (and `HF_TOKEN` if the repo is private) in `backend/.env` and the backend downloads anything missing on first start. Or download that file yourself into `backend/routers/classical_session_analysis/models/`. Until all weights are present, analysis requests return 503 "still loading".

**d. First admin.** Run the app (steps 3-4), click **Request Access** to sign up, then promote yourself in the Supabase SQL Editor:

```sql
update public.profiles
   set role = 'admin', status = 'approved', reviewed_at = now()
 where id = (select id from auth.users where email = 'you@example.com');
```

After that, approve other accounts from the **Admin** page.

### 3. Start the backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Check http://localhost:8000/health. It should say `{"status":"ok"}`. The first analysis after starting is slower (about a minute) while the models load.

### 4. Start the frontend

In a second terminal, from the repo root:

```bash
npm install
npm start
```

Open http://localhost:3000.

### 5. Use it

Sign in with your admin account (step 2d). Other people click **Request Access** and an admin approves them before they can use the app. Then open **Analysis**, upload the four views (L-CC, L-MLO, R-CC, R-MLO) and run it. **Future Risk** is the other analysis mode.

There are three roles: **patients** run analyses and see their own sessions, **clinicians** see their assigned patients and verify results, and **admins** approve accounts and manage users.

---

## After pulling new changes

```bash
git pull
git lfs pull                              # if model files changed
pip install -r backend/requirements.txt   # inside the activated venv, if requirements changed
npm install                               # if package.json changed
```

**Restart both servers after changing an env file.** The backend only reads `.env` at startup (`--reload` doesn't watch it), and React only reads `.env.local` at startup.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `invalid load key, 'v'` in the backend terminal | The models didn't download. Run `git lfs install && git lfs pull` |
| 503 "analysis models are still loading / unavailable" | Weights are missing and could not be downloaded. Check `HF_MODEL_REPO` / `HF_TOKEN` in `backend/.env` and the backend log, or place the files by hand (step 2c) |
| "Model service unavailable" after clicking Analyse | Check the backend terminal for the real error. Usually the models are still loading (wait a minute) or you're out of memory (close other apps) |
| CORS error in the browser console | `ALLOWED_ORIGINS` in `backend/.env` must include `http://localhost:3000`. Restart the backend |
| 401 / 403 errors | You're signed out, or your account isn't approved yet. Sign out and in again; ask an admin to approve you |
| "Cannot read properties of null (reading 'auth')" / login does nothing | `.env.local` is missing or in the wrong place. It must be in the repo root. Restart `npm start` |
| AI explanations say the service is busy | The free AI model is rate-limited. Wait a minute and try again |
| `ModuleNotFoundError` in the backend (e.g. `timm`) | The venv isn't activated, or run `pip install -r requirements.txt` again |
| Port already in use | Another copy is running. Stop it, or use a different port |

---

## Deploying

- **Frontend: Vercel.** `vercel.json` is already set up (Create React App, SPA rewrites). Set `REACT_APP_API_BASE`, `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` as project environment variables.
- **Backend: Railway.** `backend/railway.json` holds the start command and health check; point the service at the `backend/` folder. Set the variables from `backend/.env.example`, with `APP_ENV=production`, `ALLOWED_ORIGINS` set to the https:// frontend URL, and `HF_MODEL_REPO`/`HF_TOKEN` (Railway does not pull Git LFS, so every weight is downloaded from Hugging Face at startup; the list is `backend/models_manifest.json`). Production refuses to start if a required value is missing or unsafe.
- The classical analysis needs about 2.5 GB of RAM, so size the Railway service accordingly.

## Adding or replacing a model

Each analysis type has its own package under `backend/routers/`. To swap a model, replace its `run.py` and `models/`; to add a new engine, follow the guides:

- Session analysis (four views): [`backend/routers/session_analysis/IMPLEMENTATION.md`](backend/routers/session_analysis/IMPLEMENTATION.md)
- Future risk (sequential exams): [`backend/routers/future_risk_shared/template/IMPLEMENTER_GUIDE.md`](backend/routers/future_risk_shared/template/IMPLEMENTER_GUIDE.md)

New weights that are not in git must also be added to `backend/models_manifest.json`.

The two live classical engines: session analysis uses the ConvNeXt V2 bundle; future risk uses `FUTURE_RISK_ENGINE` (`v2c` by default, `v2d` optional) through `future_risk_classical/engine.py`.

## Notes

- There is no automated test suite.
- `research/` holds the original training code, experiments and reports. The app does not use it.
