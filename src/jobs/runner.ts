import { randomUUID } from "crypto";
import { isStationId, scaledDuration } from "@/src/domain/catalog";
import { initialFactory } from "@/src/domain/seed";
import { planSequel, reduceStart, reduceTerminal } from "@/src/domain/transitions";
import { SIMULATED_LEAD, type JobKind, type JobRecord, type StationId } from "@/src/domain/types";
import { WorkflowError } from "@/src/jobs/errors";
import { assertSimulatedFactory, assertSimulatedJob } from "@/src/jobs/guards";
import type { FactoryRepository } from "@/src/jobs/repository";
import { resolveExecutor } from "@/src/jobs/adapters";
import { simulationExecutor } from "@/src/jobs/simulation-executor";

const CLIENT_KINDS = new Set<JobKind>([
  "lead.intake",
  "station.build",
  "station.upgrade",
  "station.configure",
  "workflow.resolve_block",
]);

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function stationOf(job: JobRecord): StationId | null {
  const id = job.inputs.stationId;
  return typeof id === "string" && isStationId(id) ? id : null;
}

function busy(jobs: JobRecord[], stationId: StationId, exceptId?: string): boolean {
  return jobs.some((job) => {
    if (job.id === exceptId) return false;
    if (stationOf(job) !== stationId) return false;
    return job.status === "queued" || job.status === "running" || job.status === "awaiting_approval";
  });
}

function insertJob(
  repo: FactoryRepository,
  kind: JobKind,
  inputs: Record<string, unknown>,
  createdMs: number,
  actor?: string,
): JobRecord {
  const factory = repo.getFactory();
  const stationId = inputs.stationId;
  if (typeof stationId !== "string" || !isStationId(stationId)) {
    throw new WorkflowError("INVALID_INPUT", "Job is missing a station.");
  }
  const station = factory.stations.find((item) => item.id === stationId);
  const durationMs = scaledDuration(kind, station?.level ?? 1);
  const workflowId =
    (typeof inputs.workflowId === "string" && inputs.workflowId) ||
    factory.workflow.id ||
    (kind === "lead.intake" ? `run_${randomUUID()}` : null);
  const createdAt = iso(createdMs);
  const job: JobRecord = {
    id: `job_${randomUUID()}`,
    kind,
    inputs: {
      ...inputs,
      durationMs,
      workflowId,
      executor: "simulation",
    },
    outputs: null,
    status: "queued",
    simulation: true,
    executor: "simulation",
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    finishedAt: null,
    audit: [
      {
        at: createdAt,
        action: "created",
        detail: actor
          ? `Signed-in ${actor} queued this on the simulation adapter. No external system was called.`
          : "Queued on the simulation adapter. No external system was called.",
      },
    ],
  };
  assertSimulatedJob(job);
  repo.saveJob(job);
  return job;
}

export function createClientJob(
  repo: FactoryRepository,
  body: { kind?: unknown; inputs?: unknown; simulation?: unknown },
  nowMs: number,
  actor?: string,
): JobRecord {
  if (body.simulation === false) {
    throw new WorkflowError(
      "SIMULATION_ONLY",
      "This release only runs the simulation adapter. Live executors are not connected.",
    );
  }
  if (typeof body.kind !== "string" || !CLIENT_KINDS.has(body.kind as JobKind)) {
    throw new WorkflowError("INVALID_INPUT", "That job kind cannot be started from the console.");
  }
  const kind = body.kind as JobKind;
  const raw = body.inputs && typeof body.inputs === "object" ? (body.inputs as Record<string, unknown>) : {};
  if (typeof raw.executor === "string") {
    resolveExecutor(raw.executor);
  }
  if (raw.verified === true) {
    throw new WorkflowError("SIMULATION_ONLY", "Simulated jobs cannot be marked verified.");
  }

  const factory = repo.getFactory();
  const jobs = repo.listJobs();
  const inputs = clientInputs(kind, raw, factory, jobs);
  const stationId = inputs.stationId as StationId;
  if (busy(jobs, stationId)) {
    throw new WorkflowError("CONFLICT", "That station already has an open job.");
  }

  const job = repo.transaction(() => insertJob(repo, kind, inputs, nowMs, actor));
  catchUp(repo, nowMs);
  const saved = repo.getJob(job.id);
  if (!saved) throw new WorkflowError("NOT_FOUND", "Job disappeared after create.");
  return saved;
}

function clientInputs(
  kind: JobKind,
  raw: Record<string, unknown>,
  factory: ReturnType<FactoryRepository["getFactory"]>,
  jobs: JobRecord[],
): Record<string, unknown> {
  if (kind === "lead.intake") {
    if (factory.workflow.status !== "idle") {
      throw new WorkflowError("CONFLICT", "A simulated run is already on the floor. Reset the simulation to start another.");
    }
    return {
      stationId: "intake",
      leadId: SIMULATED_LEAD.id,
      contactName: SIMULATED_LEAD.contactName,
      company: SIMULATED_LEAD.company,
      source: SIMULATED_LEAD.source,
    };
  }

  if (kind === "workflow.resolve_block") {
    const requested = typeof raw.failedJobId === "string" ? jobs.find((job) => job.id === raw.failedJobId) : undefined;
    const failed =
      requested ??
      jobs.find((job) => job.status === "failed" && job.outputs?.recoverable === true && !blockTaken(jobs, job.id));
    if (!failed || failed.status !== "failed" || failed.outputs?.recoverable !== true) {
      throw new WorkflowError("INVALID_TRANSITION", "There is no recoverable block to resolve.");
    }
    if (blockTaken(jobs, failed.id)) {
      throw new WorkflowError("CONFLICT", "That block is already being resolved.");
    }
    return {
      stationId: "research",
      failedJobId: failed.id,
      leadId: factory.lead?.id ?? SIMULATED_LEAD.id,
    };
  }

  if (typeof raw.stationId !== "string" || !isStationId(raw.stationId)) {
    throw new WorkflowError("INVALID_INPUT", "Choose a station.");
  }
  const station = factory.stations.find((item) => item.id === raw.stationId);
  if (!station) throw new WorkflowError("NOT_FOUND", "Unknown station.");

  if (kind === "station.build") {
    if (station.built) throw new WorkflowError("CONFLICT", "That station is already built.");
    return { stationId: station.id };
  }
  if (kind === "station.upgrade") {
    if (!station.built) throw new WorkflowError("INVALID_TRANSITION", "Build the station before upgrading it.");
    return { stationId: station.id };
  }
  if (kind === "station.configure") {
    if (!station.built) throw new WorkflowError("INVALID_TRANSITION", "Build the station before configuring it.");
    return {
      stationId: station.id,
      config: { mode: "simulation-only", shift: raw.shift === "night" ? "night" : "day" },
    };
  }
  throw new WorkflowError("INVALID_INPUT", "Unsupported action.");
}

function blockTaken(jobs: JobRecord[], failedJobId: string): boolean {
  return jobs.some(
    (job) => job.kind === "workflow.resolve_block" && job.inputs.failedJobId === failedJobId && job.status !== "failed",
  );
}

export function approveJob(repo: FactoryRepository, id: string, nowMs: number, actor?: string): JobRecord {
  const job = repo.getJob(id);
  if (!job) throw new WorkflowError("NOT_FOUND", "Job not found.");
  if (job.simulation !== true) {
    throw new WorkflowError("SIMULATION_ONLY", "Only simulated jobs can be approved here.");
  }
  if (job.status !== "awaiting_approval") {
    throw new WorkflowError("APPROVAL_REQUIRED", "This job is not awaiting approval, so it cannot be approved.");
  }
  const at = iso(nowMs);
  const outputs = {
    simulation: true as const,
    verified: false as const,
    summary: "Owner approved the simulated proposal in the app. Nothing was sent and no invoice was issued.",
  };
  const approved: JobRecord = {
    ...job,
    status: "completed",
    outputs,
    finishedAt: at,
    updatedAt: at,
    audit: [
      ...job.audit,
      {
        at,
        action: "approved",
        detail: actor
          ? `Signed-in ${actor} approved this simulated step in the app. Nothing was sent.`
          : "Owner approved this simulated step in the app.",
      },
      { at, action: "completed", detail: outputs.summary },
    ],
  };
  assertSimulatedJob(approved);
  repo.transaction(() => {
    repo.saveJob(approved);
    const next = reduceTerminal(repo.getFactory(), approved);
    assertSimulatedFactory(next);
    repo.saveFactory(next);
  });
  catchUp(repo, nowMs);
  const saved = repo.getJob(id);
  if (!saved) throw new WorkflowError("NOT_FOUND", "Approved job could not be read back.");
  return saved;
}

export function catchUp(repo: FactoryRepository, nowMs: number): void {
  repo.transaction(() => {
    for (let step = 0; step < 48; step += 1) {
      const sequels = ensureSequels(repo, nowMs);
      const started = startReady(repo, nowMs);
      const finished = finishDue(repo, nowMs);
      if (!sequels && !started && !finished) break;
    }
  });
}

function ensureSequels(repo: FactoryRepository, nowMs: number): boolean {
  const jobs = repo.listJobs();
  let changed = false;
  for (const job of jobs) {
    if (job.status !== "completed") continue;
    const draft = planSequel(job);
    if (!draft) continue;
    if (jobs.some((other) => other.inputs.parentJobId === job.id)) continue;
    const createdMs = job.finishedAt ? Date.parse(job.finishedAt) : nowMs;
    const sequel = insertJob(repo, draft.kind, { ...draft.inputs, parentJobId: job.id }, createdMs);
    jobs.push(sequel);
    changed = true;
  }
  return changed;
}

function startReady(repo: FactoryRepository, nowMs: number): boolean {
  const queued = repo
    .listJobs()
    .filter((job) => job.status === "queued")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  let changed = false;
  for (const job of queued) {
    const startMs = Date.parse(job.createdAt);
    if (startMs > nowMs) continue;
    const stationId = stationOf(job);
    if (!stationId) continue;
    if (busy(repo.listJobs(), stationId, job.id)) continue;
    const at = iso(startMs);
    const started: JobRecord =
      job.kind === "approval.request"
        ? {
            ...job,
            status: "awaiting_approval",
            startedAt: at,
            updatedAt: at,
            audit: [
              ...job.audit,
              {
                at,
                action: "awaiting_approval",
                detail: "Owner approval is required. The simulation will not continue until you approve it in the app.",
              },
            ],
          }
        : {
            ...job,
            status: "running",
            startedAt: at,
            updatedAt: at,
            audit: [...job.audit, { at, action: "started", detail: "Simulation adapter started the job." }],
          };
    assertSimulatedJob(started);
    repo.saveJob(started);
    const next = reduceStart(repo.getFactory(), started);
    assertSimulatedFactory(next);
    repo.saveFactory(next);
    changed = true;
  }
  return changed;
}

function finishDue(repo: FactoryRepository, nowMs: number): boolean {
  const running = repo.listJobs().filter((job) => job.status === "running");
  let changed = false;
  for (const job of running) {
    if (job.kind === "approval.request") continue;
    const start = job.startedAt ? Date.parse(job.startedAt) : nowMs;
    const duration = Number(job.inputs.durationMs ?? 0);
    const finishMs = start + duration;
    if (finishMs > nowMs) continue;
    const result = simulationExecutor.finish(job);
    const at = iso(finishMs);
    const finished: JobRecord = {
      ...job,
      status: result.status,
      outputs: result.outputs,
      finishedAt: at,
      updatedAt: at,
      audit: [
        ...job.audit,
        {
          at,
          action: result.status === "failed" ? "failed" : "completed",
          detail: result.outputs.summary,
        },
      ],
    };
    assertSimulatedJob(finished);
    repo.saveJob(finished);
    const next = reduceTerminal(repo.getFactory(), finished);
    assertSimulatedFactory(next);
    repo.saveFactory(next);
    changed = true;
  }
  return changed;
}

export function resetSimulation(repo: FactoryRepository): void {
  repo.reset(initialFactory());
}

export function readJob(repo: FactoryRepository, id: string): JobRecord {
  const job = repo.getJob(id);
  if (!job) throw new WorkflowError("NOT_FOUND", "Job not found.");
  return job;
}
