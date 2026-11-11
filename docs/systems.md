# Connected and simulated systems

This release reads two live systems and stores the factory in Postgres. It does not perform external business writes.

| System | Status in this release | What it can do | What it cannot do |
| --- | --- | --- | --- |
| GitHub | Connected, read-only, when `https://api.github.com/repos/UniSOLdev/LINKRFACTORY/commits/main` returns a commit | Show the latest `main` commit SHA, message, and time | Push, merge, open a pull request, or change settings |
| Vercel | Connected, read-only, only while the app is running on Vercel | Show the platform-injected environment, git ref, host, and commit SHA | Deploy, promote, roll back, or change project settings |
| Supabase Postgres | Connected for factory persistence when `SUPABASE_DB_URL` is set and `select 1` succeeds | Store layouts, stations, workflows, jobs, resources, missions, and audit events | Customer-data writes, storage uploads, or auth-user changes |
| Shopify | NOT CONNECTED | None | Catalog, orders, and payments |
| Meta | NOT CONNECTED | None | Publishing and advertising spend |
| Google Drive | NOT CONNECTED | None | File reads and writes |
| Cursor and Muse | NOT CONNECTED | None | Agent actions |
| Simulation adapter | Always on for factory jobs | Move Elena Voss / Northwind Studio through the scripted floor | Mark a result verified or call an outside system |

## How to tell the records apart

- Factory jobs are stored with `simulation = true` and `executor = simulation`. Database checks reject anything else.
- Job outputs keep `verified = false`.
- The operations board counts simulated jobs and verified jobs separately. Verified jobs stay at zero in this release.
- GitHub and Vercel rows show `Connected` only after a response or platform-injected deployment value is present. Every other integration shows `NOT CONNECTED` until it is configured and tested.
- `writesEnabled` is false on every planned executor and every future worker contract.

## Who can change the factory

Sign-in uses an HttpOnly session cookie. Passwords stay in deployment environment variables and are not written into the repository.

| Role | Create jobs | Approve | Reset |
| --- | --- | --- | --- |
| Administrator | Yes | Yes | Yes |
| Operator | Yes | No | No |
| Viewer | No | No | No |

Reading the floor and the operations board does not require a session. Creating a job, approving one, and resetting the factory do. Repeated mutations are limited per address.

## Approval policy

Read-only monitoring can run without an extra approval. External writes, advertising spend, payments, and production deployments require a future owner-approved worker. No such worker is registered. The command center cannot turn one on.

## Persistence

The durable store is the `linkr_factory` schema in the `linkr-factory` Supabase project. Row-level security is enabled. The anonymous and authenticated API roles have no grants. The app uses a dedicated `linkr_app` login that is not the service role.

Local tests still use SQLite or the in-memory repository. They do not require the hosted database. A Vercel deployment without `SUPABASE_DB_URL` does not pretend that temporary disk is durable.
