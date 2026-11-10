import { MISSION_DEFS, resourceGain } from "@/src/domain/catalog";
import { SIMULATED_LEAD, type FactoryState, type JobDraft, type JobRecord, type LeadState, type StationId } from "@/src/domain/types";

function withLead(factory: FactoryState, patch: Partial<LeadState> & Pick<LeadState, "stage" | "stationId">): FactoryState {
  const base: LeadState = factory.lead ?? {
    id: SIMULATED_LEAD.id,
    name: SIMULATED_LEAD.contactName,
    company: SIMULATED_LEAD.company,
    stage: patch.stage,
    stationId: patch.stationId,
    simulation: true,
    verified: false,
    blockedReason: null,
  };
  return {
    ...factory,
    lead: {
      ...base,
      ...patch,
      simulation: true,
      verified: false,
    },
  };
}

function mapStation(
  factory: FactoryState,
  id: StationId,
  update: (station: FactoryState["stations"][number]) => FactoryState["stations"][number],
): FactoryState {
  return {
    ...factory,
    stations: factory.stations.map((station) => (station.id === id ? update(station) : station)),
  };
}

function addResources(factory: FactoryState, job: JobRecord): FactoryState {
  const gains = job.status === "completed" ? resourceGain(job.kind, job.inputs) : undefined;
  if (!gains) return factory;
  return {
    ...factory,
    resources: factory.resources.map((resource) => {
      const amount = gains[resource.id];
      if (!amount) return resource;
      return { ...resource, amount: resource.amount + amount, simulation: true, verified: false };
    }),
  };
}

function completeMissions(factory: FactoryState, job: JobRecord): FactoryState {
  if (job.status !== "completed") return factory;
  return {
    ...factory,
    missions: factory.missions.map((mission) => {
      if (mission.completedAt) return mission;
      const def = MISSION_DEFS.find((item) => item.id === mission.id);
      if (!def || def.kind !== job.kind) return mission;
      if (job.kind === "lead.research" && job.inputs.phase !== "resume") return mission;
      return { ...mission, completedAt: job.finishedAt, evidenceJobId: job.id };
    }),
  };
}

export function reduceStart(factory: FactoryState, job: JobRecord): FactoryState {
  if (job.kind === "lead.intake") {
    const workflowId = typeof job.inputs.workflowId === "string" ? job.inputs.workflowId : factory.workflow.id;
    return {
      ...withLead(factory, {
        id: SIMULATED_LEAD.id,
        name: SIMULATED_LEAD.contactName,
        company: SIMULATED_LEAD.company,
        stage: "intake",
        stationId: "intake",
        blockedReason: null,
      }),
      workflow: { id: workflowId, status: "running" },
    };
  }
  if (job.kind === "lead.research") {
    return {
      ...withLead(factory, { stage: "research", stationId: "research", blockedReason: null }),
      workflow: { ...factory.workflow, status: "running" },
    };
  }
  if (job.kind === "lead.qualify") {
    return {
      ...withLead(factory, { stage: "qualification", stationId: "qualification", blockedReason: null }),
      workflow: { ...factory.workflow, status: "running" },
    };
  }
  if (job.kind === "creative.prepare") {
    return {
      ...withLead(factory, { stage: "creative", stationId: "creative", blockedReason: null }),
      workflow: { ...factory.workflow, status: "running" },
    };
  }
  if (job.kind === "approval.request") {
    return {
      ...withLead(factory, { stage: "awaiting_approval", stationId: "approval", blockedReason: null }),
      workflow: { ...factory.workflow, status: "awaiting_approval" },
    };
  }
  if (job.kind === "delivery.complete") {
    return {
      ...withLead(factory, { stage: "delivery", stationId: "delivery", blockedReason: null }),
      workflow: { ...factory.workflow, status: factory.workflow.status === "completed" ? "completed" : "running" },
    };
  }
  if (job.kind === "workflow.resolve_block" && factory.lead) {
    return {
      ...withLead(factory, { stage: "research", stationId: "research", blockedReason: null }),
      workflow: { ...factory.workflow, status: "running" },
    };
  }
  return factory;
}

export function planSequel(job: JobRecord): JobDraft | null {
  if (job.status !== "completed") return null;
  const leadId = typeof job.inputs.leadId === "string" ? job.inputs.leadId : SIMULATED_LEAD.id;
  const workflowId = job.inputs.workflowId;
  const shared = { leadId, workflowId };
  switch (job.kind) {
    case "lead.intake":
      return { kind: "lead.research", inputs: { ...shared, stationId: "research", phase: "initial" } };
    case "lead.research":
      if (job.inputs.phase !== "resume") return null;
      return { kind: "lead.qualify", inputs: { ...shared, stationId: "qualification" } };
    case "workflow.resolve_block":
      return {
        kind: "lead.research",
        inputs: { ...shared, stationId: "research", phase: "resume", failedJobId: job.inputs.failedJobId },
      };
    case "lead.qualify":
      return { kind: "creative.prepare", inputs: { ...shared, stationId: "creative" } };
    case "creative.prepare":
      return { kind: "approval.request", inputs: { ...shared, stationId: "approval" } };
    case "approval.request":
      return { kind: "delivery.complete", inputs: { ...shared, stationId: "delivery" } };
    default:
      return null;
  }
}

export function reduceTerminal(factory: FactoryState, job: JobRecord): FactoryState {
  if (job.status === "failed" && job.outputs?.recoverable) {
    return {
      ...withLead(factory, {
        stage: "blocked",
        stationId: "research",
        blockedReason: job.outputs.reason ?? "The simulation is blocked.",
      }),
      workflow: { ...factory.workflow, status: "blocked" },
    };
  }
  if (job.status !== "completed") return factory;

  let next = addResources(factory, job);
  next = completeMissions(next, job);

  if (job.kind === "station.build" && typeof job.inputs.stationId === "string") {
    next = mapStation(next, job.inputs.stationId as StationId, (station) => ({ ...station, built: true }));
  }
  if (job.kind === "station.upgrade" && typeof job.inputs.stationId === "string") {
    next = mapStation(next, job.inputs.stationId as StationId, (station) => ({ ...station, level: station.level + 1 }));
  }
  if (job.kind === "station.configure" && typeof job.inputs.stationId === "string") {
    const config = job.inputs.config;
    if (config && typeof config === "object") {
      const record = config as { mode?: unknown; shift?: unknown };
      next = mapStation(next, job.inputs.stationId as StationId, (station) => ({
        ...station,
        config: {
          mode: "simulation-only",
          shift: record.shift === "night" ? "night" : "day",
        },
      }));
    }
  }
  if (job.kind === "delivery.complete") {
    next = {
      ...withLead(next, { stage: "completed", stationId: "delivery", blockedReason: null }),
      workflow: { ...next.workflow, status: "completed" },
    };
  }
  return next;
}
