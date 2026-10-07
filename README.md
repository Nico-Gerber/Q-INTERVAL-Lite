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
| Login, database, file storage | Supabase (hosted, already set up) | n/a |
| AI explanations | OpenRouter (hosted) | n/a |

You run two things locally: the **backend** (port 8000) and the **frontend** (port 3000). Supabase and OpenRouter are hosted, so there's nothing to install for them.

---

## Run it locally

### 0. You need

- **Node.js 20+** and npm
- **Python 3.13** (3.11+ should work)
- **Git and Git LFS** (the model weights are stored with LFS)
- **About 4 GB of free RAM** (the classical analysis peaks at roughly 2.5 GB)
- The two env files from the team: **`backend/.env`** and **`.env.local`**

### 1. Get the code and the models

```bash
git lfs install            # once per machine
git clone <repo-url>
cd q-interval-lite
git lfs pull               # downloads the real model files (about 1 GB)
```

If you cloned before installing Git LFS, run `git lfs pull` now. Otherwise the first analysis fails with `invalid load key, 'v'`.

### 2. Add the env files

Put the files you were given in these exact places (they are git-ignored, never commit them):

```
q-interval-lite/
├── .env.local          <- frontend settings
└── backend/
    └── .env            <- backend settings
```

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

Sign in with the account you were given, or click **Request Access** to create one (an admin has to approve it before you can use the app). Then open **Analysis**, upload the four views (L-CC, L-MLO, R-CC, R-MLO) and run it. **Future Risk** is the other analysis mode.

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
| "Model service unavailable" after clicking Analyse | Check the backend terminal for the real error. Usually the models are still loading (wait a minute) or you're out of memory (close other apps) |
| CORS error in the browser console | `ALLOWED_ORIGINS` in `backend/.env` must include `http://localhost:3000`. Restart the backend |
| 401 / 403 errors | You're signed out, or your account isn't approved yet. Sign out and in again; ask an admin to approve you |
| "Cannot read properties of null (reading 'auth')" / login does nothing | `.env.local` is missing or in the wrong place. It must be in the repo root. Restart `npm start` |
| AI explanations say the service is busy | The free AI model is rate-limited. Wait a minute and try again |
| `ModuleNotFoundError` in the backend | The venv isn't activated, or run `pip install -r requirements.txt` again |
| Port already in use | Another copy is running. Stop it, or use a different port |
