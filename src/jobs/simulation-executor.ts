import { resourceGain } from "@/src/domain/catalog";
import type { JobKind, JobOutputs, JobRecord } from "@/src/domain/types";
import { WorkflowError } from "@/src/jobs/errors";
import { simulatedOutput } from "@/src/jobs/guards";

/**
 * Executor seam. Only the simulation adapter is registered.
 * Planned adapters (lead research, CRM, website, marketing, proposals,
 * reporting) are listed for a later authorized integration and are not implemented.
 */
export interface JobExecutor {
  readonly id: "simulation";
  supports(kind: JobKind): boolean;
  finish(job: JobRecord): { status: "completed" | "failed"; outputs: JobOutputs };
}

function summaryFor(job: JobRecord): string {
  switch (job.kind) {
    case "lead.intake":
      return "Simulated lead Elena Voss entered from an NFC tap. Not a verified contact.";
    case "lead.research":
      return "Simulated research packet prepared. Not verified business data.";
    case "lead.qualify":
      return "Simulated opportunity qualified. Not a verified deal.";
    case "creative.prepare":
      return "Simulated proposal prepared for owner approval. It was not sent.";
    case "delivery.complete":
      return "Simulated deliverable marked complete. Revenue is not a verified sale.";
    case "station.build":
      return "Station commissioned inside the simulation. No external system was changed.";
    case "station.upgrade":
      return "Simulated throughput increased for this station.";
    case "station.configure":
      return "Simulation profile saved on this station. No live configuration was pushed.";
    case "workflow.resolve_block":
      return "Block cleared inside the simulation. Research can resume.";
    default:
      return "Simulation step finished.";
  }
}

export const simulationExecutor: JobExecutor = {
  id: "simulation",
  supports() {
    return true;
  },
  finish(job) {
    if (job.kind === "approval.request") {
      throw new WorkflowError("APPROVAL_REQUIRED", "The simulation adapter cannot pass an approval gate.");
    }
    if (job.simulation !== true) {
      throw new WorkflowError("SIMULATION_ONLY", "The simulation adapter refused a job that is not marked simulated.");
    }
    if (job.kind === "lead.research" && job.inputs.phase !== "resume") {
      return {
        status: "failed",
        outputs: simulatedOutput({
          summary: "Research blocked: the simulated source packet is missing.",
          recoverable: true,
          reason: "Missing source packet for Northwind Studio. Resolve the block to continue the simulation.",
        }),
      };
    }
    return {
      status: "completed",
      outputs: simulatedOutput({
        summary: summaryFor(job),
        resources: resourceGain(job.kind, job.inputs),
      }),
    };
  },
};
