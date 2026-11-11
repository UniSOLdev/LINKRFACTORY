# LINKR Factory

A local, playable operating floor for a simulated LINKR media run. The factory is a Next.js app. Buildings, conveyors, and machine lights read job state. They are not a decorative loop.

Visual identity follows the public LINKR site at [getlinkr.co](https://getlinkr.co): near-black surfaces (`#05070D`), violet accent (`#7C3AED`, `#C4B5FD`), and Inter with tight headlines. This app does not copy LINKR image assets.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Production deploys stay manual. See `docs/systems.md` for which systems are live and which stay simulated.

Other checks:

```bash
npm test
npm run typecheck
npm run build
npm start
```

Without `SUPABASE_DB_URL`, job records are stored in `data/linkr-factory.sqlite` (Node's built-in `node:sqlite`). The file is created on first launch. That file is for local development and tests.

When `SUPABASE_DB_URL` is set, each request loads the factory from Postgres, runs the simulation, and writes it back in one transaction. Anonymous API access is revoked. See `supabase/migrations` and `docs/systems.md`.

Mutations require a signed-in administrator or operator. Copy `.env.example` to `.env.local` and set the session secret plus the three role passwords before using Command locally.

This release uses `node:sqlite` instead of `better-sqlite3` so the durable store does not need a native addon. The warning that SQLite is still marked experimental in Node 22 is expected.

## What is simulated

Every lead, task, deliverable, and dollar on the floor is simulated. The UI says so. Resource records and job outputs keep `simulation: true` and `verified: false`. A simulated result is never marked verified.

The only executor is the simulation adapter. One scripted lead, Elena Voss at Northwind Studio, moves through intake, research, a recoverable research block, qualification, creative preparation, owner approval, and delivery. Owner approval is an in-app action. It does not send email, spend money, deploy, or write to a CRM.

Outreach Station and CRM Command Center can be built inside the simulation. Building them does not connect a live channel.

Planned adapters are named and unimplemented. No client for them is imported. A job that names one is rejected, and it cannot set `verified: true`.

Business agents:

- lead research
- CRM updates
- website work
- marketing assets
- proposals
- reporting

External systems, for a later authorized worker:

- GitHub
- Shopify
- Meta
- Google Drive
- Supabase
- Vercel

A future real adapter would be registered next to the simulation executor. It would still pass through the same job record, audit log, and approval gate. Only that adapter, after a real successful call the owner approved, would be allowed to record a verified result. This release never does that.

## What keeps running

Jobs are rows in SQLite with `id`, `kind`, `inputs`, `outputs`, `status` (`queued`, `running`, `awaiting_approval`, `completed`, `failed`), timestamps, an audit log, and a simulation flag. The Next.js server catches up from those timestamps on every read, and a process timer keeps advancing due work while the server stays up. Closing the browser does not cancel a running simulated job. Approval-gated work stays at `awaiting_approval` until you approve it.

Machine lights are derived from those jobs: idle, working, blocked, awaiting approval, completed.

Upgrading a line station raises its level and the throughput used for the next job on that station.

Missions complete only when the matching simulated job completes.

## Persistence seam

`FactoryRepository` is the server store. `SqliteFactoryRepository` is the only implementation. A later Supabase repository could satisfy the same methods. This app does not provision Supabase.

The browser only remembers UI preferences (selected station, 3D or map) in localStorage. Workflow progress is not stored there.

If WebGL is unavailable, or you switch to Map, the same stations and jobs render as a 2D floor.
