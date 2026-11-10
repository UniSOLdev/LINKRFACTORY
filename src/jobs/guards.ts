import type { FactoryState, JobOutputs, JobRecord } from "@/src/domain/types";
import { WorkflowError } from "@/src/jobs/errors";

export function simulatedOutput(partial: {
  summary: string;
  resources?: JobOutputs["resources"];
  recoverable?: boolean;
  reason?: string;
}): JobOutputs {
  return {
    simulation: true,
    verified: false,
    summary: partial.summary,
    resources: partial.resources,
    recoverable: partial.recoverable,
    reason: partial.reason,
  };
}

export function assertSimulatedJob(job: JobRecord): void {
  if (job.simulation !== true || job.executor !== "simulation") {
    throw new WorkflowError("SIMULATION_ONLY", "Job is missing the simulation flag.");
  }
  if (job.outputs && (job.outputs.simulation !== true || job.outputs.verified !== false)) {
    throw new WorkflowError("SIMULATION_ONLY", "Simulated job output was flagged verified or lost its simulation flag.");
  }
}

export function assertSimulatedFactory(factory: FactoryState): void {
  for (const resource of factory.resources) {
    if (resource.simulation !== true || resource.verified !== false) {
      throw new WorkflowError("SIMULATION_ONLY", "A simulated resource was flagged verified.");
    }
  }
  if (factory.lead && (factory.lead.simulation !== true || factory.lead.verified !== false)) {
    throw new WorkflowError("SIMULATION_ONLY", "A simulated lead was flagged verified.");
  }
}
