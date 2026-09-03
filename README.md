# EdusyncHub

EdusyncHub is a platform for teachers to publish and manage exam papers /
learning materials, with subscription-based access for students and
M-PESA payouts for teacher earnings.

> **Note:** This README is scaffolded from the current repo structure.
> Adjust the "What it does" section and any assumptions below if they're
> off — I don't have the product spec, just the file layout.

## Monorepo structure

```
EdusyncHub/
├── backend/            # Express + TypeScript API
│   ├── src/
│   │   ├── middleware/
│   │   │   ├── auth.ts                  # requireAuth
│   │   │   └── requireActiveSubscription.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── papers.ts
│   │   │   ├── subscriptions.ts
│   │   │   └── wallet.ts                # balance + M-PESA withdrawals via IntaSend
│   │   └── index.ts
│   ├── schema.sql
│   ├── .env.example
│   └── package.json
└── frontend/           # Next.js (App Router) + TypeScript
    ├── app/
    ├── components/
    ├── context/
    ├── lib/
    └── package.json
```

## Tech stack

- **Frontend:** Next.js (App Router), TypeScript, [next/font](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) with Geist
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL (see `backend/schema.sql`)
- **Payments:** IntaSend (M-PESA B2C payouts for teacher wallet withdrawals)
- **Deployment:** Render (backend) + Vercel (frontend) + Neon (Postgres) — *adjust if you're deploying differently*

## Getting started

### Prerequisites

- Node.js 18+
- npm / pnpm / yarn / bun
- A PostgreSQL database (e.g. [Neon](https://neon.tech))
- An [IntaSend](https://intasend.com) account (sandbox keys are fine for local dev)

### 1. Backend setup

```bash
cd backend
npm install
cp .env.example .env
# fill in DATABASE_URL, JWT secret, INTASEND_SECRET_KEY,
# INTASEND_PUBLISHABLE_KEY, INTASEND_ENV, etc.
```

Run the schema against your database:

```bash
psql "$DATABASE_URL" -f schema.sql
```

Start the API:

```bash
npm run dev
```

### 2. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env.local   # if present
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app. The
frontend expects the backend API to be running (check `lib/` for the
configured API base URL).

## Environment variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign/verify auth tokens |
| `INTASEND_SECRET_KEY` | IntaSend secret key (payouts) |
| `INTASEND_PUBLISHABLE_KEY` | IntaSend publishable key |
| `INTASEND_ENV` | `test` or `live` |

*(Cross-check against `backend/.env.example` — fill in anything I've missed.)*

## API overview

| Route | Purpose |
|---|---|
| `POST /auth/*` | Signup / login / auth flows |
| `GET/POST /papers/*` | Exam paper / material management |
| `GET/POST /subscriptions/*` | Student subscription management |
| `GET /wallet/balance` | Teacher's available balance |
| `POST /wallet/withdraw` | Initiate an M-PESA payout via IntaSend |
| `POST /wallet/webhooks/intasend-payout` | IntaSend payout status webhook |

Routes behind `requireActiveSubscription` middleware are gated on the
student/teacher having an active subscription.

## Deployment

- **Frontend:** deploy on [Vercel](https://vercel.com/new) — connect the repo and set the root directory to `frontend/`.
- **Backend:** deploy on [Render](https://render.com) — set the root directory to `backend/`, build command `npm run build`, start command `npm start`, and configure the env vars above.
- **Database:** [Neon](https://neon.tech) Postgres, connected via `DATABASE_URL`.

## Contributing

This is currently a single-maintainer project (Mosynctechnologies). Open
an issue or reach out directly before submitting a PR.