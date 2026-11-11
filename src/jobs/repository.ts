import type { FactoryState, JobRecord } from "@/src/domain/types";

/**
 * Persistence port for factory jobs and workflow state.
 * SqliteFactoryRepository serves local development and unit tests.
 * When SUPABASE_DB_URL is set, requests load this same interface from Postgres
 * for the duration of one transaction. External business adapters stay off.
 */
export interface FactoryRepository {
  getJob(id: string): JobRecord | null;
  listJobs(): JobRecord[];
  saveJob(job: JobRecord): void;
  getFactory(): FactoryState;
  saveFactory(state: FactoryState): void;
  transaction<T>(fn: () => T): T;
  reset(seed: FactoryState): void;
  close(): void;
}
