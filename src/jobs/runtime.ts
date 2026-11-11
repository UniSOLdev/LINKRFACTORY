import path from "path";
import { buildSnapshot, type FactorySnapshot } from "@/src/domain/derive";
import type { JobRecord } from "@/src/domain/types";
import { pullDatabase, pushDatabase } from "@/src/jobs/blob-sync";
import { approveJob, catchUp, createClientJob, readJob, resetSimulation } from "@/src/jobs/runner";
import type { FactoryRepository } from "@/src/jobs/repository";
import { withPostgresFactory } from "@/src/jobs/postgres-store";
import { SqliteFactoryRepository } from "@/src/jobs/sqlite-repository";

const globalStore = globalThis as unknown as {
  __linkrRepo?: FactoryRepository;
  __linkrTimer?: ReturnType<typeof setInterval>;
};

function dbFile(): string {
  if (process.env.LINKR_DB_PATH) return process.env.LINKR_DB_PATH;
  if (process.env.VERCEL) return "/tmp/linkr-factory.sqlite";
  return path.join(process.cwd(), "data", "linkr-factory.sqlite");
}

function closeRepo(): void {
  const repo = globalStore.__linkrRepo;
  if (repo && "close" in repo && typeof repo.close === "function") repo.close();
  globalStore.__linkrRepo = undefined;
}

/** Load the latest saved factory, run the handler, then write it back. */
export async function withFactory<T>(fn: () => T): Promise<T> {
  if (process.env.SUPABASE_DB_URL) {
    return withPostgresFactory((memory) => {
      const previous = globalStore.__linkrRepo;
      globalStore.__linkrRepo = memory;
      try {
        return fn();
      } finally {
        globalStore.__linkrRepo = previous;
      }
    });
  }
  const file = dbFile();
  try {
    await pullDatabase(file, closeRepo);
  } catch (error) {
    console.error("[linkr] blob pull failed", error);
  }
  try {
    return fn();
  } finally {
    try {
      await pushDatabase(file);
    } catch (error) {
      console.error("[linkr] blob push failed", error);
    }
  }
}

export function getRepo(): FactoryRepository {
  if (!globalStore.__linkrRepo) {
    globalStore.__linkrRepo = new SqliteFactoryRepository(dbFile());
  }
  return globalStore.__linkrRepo;
}

/** Keep advancing due jobs while the server process is up, even if the browser is closed. */
export function ensureTicker(): void {
  if (process.env.VERCEL || process.env.SUPABASE_DB_URL) return;
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

export function createFactoryJob(
  body: { kind?: unknown; inputs?: unknown; simulation?: unknown },
  actor?: string,
): JobRecord {
  ensureTicker();
  return createClientJob(getRepo(), body, Date.now(), actor);
}

export function approveFactoryJob(id: string, actor?: string): JobRecord {
  ensureTicker();
  return approveJob(getRepo(), id, Date.now(), actor);
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
