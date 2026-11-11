import {
  JOB_KINDS,
  RESOURCE_IDS,
  STATION_IDS,
  type JobKind,
  type ResourceId,
  type StationId,
} from "@/src/domain/types";

export function isJobKind(value: string): value is JobKind {
  return (JOB_KINDS as readonly string[]).includes(value);
}

export function isStationId(value: string): value is StationId {
  return (STATION_IDS as readonly string[]).includes(value);
}

export function isResourceId(value: string): value is ResourceId {
  return (RESOURCE_IDS as readonly string[]).includes(value);
}

export const BASE_DURATION_MS: Record<JobKind, number> = {
  "lead.intake": 2800,
  "lead.research": 3200,
  "lead.qualify": 2800,
  "creative.prepare": 3200,
  "approval.request": 0,
  "delivery.complete": 2600,
  "station.build": 2400,
  "station.upgrade": 1800,
  "station.configure": 1000,
  "workflow.resolve_block": 1600,
};

const SCALED_KINDS = new Set<JobKind>([
  "lead.intake",
  "lead.research",
  "lead.qualify",
  "creative.prepare",
  "delivery.complete",
]);

export function scaledDuration(kind: JobKind, level: number): number {
  const base = BASE_DURATION_MS[kind];
  if (!SCALED_KINDS.has(kind)) return base;
  const factor = 1 / (1 + Math.max(0, level - 1) * 0.45);
  return Math.max(600, Math.round(base * factor));
}

export function throughputPerMinute(kind: JobKind, level: number): number {
  const ms = scaledDuration(kind, level);
  if (ms <= 0) return 0;
  return Math.round((60000 / ms) * 10) / 10;
}

export interface StationDef {
  id: StationId;
  name: string;
  shortName: string;
  summary: string;
  dependencies: string[];
  primaryKind: JobKind;
}

export const STATION_DEFS: Record<StationId, StationDef> = {
  intake: {
    id: "intake",
    name: "Lead Intake Dock",
    shortName: "Intake",
    summary: "Receives one simulated lead from an NFC-style tap. No live form is connected.",
    dependencies: ["Owner starts the simulated run."],
    primaryKind: "lead.intake",
  },
  research: {
    id: "research",
    name: "Research Laboratory",
    shortName: "Research",
    summary: "Prepares a simulated research packet. The lead-research agent is not connected.",
    dependencies: ["Lead Intake Dock"],
    primaryKind: "lead.research",
  },
  qualification: {
    id: "qualification",
    name: "Qualification Engine",
    shortName: "Qualify",
    summary: "Scores the simulated lead into an opportunity. This is not a verified deal.",
    dependencies: ["Research Laboratory"],
    primaryKind: "lead.qualify",
  },
  creative: {
    id: "creative",
    name: "Creative Studio",
    shortName: "Creative",
    summary: "Prepares a simulated proposal. The proposals agent is not connected and nothing is sent.",
    dependencies: ["Qualification Engine"],
    primaryKind: "creative.prepare",
  },
  approval: {
    id: "approval",
    name: "Approval Control Tower",
    shortName: "Approval",
    summary: "Holds the run until the owner approves it in this app. Approval does not spend, send, or deploy.",
    dependencies: ["Creative Studio", "Owner approval"],
    primaryKind: "approval.request",
  },
  outreach: {
    id: "outreach",
    name: "Outreach Station",
    shortName: "Outreach",
    summary: "Shell for a future outreach agent. This release does not send messages.",
    dependencies: ["Build the station.", "Live outreach is not connected."],
    primaryKind: "station.build",
  },
  crm: {
    id: "crm",
    name: "CRM Command Center",
    shortName: "CRM",
    summary: "Shell for a future CRM agent. This release does not write to a CRM.",
    dependencies: ["Build the station.", "CRM sync is not connected."],
    primaryKind: "station.build",
  },
  delivery: {
    id: "delivery",
    name: "Delivery & Revenue Station",
    shortName: "Delivery",
    summary: "Closes the simulated deliverable and records simulated revenue. Not a verified sale.",
    dependencies: ["Approval Control Tower"],
    primaryKind: "delivery.complete",
  },
};

export interface ResourceDef {
  id: ResourceId;
  name: string;
  unit: string;
  definition: string;
}

export const RESOURCE_DEFS: Record<ResourceId, ResourceDef> = {
  leads: {
    id: "leads",
    name: "Leads",
    unit: "",
    definition: "Simulated contacts that entered the intake dock. Not a verified pipeline.",
  },
  verifiedData: {
    id: "verifiedData",
    name: "Verified Data",
    unit: "",
    definition:
      "Simulated research packets. The label is the resource name inside the sim. These notes are not verified business data.",
  },
  opportunities: {
    id: "opportunities",
    name: "Opportunities",
    unit: "",
    definition: "Simulated qualifications. Not verified deals.",
  },
  tasks: {
    id: "tasks",
    name: "Tasks",
    unit: "",
    definition: "Simulated production tasks created by the run. Not assignments in an external tracker.",
  },
  productionCapacity: {
    id: "productionCapacity",
    name: "Production Capacity",
    unit: "",
    definition: "Simulated line capacity. Upgrades raise station throughput inside this factory only.",
  },
  completedDeliverables: {
    id: "completedDeliverables",
    name: "Completed Deliverables",
    unit: "",
    definition: "Simulated packages marked complete after owner approval. Not delivered to a client.",
  },
  revenue: {
    id: "revenue",
    name: "Revenue",
    unit: "USD",
    definition: "Simulated dollars from the delivery step. Not a verified sale, invoice, or payout.",
  },
};

export interface MissionDef {
  id: string;
  title: string;
  description: string;
  kind: JobKind;
}

export const MISSION_DEFS: MissionDef[] = [
  {
    id: "complete-research",
    title: "Complete research",
    description: "Finish the simulated research packet after the block is cleared.",
    kind: "lead.research",
  },
  {
    id: "qualify-lead",
    title: "Qualify the lead",
    description: "Turn the simulated lead into an opportunity.",
    kind: "lead.qualify",
  },
  {
    id: "prepare-proposal",
    title: "Prepare a proposal",
    description: "Prepare a simulated proposal in the creative studio.",
    kind: "creative.prepare",
  },
  {
    id: "resolve-block",
    title: "Resolve a block",
    description: "Clear the research block. The run stays paused until you do.",
    kind: "workflow.resolve_block",
  },
  {
    id: "approve",
    title: "Approve the run",
    description: "Approve the simulated proposal in the app. This does not send it.",
    kind: "approval.request",
  },
  {
    id: "improve-capacity",
    title: "Improve capacity",
    description: "Upgrade a built station so later work on that station finishes faster.",
    kind: "station.upgrade",
  },
];

/**
 * Future workers. None of these are constructed or called.
 * A later authorized adapter may perform real work only after the owner approves
 * that job. Until then every factory job stays on the simulation executor,
 * with simulation true and verified false.
 */
const planned = (
  id: string,
  system: string,
  purpose: string,
  approvalPolicy: "owner" | "none",
) =>
  ({
    id,
    system,
    purpose,
    implemented: false as const,
    verifiedExecution: false as const,
    writesEnabled: false as const,
    approvalPolicy,
  }) as const;

export const PLANNED_EXECUTORS = [
  planned("lead-research", "agent", "Authorized lead research", "owner"),
  planned("crm", "agent", "CRM updates", "owner"),
  planned("website", "agent", "Website work", "owner"),
  planned("marketing", "agent", "Marketing assets", "owner"),
  planned("proposals", "agent", "Proposals", "owner"),
  planned("reporting", "agent", "Reporting", "owner"),
  planned("github", "github", "GitHub repository work", "owner"),
  planned("shopify", "shopify", "Shopify store operations", "owner"),
  planned("meta", "meta", "Meta publishing", "owner"),
  planned("google-drive", "google-drive", "Google Drive files", "owner"),
  planned("supabase", "supabase", "Supabase data", "owner"),
  planned("vercel", "vercel", "Vercel deploys", "owner"),
] as const;

export function resourceGain(kind: JobKind, inputs: Record<string, unknown>): Partial<Record<ResourceId, number>> | undefined {
  if (kind === "lead.intake") return { leads: 1 };
  if (kind === "lead.research" && inputs.phase === "resume") return { verifiedData: 1 };
  if (kind === "lead.qualify") return { opportunities: 1 };
  if (kind === "creative.prepare") return { tasks: 1 };
  if (kind === "workflow.resolve_block") return { tasks: 1 };
  if (kind === "station.upgrade") return { productionCapacity: 1 };
  if (kind === "delivery.complete") return { completedDeliverables: 1, revenue: 4800 };
  return undefined;
}

export function taskTitle(kind: JobKind, inputs: Record<string, unknown>): string {
  switch (kind) {
    case "lead.intake":
      return "Intake simulated lead";
    case "lead.research":
      return inputs.phase === "resume" ? "Finish research packet" : "Research simulated lead";
    case "lead.qualify":
      return "Qualify simulated lead";
    case "creative.prepare":
      return "Prepare simulated proposal";
    case "approval.request":
      return "Owner approval";
    case "delivery.complete":
      return "Close simulated deliverable";
    case "station.build":
      return "Build station";
    case "station.upgrade":
      return "Upgrade throughput";
    case "station.configure":
      return "Save simulation profile";
    case "workflow.resolve_block":
      return "Resolve research block";
    default:
      return kind;
  }
}
