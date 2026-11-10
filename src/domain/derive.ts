import {
  MISSION_DEFS,
  RESOURCE_DEFS,
  STATION_DEFS,
  taskTitle,
  throughputPerMinute,
} from "@/src/domain/catalog";
import { PLANNED_EXECUTORS } from "@/src/domain/catalog";
import { STATION_POSITIONS } from "@/src/domain/layout";
import {
  DISCLAIMER,
  type FactoryState,
  type JobRecord,
  type JobStatus,
  type MachineStatus,
  type StationId,
} from "@/src/domain/types";

export interface TaskView {
  id: string;
  title: string;
  status: JobStatus;
  kind: JobRecord["kind"];
  simulation: true;
  verified: false;
}

export interface StationView {
  id: StationId;
  name: string;
  shortName: string;
  summary: string;
  built: boolean;
  level: number;
  status: MachineStatus;
  throughputPerMinute: number;
  dependencies: string[];
  progress: number;
  durationMs: number;
  activeJobId: string | null;
  tasks: TaskView[];
  config: { mode: string; shift: string };
  position: [number, number, number];
}

export interface FactorySnapshot {
  simulation: true;
  verified: false;
  disclaimer: string;
  executorId: "simulation";
  plannedExecutors: typeof PLANNED_EXECUTORS;
  serverNow: number;
  stations: StationView[];
  jobs: JobRecord[];
  lead: (NonNullable<FactoryState["lead"]> & { progress: number; durationMs: number; moving: boolean }) | null;
  resources: Array<FactoryState["resources"][number] & { name: string; definition: string; unit: string }>;
  missions: Array<FactoryState["missions"][number] & { title: string; description: string }>;
  workflow: FactoryState["workflow"];
  pendingApprovalJobId: string | null;
  recoverableFailure: { jobId: string; reason: string } | null;
}

function isOpen(status: JobStatus): boolean {
  return status === "queued" || status === "running" || status === "awaiting_approval";
}

function stationJobs(jobs: JobRecord[], stationId: StationId): JobRecord[] {
  return jobs.filter((job) => job.inputs.stationId === stationId);
}

function failureResolved(jobs: JobRecord[], failed: JobRecord): boolean {
  return jobs.some(
    (job) =>
      job.inputs.failedJobId === failed.id &&
      (job.status === "completed" || job.status === "running" || job.status === "queued" || job.status === "awaiting_approval"),
  );
}

export function deriveMachineStatus(station: FactoryState["stations"][number], jobs: JobRecord[]): MachineStatus {
  const mine = stationJobs(jobs, station.id);
  if (mine.some((job) => job.status === "awaiting_approval")) return "awaiting_approval";
  if (mine.some((job) => job.status === "running" || job.status === "queued")) return "working";
  const unresolved = mine.filter((job) => job.status === "failed" && job.outputs?.recoverable === true && !failureResolved(jobs, job));
  if (unresolved.length > 0) return "blocked";
  if (mine.some((job) => job.status === "completed")) return "completed";
  return "idle";
}

export function jobProgress(job: JobRecord, nowMs: number): number {
  if (job.status === "queued") return 0;
  if (job.status !== "running") return 1;
  const duration = Number(job.inputs.durationMs ?? 0);
  if (!job.startedAt || duration <= 0) return 1;
  return Math.max(0, Math.min(1, (nowMs - Date.parse(job.startedAt)) / duration));
}

function activeJob(jobs: JobRecord[], stationId: StationId): JobRecord | null {
  const mine = stationJobs(jobs, stationId);
  return (
    mine.find((job) => job.status === "awaiting_approval") ??
    mine.find((job) => job.status === "running") ??
    mine.find((job) => job.status === "queued") ??
    null
  );
}

export function buildSnapshot(factory: FactoryState, jobs: JobRecord[], nowMs: number): FactorySnapshot {
  const recoverable = jobs.find(
    (job) => job.status === "failed" && job.outputs?.recoverable === true && !failureResolved(jobs, job),
  );
  const approval = jobs.find((job) => job.status === "awaiting_approval") ?? null;
  const stations: StationView[] = factory.stations.map((station) => {
    const def = STATION_DEFS[station.id];
    const status = deriveMachineStatus(station, jobs);
    const active = activeJob(jobs, station.id);
    const dependencies = [...def.dependencies];
    if (!station.built) dependencies.unshift("Not built yet.");
    if (status === "blocked" && recoverable?.outputs?.reason) dependencies.unshift(recoverable.outputs.reason);
    if (status === "awaiting_approval") dependencies.unshift("Waiting on owner approval.");
    const tasks = stationJobs(jobs, station.id)
      .slice()
      .reverse()
      .map((job) => ({
        id: job.id,
        title: taskTitle(job.kind, job.inputs),
        status: job.status,
        kind: job.kind,
        simulation: true as const,
        verified: false as const,
      }));
    return {
      id: station.id,
      name: def.name,
      shortName: def.shortName,
      summary: def.summary,
      built: station.built,
      level: station.level,
      status,
      throughputPerMinute: station.built ? throughputPerMinute(def.primaryKind, station.level) : 0,
      dependencies,
      progress: active ? jobProgress(active, nowMs) : status === "completed" || status === "blocked" ? 1 : 0,
      durationMs: active ? Number(active.inputs.durationMs ?? 0) : 0,
      activeJobId: active?.id ?? null,
      tasks,
      config: station.config,
      position: STATION_POSITIONS[station.id],
    };
  });

  let lead: FactorySnapshot["lead"] = null;
  if (factory.lead) {
    const current = stations.find((station) => station.id === factory.lead?.stationId);
    const moving = factory.lead.stage !== "blocked" && factory.lead.stage !== "completed" && factory.lead.stage !== "awaiting_approval";
    lead = {
      ...factory.lead,
      simulation: true,
      verified: false,
      progress: current?.progress ?? (factory.lead.stage === "completed" ? 1 : 0),
      durationMs: current?.durationMs ?? 0,
      moving: moving && (current?.status === "working"),
    };
  }

  return {
    simulation: true,
    verified: false,
    disclaimer: DISCLAIMER,
    executorId: "simulation",
    plannedExecutors: PLANNED_EXECUTORS,
    serverNow: nowMs,
    stations,
    jobs,
    lead,
    resources: factory.resources.map((resource) => ({
      ...resource,
      simulation: true,
      verified: false,
      name: RESOURCE_DEFS[resource.id].name,
      definition: RESOURCE_DEFS[resource.id].definition,
      unit: RESOURCE_DEFS[resource.id].unit,
    })),
    missions: factory.missions.map((mission) => {
      const def = MISSION_DEFS.find((item) => item.id === mission.id);
      return {
        ...mission,
        title: def?.title ?? mission.id,
        description: def?.description ?? "",
      };
    }),
    workflow: factory.workflow,
    pendingApprovalJobId: approval?.id ?? null,
    recoverableFailure: recoverable
      ? { jobId: recoverable.id, reason: recoverable.outputs?.reason ?? "The simulation is blocked." }
      : null,
  };
}

export function openJobCount(jobs: JobRecord[]): number {
  return jobs.filter((job) => isOpen(job.status)).length;
}
