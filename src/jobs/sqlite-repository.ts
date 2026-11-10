import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import type { FactoryState, JobRecord } from "@/src/domain/types";
import { initialFactory } from "@/src/domain/seed";
import { assertSimulatedFactory, assertSimulatedJob } from "@/src/jobs/guards";
import type { FactoryRepository } from "@/src/jobs/repository";

/**
 * Durable job store. Records live in a SQLite file so a run keeps its
 * place when the browser closes and the Node process stays up, and so a
 * later process can catch up from timestamps.
 */
export class SqliteFactoryRepository implements FactoryRepository {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    const journal = process.env.VERCEL ? "DELETE" : "WAL";
    this.db.exec(`
      PRAGMA journal_mode = ${journal};
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        simulation INTEGER NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS factory (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        payload TEXT NOT NULL
      );
    `);
    const existing = this.db.prepare("SELECT payload FROM factory WHERE id = 1").get();
    if (!existing) {
      this.saveFactory(initialFactory());
    }
  }

  getJob(id: string): JobRecord | null {
    const row = this.db.prepare("SELECT payload FROM jobs WHERE id = ?").get(id);
    if (!row) return null;
    return parseJob(String(row.payload));
  }

  listJobs(): JobRecord[] {
    const rows = this.db.prepare("SELECT payload FROM jobs ORDER BY updated_at ASC, id ASC").all();
    return rows.map((row) => parseJob(String(row.payload)));
  }

  saveJob(job: JobRecord): void {
    assertSimulatedJob(job);
    this.db
      .prepare(
        `INSERT INTO jobs (id, kind, status, simulation, payload, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind,
           status = excluded.status,
           simulation = 1,
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
      )
      .run(job.id, job.kind, job.status, JSON.stringify(job), job.updatedAt);
  }

  getFactory(): FactoryState {
    const row = this.db.prepare("SELECT payload FROM factory WHERE id = 1").get();
    if (!row) return initialFactory();
    const factory = JSON.parse(String(row.payload)) as FactoryState;
    assertSimulatedFactory(factory);
    return factory;
  }

  saveFactory(state: FactoryState): void {
    assertSimulatedFactory(state);
    this.db
      .prepare(
        `INSERT INTO factory (id, payload) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
      )
      .run(JSON.stringify(state));
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  reset(seed: FactoryState): void {
    this.transaction(() => {
      this.db.exec("DELETE FROM jobs");
      this.saveFactory(seed);
    });
  }

  close(): void {
    this.db.close();
  }
}

function parseJob(payload: string): JobRecord {
  const job = JSON.parse(payload) as JobRecord;
  assertSimulatedJob(job);
  return job;
}
