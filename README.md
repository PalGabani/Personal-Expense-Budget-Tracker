# Personal Expense & Budget Tracker

A private, straightforward way to track income and expenses, set monthly budgets, and see
exactly where your money goes.

Built with Next.js on the front end and FastAPI on the back end, using Supabase for the database
and authentication. Amounts are stored as **integer paise** (1 rupee = 100 paise), so amounts are
always exact, and Row Level Security ensures your records stay private to your account.

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Optional: AI spending summary](#optional-ai-spending-summary)
- [Verify your setup](#verify-your-setup)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Deployment](#deployment)

---

## Features

### Track your money

- **Income and expenses** — record the amount, date, category, and an optional note
- **Edit or delete** any transaction at any time
- **Search and filter** by month, type, category, or text in your notes
- **Export to CSV** of exactly the rows you filtered — safe to open in Excel or Google Sheets

### Budget

- **Monthly limits** per expense category
- **Progress bars** showing how much is spent, remaining, or over budget
- **Over-budget warnings** that update as you add transactions

### Understand your spending

- **Monthly totals** for income, expenses, and net
- **Donut chart** breaking spending down by category
- **Bar chart** comparing actual spending against each budget
- **Optional AI summary** — a short, neutral overview of your month, off by default

### Categories

- **Start with ready-made defaults** — Food & Dining, Transport, Housing, Utilities, Shopping,
  Health, Salary, and Other Income are created automatically when you sign up
- **Add your own** to match how you actually budget
- **Rename or delete** any category from **Settings**

### Your data stays yours

- **Row Level Security** on every table — no user can read another user's records
- **No third-party analytics** — nothing about your finances is tracked or sold
- **AI is opt-in** — no data is ever sent to an AI provider unless you tick the consent box

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Backend | FastAPI, Pydantic |
| Database & auth | Supabase Postgres + Supabase Auth |
| AI (optional) | Gemini API |

---

## Project structure

```text
.
├── backend/                  FastAPI application
│   ├── app/
│   │   ├── auth.py           Verifies the caller's Supabase bearer token
│   │   ├── config.py         Environment settings (Pydantic Settings)
│   │   ├── main.py           App factory, CORS, health endpoint
│   │   ├── routes.py         HTTP endpoints: transactions, categories, budgets, reports, CSV
│   │   ├── schemas.py        Pydantic request/response contracts
│   │   └── services/
│   │       └── supabase.py   Supabase REST access and error mapping
│   ├── tests/                pytest suite
│   ├── run.py                Dev entry point (stable asyncio loop on Windows)
│   └── pyproject.toml        Dependencies and tooling config
│
├── frontend/                 Next.js application
│   ├── src/
│   │   ├── app/              Routes and layouts (login page, dashboard page)
│   │   ├── components/       Shared components (brand mark, logo)
│   │   ├── features/
│   │   │   ├── auth/         Sign-in and sign-up form
│   │   │   └── dashboard/    Dashboard, charts, settings dialog, data hooks
│   │   ├── lib/
│   │   │   ├── supabase/     Browser and server Supabase clients
│   │   │   ├── csv.ts        CSV export with spreadsheet-injection safety
│   │   │   └── money.ts      Integer-paise parsing and INR formatting
│   │   └── proxy.ts          Refreshes the auth session on each request
│   ├── public/               Static assets
│   ├── biome.json            Linting and formatting config
│   ├── next.config.ts        Next.js config
│   ├── package.json          Scripts and dependencies
│   ├── tsconfig.json         TypeScript config
│   └── vitest.config.mts     Test config
│
├── supabase/
│   └── migrations/           Versioned SQL: tables, constraints, indexes, RLS policies
│
├── .env.example              Reference for all environment variables
└── .gitignore
```

**How a request flows:** the browser holds a Supabase session and sends its access token to
FastAPI. FastAPI verifies that token, then forwards the **same token** to Supabase Postgres. Because
the user's own token is used, Supabase's Row Level Security policies decide which rows are visible
— no service-role key is involved anywhere.

**Where to make changes:**

| Task | Location |
| --- | --- |
| Add an API endpoint | `backend/app/routes.py` |
| Add or change a validation rule | `backend/app/schemas.py` |
| Change the database schema or RLS | `supabase/migrations/` (add a new migration) |
| Change a form or dashboard feature | `frontend/src/features/` |
| Change how money is formatted | `frontend/src/lib/money.ts` |
| Add a brand or logo asset | `frontend/src/components/` |

---

## Prerequisites

- **Node.js 20.9 or newer** and npm
- **Python 3.11 or newer**
- A free **Supabase** account and project
- Optional: a **Gemini API key** — every other feature works without it

---

## Setup

### 1. Create a Supabase project

1. Go to <https://supabase.com/dashboard> and create a new project.
2. Wait for the database to finish provisioning.
3. Go to **Project Settings → API** and copy:
   - **Project URL** — looks like `https://abcdefghijklm.supabase.co`
   - **Publishable key** — starts with `sb_publishable_`

> Use the **publishable key**. You do not need a service-role key for this project, and you
> should never put one in this repository.

### 2. Create the database tables (required)

1. In Supabase, open **SQL Editor → New query**.
2. Copy the entire contents of `supabase/migrations/202610090001_initial_schema.sql` from this
   repository.
3. Paste it into the editor and click **Run**.

Keep the default `postgres` role. This creates the `categories`, `transactions`, and `budgets`
tables, enables Row Level Security, and sets up the trigger that adds your default categories when
you sign up.

> **Important:** create your account *after* running this SQL. The default categories are added by
> a trigger that only runs when a new account is created.

### 3. Configure the frontend

```powershell
Copy-Item frontend/.env.example frontend/.env.local
```

Edit `frontend/.env.local` and paste in the values from step 1:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<your-key>
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

Variables starting with `NEXT_PUBLIC_` are visible in the browser, so never put a secret here.

### 4. Configure the backend

```powershell
Copy-Item backend/.env.example backend/.env
```

Edit `backend/.env`:

```dotenv
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_<your-key>
CORS_ORIGINS=http://localhost:3000

AI_SUMMARY_ENABLED=false
GEMINI_API_KEY=
GEMINI_MODEL=
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Same Project URL you used in the frontend |
| `SUPABASE_PUBLISHABLE_KEY` | yes | Same publishable key you used in the frontend |
| `CORS_ORIGINS` | yes | Comma-separated list of allowed browser origins |
| `AI_SUMMARY_ENABLED` | no | Keep `false` unless you want the AI summary |
| `GEMINI_API_KEY` | no | Only needed if you enable the AI summary |
| `GEMINI_MODEL` | no | Only needed if you enable the AI summary |

The frontend and backend use the **same** Supabase URL and key. The `NEXT_PUBLIC_` prefix is just
naming convention for browser-visible settings.

### 5. Configure Supabase authentication

In Supabase go to **Authentication → URL Configuration** and set:

| Field | Value |
| --- | --- |
| Site URL | `http://localhost:3000` |
| Redirect URLs | `http://localhost:3000/auth/callback` |

Leaving **email confirmation** enabled is fine — you confirm your address once, on the email
Supabase sends after signing up.

### 6. Run the app

You need two terminals.

**Frontend:**

```powershell
Set-Location frontend
npm install
npm run dev
```

**Backend:**

```powershell
Set-Location backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
python run.py
```

> On **Windows**, start the backend with `python run.py`. It behaves like
> `uvicorn app.main:app --reload` but selects a more stable asyncio event loop, which prevents
> the dev server from crashing with `OSError: [WinError 64]` during normal use.
> On **macOS/Linux**, `uvicorn app.main:app --reload` works fine.

Then open:

- **App:** <http://localhost:3000>
- **API documentation:** <http://localhost:8000/docs>

---

## Optional: AI spending summary

The AI summary is **disabled by default**. To turn it on:

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Update `backend/.env`:

   ```dotenv
   AI_SUMMARY_ENABLED=true
   GEMINI_API_KEY=your-key
   GEMINI_MODEL=gemini-2.5-flash
   ```

3. Restart the backend.

To see which models your key supports, visit:

```
https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY
```

**What gets sent:** only the month and the total spent per category. Your transaction notes,
merchant names, individual amounts, and account identifiers are **never** sent.

**Consent:** the app shows a data-use notice and requires you to tick a checkbox before any
request is made. Google's free-tier terms may allow submitted content to be used to improve their
products.

---

## Verify your setup

1. <http://localhost:8000/health> returns `{"status":"ok"}`
2. The backend console shows no warning about a missing database schema
3. You can create an account from the login page
4. Opening **Add transaction** shows the default categories in the dropdown
5. Saving a transaction updates the totals and charts
6. The donut and budget charts render without errors

---

## Troubleshooting

**The Add transaction button is greyed out**
Every transaction needs a category. Add one in the **Create a category** panel, or check **Settings
→ Category settings**. If your account has no categories at all, you created it before running the
SQL in step 2 — either sign up with a new email address, or add categories manually.

**Sign-up confirmation never comes back**
Supabase emails a confirmation link to the Site URL configured in step 5. If you changed ports,
add that port's `/auth/callback` to the Redirect URLs.

**The browser shows a CORS error**
`CORS_ORIGINS` in `backend/.env` must list the exact address you open in the browser, including
the port. For example `http://localhost:3001`. Restart the backend after changing it.

**Everything fails with an error banner**
The database tables are probably missing. Re-run the SQL from step 2. The backend log names the
migration file when this happens.

**The backend crashes with `OSError: [WinError 64]`**
Windows only. Start it with `python run.py` rather than calling `uvicorn` directly.

**The AI summary shows an error**
The message tells you the cause — rate limit (wait a minute and retry), invalid API key, an
unavailable model name, or a slow response.

---

## Security

- `.env`, `frontend/.env.local`, and `backend/.env` are excluded from version control. Only
  `.env.example` placeholder files are committed.
- Never commit real credentials, and never use a Supabase **service-role** key in this project —
  it bypasses the privacy protection that keeps your records private.
- Keep the Gemini key in `backend/.env` only. It must never appear in frontend code.
- CSV exports are sanitized so a malicious note cannot execute as a spreadsheet formula.

---

## Deployment

Free tiers from Vercel, Supabase, and Render are suitable for a personal demo. They typically
sleep when idle and free plans change, so treat them as a demo rather than production hosting.
Configure secrets through your host's environment variable settings — never by committing `.env`
files.