import path from "path";
import { buildSnapshot, type FactorySnapshot } from "@/src/domain/derive";
import type { JobRecord } from "@/src/domain/types";
import { approveJob, catchUp, createClientJob, readJob, resetSimulation } from "@/src/jobs/runner";
import type { FactoryRepository } from "@/src/jobs/repository";
import { SqliteFactoryRepository } from "@/src/jobs/sqlite-repository";

const globalStore = globalThis as unknown as {
  __linkrRepo?: FactoryRepository;
  __linkrTimer?: ReturnType<typeof setInterval>;
};

function dbFile(): string {
  return process.env.LINKR_DB_PATH ?? path.join(process.cwd(), "data", "linkr-factory.sqlite");
}

export function getRepo(): FactoryRepository {
  if (!globalStore.__linkrRepo) {
    globalStore.__linkrRepo = new SqliteFactoryRepository(dbFile());
  }
  return globalStore.__linkrRepo;
}

/** Keep advancing due jobs while the server process is up, even if the browser is closed. */
export function ensureTicker(): void {
  if (globalStore.__linkrTimer) return;
  const timer = setInterval(() => {
    try {
      catchUp(getRepo(), Date.now());
    } catch (error) {
      console.error("[linkr] job ticker failed", error);
    }
  }, 400);
  timer.unref?.();
  globalStore.__linkrTimer = timer;
}

export function readFactorySnapshot(): FactorySnapshot {
  ensureTicker();
  const repo = getRepo();
  const now = Date.now();
  catchUp(repo, now);
  return buildSnapshot(repo.getFactory(), repo.listJobs(), now);
}

export function createFactoryJob(body: { kind?: unknown; inputs?: unknown; simulation?: unknown }): JobRecord {
  ensureTicker();
  return createClientJob(getRepo(), body, Date.now());
}

export function approveFactoryJob(id: string): JobRecord {
  ensureTicker();
  return approveJob(getRepo(), id, Date.now());
}

export function readFactoryJob(id: string): JobRecord {
  ensureTicker();
  catchUp(getRepo(), Date.now());
  return readJob(getRepo(), id);
}

export function resetFactory(): FactorySnapshot {
  ensureTicker();
  resetSimulation(getRepo());
  return readFactorySnapshot();
}
