import { PLANNED_EXECUTORS } from "@/src/domain/catalog";
import { WorkflowError } from "@/src/jobs/errors";
import { simulationExecutor, type JobExecutor } from "@/src/jobs/simulation-executor";

const SIMULATION_ID = "simulation";

/**
 * The only executor that can run in this release.
 * Planned external workers are named so a future authorized agent can be
 * registered beside the simulation adapter. Registering one is not enough to
 * go live: the owner must approve the job, and only a real adapter may set
 * verified to true. This file does not import or call GitHub, Shopify, Meta,
 * Google Drive, Supabase, or Vercel.
 */
export function resolveExecutor(requested: string | undefined): JobExecutor {
  if (!requested || requested === SIMULATION_ID) return simulationExecutor;
  const planned = PLANNED_EXECUTORS.find((executor) => executor.id === requested);
  const label = planned?.purpose ?? requested;
  throw new WorkflowError(
    "SIMULATION_ONLY",
    `${label} is not connected. The ${requested} executor is not available in this release.`,
  );
}

export function registeredExecutorIds(): string[] {
  return [SIMULATION_ID];
}
