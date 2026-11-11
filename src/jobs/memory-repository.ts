import type { FactoryState, JobRecord } from "@/src/domain/types";
import { initialFactory } from "@/src/domain/seed";
import { assertSimulatedFactory, assertSimulatedJob } from "@/src/jobs/guards";
import type { FactoryRepository } from "@/src/jobs/repository";

/** In-memory store used inside one Postgres transaction. Unit tests can use it directly. */
export class MemoryFactoryRepository implements FactoryRepository {
  private factory: FactoryState;
  private readonly jobs = new Map<string, JobRecord>();

  constructor(factory: FactoryState = initialFactory(), jobs: JobRecord[] = []) {
    this.factory = structuredClone(factory);
    for (const job of jobs) this.jobs.set(job.id, structuredClone(job));
  }

  exportState(): { factory: FactoryState; jobs: JobRecord[] } {
    return {
      factory: structuredClone(this.factory),
      jobs: [...this.jobs.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id)),
    };
  }

  replaceState(factory: FactoryState, jobs: JobRecord[]): void {
    assertSimulatedFactory(factory);
    for (const job of jobs) assertSimulatedJob(job);
    this.factory = structuredClone(factory);
    this.jobs.clear();
    for (const job of jobs) this.jobs.set(job.id, structuredClone(job));
  }

  getJob(id: string): JobRecord | null {
    const job = this.jobs.get(id);
    return job ? structuredClone(job) : null;
  }

  listJobs(): JobRecord[] {
    return [...this.jobs.values()]
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id))
      .map((job) => structuredClone(job));
  }

  saveJob(job: JobRecord): void {
    assertSimulatedJob(job);
    this.jobs.set(job.id, structuredClone(job));
  }

  getFactory(): FactoryState {
    return structuredClone(this.factory);
  }

  saveFactory(state: FactoryState): void {
    assertSimulatedFactory(state);
    this.factory = structuredClone(state);
  }

  transaction<T>(fn: () => T): T {
    return fn();
  }

  reset(seed: FactoryState): void {
    assertSimulatedFactory(seed);
    this.factory = structuredClone(seed);
    this.jobs.clear();
  }

  close(): void {}
}
