import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { throughputPerMinute } from "@/src/domain/catalog";
import { buildSnapshot } from "@/src/domain/derive";
import type { JobRecord } from "@/src/domain/types";
import { WorkflowError } from "@/src/jobs/errors";
import { approveJob, catchUp, createClientJob } from "@/src/jobs/runner";
import { SqliteFactoryRepository } from "@/src/jobs/sqlite-repository";
import { simulationExecutor } from "@/src/jobs/simulation-executor";
import { JOB_KINDS } from "@/src/domain/types";

const dirs: string[] = [];

function openRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "linkr-factory-"));
  dirs.push(dir);
  return { dir, repo: new SqliteFactoryRepository(path.join(dir, "factory.sqlite")) };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("job store", () => {
  it("survives a server-side read after create", () => {
    const { dir, repo } = openRepo();
    const created = createClientJob(
      repo,
      { kind: "station.configure", inputs: { stationId: "intake", shift: "night" }, simulation: true },
      5_000,
    );
    expect(created.status).toBe("running");
    expect(created.simulation).toBe(true);
    expect(created.executor).toBe("simulation");
    expect(created.audit.length).toBeGreaterThan(0);
    expect(created.createdAt).toBeTruthy();
    repo.close();

    const reopened = new SqliteFactoryRepository(path.join(dir, "factory.sqlite"));
    const read = reopened.getJob(created.id);
    expect(read).not.toBeNull();
    expect(read?.id).toBe(created.id);
    expect(read?.kind).toBe("station.configure");
    expect(read?.status).toBe("running");
    expect(read?.simulation).toBe(true);
    expect(read?.inputs.shift === "night" || (read?.inputs.config as { shift?: string } | undefined)?.shift).toBeTruthy();
    expect(read?.outputs).toBeNull();
    expect(read?.audit[0]?.action).toBe("created");

    catchUp(reopened, 5_000 + 1_000);
    const finished = reopened.getJob(created.id);
    expect(finished?.status).toBe("completed");
    expect(finished?.outputs?.verified).toBe(false);
    expect(finished?.outputs?.simulation).toBe(true);
    expect(reopened.getFactory().stations.find((station) => station.id === "intake")?.config.shift).toBe("night");
    reopened.close();
  });

  it("blocks completion until the owner approves", () => {
    const { repo } = openRepo();
    createClientJob(repo, { kind: "lead.intake", simulation: true }, 0);
    catchUp(repo, 20_000);
    expect(repo.getFactory().workflow.status).toBe("blocked");

    createClientJob(repo, { kind: "workflow.resolve_block", simulation: true }, 20_000);
    catchUp(repo, 80_000);

    const approval = repo.listJobs().find((job) => job.kind === "approval.request");
    expect(approval?.status).toBe("awaiting_approval");
    expect(repo.listJobs().some((job) => job.kind === "delivery.complete")).toBe(false);
    expect(repo.getFactory().workflow.status).toBe("awaiting_approval");
    expect(repo.getFactory().resources.find((resource) => resource.id === "revenue")?.amount).toBe(0);

    catchUp(repo, 400_000);
    expect(repo.getJob(approval!.id)?.status).toBe("awaiting_approval");
    expect(repo.listJobs().some((job) => job.kind === "delivery.complete")).toBe(false);

    expect(() => approveJob(repo, approval!.id, 400_000)).not.toThrow();
    expect(repo.getJob(approval!.id)?.status).toBe("completed");
    expect(repo.getJob(approval!.id)?.outputs?.verified).toBe(false);
    expect(repo.getJob(approval!.id)?.audit.some((entry) => entry.action === "approved")).toBe(true);

    const running = repo.listJobs().find((job) => job.kind === "lead.intake");
    expect(() => approveJob(repo, running!.id, 400_000)).toThrow(WorkflowError);

    catchUp(repo, 420_000);
    expect(repo.getFactory().workflow.status).toBe("completed");
    const revenue = repo.getFactory().resources.find((resource) => resource.id === "revenue");
    expect(revenue?.amount).toBe(4800);
    expect(revenue?.verified).toBe(false);
    expect(revenue?.simulation).toBe(true);
    repo.close();
  });

  it("does not flag simulated results as verified", () => {
    const { repo } = openRepo();
    expect(() => createClientJob(repo, { kind: "lead.intake", simulation: false }, 0)).toThrow(/simulation/i);
    expect(() =>
      createClientJob(repo, { kind: "station.upgrade", inputs: { stationId: "intake", executor: "crm" }, simulation: true }, 0),
    ).toThrow(/not available/i);

    createClientJob(repo, { kind: "lead.intake", simulation: true }, 0);
    catchUp(repo, 20_000);
    createClientJob(repo, { kind: "workflow.resolve_block", simulation: true }, 20_000);
    catchUp(repo, 80_000);
    const approval = repo.listJobs().find((job) => job.status === "awaiting_approval");
    approveJob(repo, approval!.id, 80_000);
    catchUp(repo, 100_000);

    const jobs = repo.listJobs();
    expect(jobs.length).toBeGreaterThan(5);
    for (const job of jobs) {
      expect(job.simulation).toBe(true);
      expect(job.executor).toBe("simulation");
      if (job.outputs) {
        expect(job.outputs.simulation).toBe(true);
        expect(job.outputs.verified).toBe(false);
      }
    }
    const factory = repo.getFactory();
    expect(factory.lead?.simulation).toBe(true);
    expect(factory.lead?.verified).toBe(false);
    for (const resource of factory.resources) {
      expect(resource.simulation).toBe(true);
      expect(resource.verified).toBe(false);
    }

    const snapshot = buildSnapshot(factory, jobs, 100_000);
    expect(snapshot.simulation).toBe(true);
    expect(snapshot.verified).toBe(false);
    expect(snapshot.disclaimer.toLowerCase()).toContain("simulated");
    expect(snapshot.resources.every((resource) => resource.verified === false)).toBe(true);
    expect(snapshot.lead?.verified).toBe(false);
    expect(snapshot.plannedExecutors.every((executor) => executor.implemented === false)).toBe(true);

    const tampered = {
      ...jobs[0],
      outputs: { simulation: true, verified: true, summary: "nope" },
    } as unknown as JobRecord;
    expect(() => repo.saveJob(tampered)).toThrow(/verified/i);
    repo.close();
  });
});

describe("external adapters", () => {
  it("rejects live systems and does not mark anything verified", () => {
    const { repo } = openRepo();
    for (const executor of ["github", "shopify", "meta", "google-drive", "supabase", "vercel"]) {
      expect(() =>
        createClientJob(
          repo,
          { kind: "station.configure", inputs: { stationId: "intake", executor }, simulation: true },
          1_000,
        ),
      ).toThrow(/not connected/i);
    }
    expect(repo.listJobs()).toHaveLength(0);
    const snapshot = buildSnapshot(repo.getFactory(), repo.listJobs(), 1_000);
    for (const id of ["github", "shopify", "meta", "google-drive", "supabase", "vercel"]) {
      const planned = snapshot.plannedExecutors.find((executor) => executor.id === id);
      expect(planned?.implemented).toBe(false);
      expect(planned?.verifiedExecution).toBe(false);
      expect(planned?.writesEnabled).toBe(false);
    }
    expect(snapshot.resources.every((resource) => resource.verified === false)).toBe(true);
    repo.close();
  });
});

describe("simulation executor", () => {
  it("never marks a finished step verified", () => {
    for (const kind of JOB_KINDS) {
      if (kind === "approval.request") {
        expect(() => simulationExecutor.finish(fakeJob(kind))).toThrow(/approval/i);
        continue;
      }
      const result = simulationExecutor.finish(fakeJob(kind, kind === "lead.research" ? { phase: "resume" } : {}));
      expect(result.outputs.verified).toBe(false);
      expect(result.outputs.simulation).toBe(true);
    }
  });
});

function fakeJob(kind: JobRecord["kind"], inputs: Record<string, unknown> = {}): JobRecord {
  return {
    id: `job_${kind}`,
    kind,
    inputs: { stationId: "intake", ...inputs },
    outputs: null,
    status: "running",
    simulation: true,
    executor: "simulation",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    startedAt: new Date(0).toISOString(),
    finishedAt: null,
    audit: [],
  };
}

describe("workflow transitions", () => {
  it("walks intake, block, research, qualification, creative, and approval", () => {
    const { repo } = openRepo();
    createClientJob(repo, { kind: "lead.intake", simulation: true }, 0);
    catchUp(repo, 20_000);
    let snapshot = buildSnapshot(repo.getFactory(), repo.listJobs(), 20_000);
    expect(snapshot.stations.find((station) => station.id === "intake")?.status).toBe("completed");
    expect(snapshot.stations.find((station) => station.id === "research")?.status).toBe("blocked");
    expect(snapshot.lead?.stage).toBe("blocked");
    expect(snapshot.missions.find((mission) => mission.id === "resolve-block")?.completedAt).toBeNull();

    createClientJob(repo, { kind: "workflow.resolve_block", simulation: true }, 20_000);
    catchUp(repo, 24_000);
    snapshot = buildSnapshot(repo.getFactory(), repo.listJobs(), 24_000);
    expect(snapshot.missions.find((mission) => mission.id === "resolve-block")?.evidenceJobId).toBeTruthy();

    catchUp(repo, 80_000);
    snapshot = buildSnapshot(repo.getFactory(), repo.listJobs(), 80_000);
    expect(snapshot.stations.find((station) => station.id === "qualification")?.status).toBe("completed");
    expect(snapshot.stations.find((station) => station.id === "creative")?.status).toBe("completed");
    expect(snapshot.stations.find((station) => station.id === "approval")?.status).toBe("awaiting_approval");
    expect(snapshot.missions.find((mission) => mission.id === "complete-research")?.completedAt).toBeTruthy();
    expect(snapshot.missions.find((mission) => mission.id === "qualify-lead")?.completedAt).toBeTruthy();
    expect(snapshot.missions.find((mission) => mission.id === "prepare-proposal")?.completedAt).toBeTruthy();
    expect(snapshot.missions.find((mission) => mission.id === "approve")?.completedAt).toBeNull();
    repo.close();
  });

  it("changes throughput when a station is upgraded", () => {
    const { repo } = openRepo();
    const before = throughputPerMinute("creative.prepare", 1);
    createClientJob(repo, { kind: "station.upgrade", inputs: { stationId: "creative" }, simulation: true }, 0);
    catchUp(repo, 5_000);
    const level = repo.getFactory().stations.find((station) => station.id === "creative")?.level;
    expect(level).toBe(2);
    expect(throughputPerMinute("creative.prepare", level ?? 1)).toBeGreaterThan(before);
    const snapshot = buildSnapshot(repo.getFactory(), repo.listJobs(), 5_000);
    expect(snapshot.stations.find((station) => station.id === "creative")?.throughputPerMinute).toBeGreaterThan(before);
    expect(snapshot.missions.find((mission) => mission.id === "improve-capacity")?.evidenceJobId).toBeTruthy();
    expect(snapshot.resources.find((resource) => resource.id === "productionCapacity")?.amount).toBe(2);
    expect(snapshot.resources.find((resource) => resource.id === "productionCapacity")?.verified).toBe(false);
    repo.close();
  });
});
