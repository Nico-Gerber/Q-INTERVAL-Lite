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
- **About 8 GB of RAM** (the backend holds several large models; on Railway it used about 5 to 7 GB while analysing)
- A free **Supabase** project, an **OpenRouter** API key, and access to the **Hugging Face** model repo (step 2)

### 1. Get the code and the models

```bash
git lfs install            # once per machine
git clone <repo-url>
cd q-interval-lite
git lfs pull               # downloads the smaller model files (about 1 GB)
```

If you cloned before installing Git LFS, run `git lfs pull` now. Otherwise the first analysis fails with `invalid load key, 'v'`.

### 2. Set up Supabase, then add the env files

**a. Database.** Create a Supabase project, open **SQL Editor > New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. This creates the tables, access rules, private image storage and the public report function in one go.

Then check **Authentication**: under **Providers > Email**, "Confirm email" is on by default, so new accounts must click an emailed link before they can sign in (Supabase's built-in email sender is heavily rate-limited). For local testing you can switch it off. Under **URL Configuration**, set **Site URL** to the address people use (`http://localhost:3000` locally, your Vercel URL when deployed).

**b. Env files.** Copy the two examples and fill them in (the real files are git-ignored, never commit them):

```bash
cp .env.example .env.local              # frontend: API URL + Supabase URL and anon key
cp backend/.env.example backend/.env    # backend: Supabase service-role key, OpenRouter key, Hugging Face repo
```

Supabase values are in **Project Settings > API Keys**. Supabase now calls the public key **publishable** (`sb_publishable_...`) and the private one **secret** (`sb_secret_...`). Paste the publishable key into `REACT_APP_SUPABASE_ANON_KEY` and the secret key into `SUPABASE_SERVICE_ROLE_KEY` (the variable names are unchanged). Older projects with `anon` and `service_role` keys work too. Each variable is explained in the example files.

**c. Model weights.** `git lfs pull` brings the smaller weights, but the large ones (the 2.6 GB `convnextv2h_model_bundle.pth` and the v12 ensemble) are only on Hugging Face. Set `HF_MODEL_REPO` (and `HF_TOKEN` if the repo is private) in `backend/.env` and the backend downloads anything missing on first start. Or download that file yourself into `backend/routers/session_analysis_classical/models/`. Until all weights are present, analysis requests return 503 "still loading".

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
python -m uvicorn main:app --reload --port 8000
```

The prompt should show `(venv)` and `which python` should point into `backend/venv`. Use `python -m uvicorn` rather than plain `uvicorn`, which can pick up a different Python installed elsewhere on the machine and then fail with missing modules.

Check http://localhost:8000/health. It should say `{"status":"ok"}`. The first analysis after starting is slower while the models load. A four-view session runs on the CPU and takes from under a minute to several minutes depending on the machine (about 4 minutes on Railway's Hobby plan).

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
| CORS error in the browser console, or the Admin page says "Could not reach the server" | `ALLOWED_ORIGINS` in `backend/.env` must contain the exact address you browse from, such as `http://localhost:3000`, with **no trailing slash**. Restart the backend |
| 401 / 403 errors | You're signed out, or your account isn't approved yet. Sign out and in again; ask an admin to approve you |
| "Cannot read properties of null (reading 'auth')" / login does nothing | `.env.local` is missing or in the wrong place. It must be in the repo root. Restart `npm start` |
| AI explanations say the service is busy | The free AI model is rate-limited. Wait a minute and try again |
| `ModuleNotFoundError` in the backend (e.g. `timm`) | The requirements aren't installed in the venv you're running. Activate it, run `pip install -r requirements.txt`, and start with `python -m uvicorn` (check `which uvicorn` points into `backend/venv`) |
| Port already in use | Another copy is running. Stop it, or use a different port |

---

## Deploying

- **Frontend: Vercel.** `vercel.json` is already set up (Create React App, SPA rewrites). Set `REACT_APP_API_BASE`, `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` as project environment variables.
- **Backend: Railway.** `backend/railway.json` holds the start command and health check; point the service at the `backend/` folder. Set the variables from `backend/.env.example`, with `APP_ENV=production`, `ALLOWED_ORIGINS` set to the https:// frontend URL, and `HF_MODEL_REPO`/`HF_TOKEN` (Railway does not pull Git LFS, so every weight is downloaded from Hugging Face at startup; the list is `backend/models_manifest.json`). Production refuses to start if a required value is missing or unsafe.
- Size the Railway service for about 8 GB of RAM (observed 5 to 7 GB). Set `TORCH_NUM_THREADS` to the vCPU count (8 on the Hobby plan's maximum). A session analysis takes about 4 minutes there because the ConvNeXt step is roughly 50 seconds per view on CPU.
- `ALLOWED_ORIGINS` must be the exact https:// frontend address with no trailing slash. In Supabase, set **Authentication > URL Configuration > Site URL** to the deployed frontend URL.
- Weights are downloaded from the Hugging Face `main` branch on every start. Set `HF_MODEL_REVISION` to a commit or tag to pin a version.
- If the platform ever reports leaked secrets, rotate the Supabase secret key, the OpenRouter key and the Hugging Face token, update them in Railway, then redeploy.

## Adding or replacing a model

Each analysis type has its own package under `backend/routers/`. To swap a model, replace its `run.py` and `models/`; to add a new engine, follow the guides:

- Session analysis (four views): [`backend/routers/session_analysis_shared/IMPLEMENTATION.md`](backend/routers/session_analysis_shared/IMPLEMENTATION.md)
- Future risk (sequential exams): [`backend/routers/future_risk_shared/template/IMPLEMENTER_GUIDE.md`](backend/routers/future_risk_shared/template/IMPLEMENTER_GUIDE.md)

New weights that are not in git must also be added to `backend/models_manifest.json`.

The two live classical engines: session analysis uses the ConvNeXt V2 bundle; future risk uses `FUTURE_RISK_ENGINE` (`v2c` by default, `v2d` optional) through `future_risk_classical/engine.py`.

## Notes

- There is no automated test suite.
- `research/` holds the original training code, experiments and reports. The app does not use it.
