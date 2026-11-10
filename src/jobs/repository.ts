import type { FactoryState, JobRecord } from "@/src/domain/types";

/**
 * Persistence port for factory jobs and workflow state.
 * SqliteFactoryRepository is the only implementation in this release.
 * A later SupabaseFactoryRepository can satisfy the same methods.
 * This app does not provision Supabase.
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
