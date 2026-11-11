import { Pool, type PoolClient } from "pg";
import type { FactoryState, JobRecord } from "@/src/domain/types";
import { assertSimulatedFactory, assertSimulatedJob } from "@/src/jobs/guards";
import { MemoryFactoryRepository } from "@/src/jobs/memory-repository";

const LOCK_KEY = 814220;

const globalStore = globalThis as unknown as { __linkrPool?: Pool };

function pool(): Pool {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL is not set.");
  if (!globalStore.__linkrPool) {
    globalStore.__linkrPool = new Pool({
      connectionString,
      max: 1,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8_000,
      idleTimeoutMillis: 20_000,
    });
  }
  return globalStore.__linkrPool;
}

function actorFromDetail(detail: string): string {
  const match = /^Signed-in (administrator|operator|viewer)\b/.exec(detail);
  return match?.[1] ?? "simulation";
}

async function hydrate(client: PoolClient, memory: MemoryFactoryRepository): Promise<void> {
  const factoryRow = await client.query<{ payload: FactoryState }>(
    "select payload from linkr_factory.factory_state where id = 1",
  );
  const jobRows = await client.query<{ payload: JobRecord }>(
    "select payload from linkr_factory.jobs order by updated_at asc, id asc",
  );
  const jobs = jobRows.rows.map((row) => row.payload);
  if (!factoryRow.rows[0]) return;
  memory.replaceState(factoryRow.rows[0].payload, jobs);
}

async function persist(client: PoolClient, memory: MemoryFactoryRepository): Promise<void> {
  const { factory, jobs } = memory.exportState();
  assertSimulatedFactory(factory);
  for (const job of jobs) assertSimulatedJob(job);

  await client.query(
    `insert into linkr_factory.factory_state (id, payload, updated_at)
     values (1, $1::jsonb, now())
     on conflict (id) do update set payload = excluded.payload, updated_at = now()`,
    [JSON.stringify(factory)],
  );

  const ids = jobs.map((job) => job.id);
  await client.query("delete from linkr_factory.jobs where not (id = any($1::text[]))", [ids]);
  for (const job of jobs) {
    await client.query(
      `insert into linkr_factory.jobs (id, kind, status, simulation, payload, updated_at)
       values ($1, $2, $3, true, $4::jsonb, $5)
       on conflict (id) do update set
         kind = excluded.kind,
         status = excluded.status,
         simulation = true,
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
      [job.id, job.kind, job.status, JSON.stringify(job), job.updatedAt],
    );
    for (const entry of job.audit) {
      await client.query(
        `insert into linkr_factory.audit_events (at, actor, action, detail, job_id, simulation, verified)
         values ($1, $2, $3, $4, $5, true, false)
         on conflict (job_id, action, at) do nothing`,
        [entry.at, actorFromDetail(entry.detail), entry.action, entry.detail, job.id],
      );
    }
  }
}

/** Hold one transaction, run the synchronous factory engine, then write the result back. */
export async function withPostgresFactory<T>(fn: (memory: MemoryFactoryRepository) => T): Promise<T> {
  const client = await pool().connect();
  const memory = new MemoryFactoryRepository();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [LOCK_KEY]);
    await hydrate(client, memory);
    const result = fn(memory);
    await persist(client, memory);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function postgresPing(): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!process.env.SUPABASE_DB_URL) return { ok: false, message: "SUPABASE_DB_URL is not set." };
  try {
    const result = await pool().query<{ ok: number }>("select 1 as ok");
    if (result.rows[0]?.ok !== 1) return { ok: false, message: "Database did not return the expected check." };
    return { ok: true };
  } catch {
    return { ok: false, message: "Database check failed." };
  }
}
