export const JOB_STATUSES = [
  "queued",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_KINDS = [
  "lead.intake",
  "lead.research",
  "lead.qualify",
  "creative.prepare",
  "approval.request",
  "delivery.complete",
  "station.build",
  "station.upgrade",
  "station.configure",
  "workflow.resolve_block",
] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export const STATION_IDS = [
  "intake",
  "research",
  "qualification",
  "creative",
  "approval",
  "outreach",
  "crm",
  "delivery",
] as const;

export type StationId = (typeof STATION_IDS)[number];

export const MACHINE_STATUSES = [
  "idle",
  "working",
  "blocked",
  "completed",
  "awaiting_approval",
] as const;

export type MachineStatus = (typeof MACHINE_STATUSES)[number];

export const RESOURCE_IDS = [
  "leads",
  "verifiedData",
  "opportunities",
  "tasks",
  "productionCapacity",
  "completedDeliverables",
  "revenue",
] as const;

export type ResourceId = (typeof RESOURCE_IDS)[number];

export type LeadStage =
  | "intake"
  | "research"
  | "qualification"
  | "creative"
  | "awaiting_approval"
  | "delivery"
  | "completed"
  | "blocked";

export type WorkflowStatus = "idle" | "running" | "blocked" | "awaiting_approval" | "completed";

export interface AuditEntry {
  at: string;
  action: string;
  detail: string;
}

export interface JobOutputs {
  simulation: true;
  verified: false;
  summary: string;
  resources?: Partial<Record<ResourceId, number>>;
  recoverable?: boolean;
  reason?: string;
}

export interface JobRecord {
  id: string;
  kind: JobKind;
  inputs: Record<string, unknown>;
  outputs: JobOutputs | null;
  status: JobStatus;
  simulation: true;
  executor: "simulation";
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  audit: AuditEntry[];
}

export interface StationState {
  id: StationId;
  built: boolean;
  level: number;
  config: { mode: string; shift: string };
}

export interface ResourceState {
  id: ResourceId;
  amount: number;
  simulation: true;
  verified: false;
}

export interface MissionState {
  id: string;
  completedAt: string | null;
  evidenceJobId: string | null;
}

export interface LeadState {
  id: string;
  name: string;
  company: string;
  stage: LeadStage;
  stationId: StationId;
  simulation: true;
  verified: false;
  blockedReason: string | null;
}

export interface FactoryState {
  stations: StationState[];
  resources: ResourceState[];
  missions: MissionState[];
  lead: LeadState | null;
  workflow: { id: string | null; status: WorkflowStatus };
}

export interface JobDraft {
  kind: JobKind;
  inputs: Record<string, unknown>;
}

export const DISCLAIMER =
  "All leads, tasks, deliverables, and revenue in LINKR Factory are simulated. None of them are verified business results.";

export const SIMULATED_LEAD = {
  id: "lead_northwind_001",
  contactName: "Elena Voss",
  company: "Northwind Studio",
  source: "Simulated NFC card tap",
} as const;
