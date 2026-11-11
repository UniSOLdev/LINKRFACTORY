import { afterEach, describe, expect, it } from "vitest";
import { canPerform } from "@/src/auth/permissions";
import { consumeRateLimit, resetRateLimits } from "@/src/auth/rate-limit";
import { requireMutation } from "@/src/auth/guard";
import { issueSession, readSession, roleForPassword, SESSION_COOKIE } from "@/src/auth/session";
import { assertJobBody } from "@/src/auth/validate";
import { deriveMachineStatus } from "@/src/domain/derive";
import { initialFactory } from "@/src/domain/seed";
import { PLANNED_EXECUTORS } from "@/src/domain/catalog";
import { WorkflowError } from "@/src/jobs/errors";
import { MemoryFactoryRepository } from "@/src/jobs/memory-repository";
import { createClientJob } from "@/src/jobs/runner";
import { githubFromResponse, notConnected, vercelFromEnv } from "@/src/operations/status";
import { FUTURE_WORKERS } from "@/src/workers/contract";

const ORIGINAL = {
  LINKR_SESSION_SECRET: process.env.LINKR_SESSION_SECRET,
  LINKR_ADMIN_PASSWORD: process.env.LINKR_ADMIN_PASSWORD,
  LINKR_OPERATOR_PASSWORD: process.env.LINKR_OPERATOR_PASSWORD,
  LINKR_VIEWER_PASSWORD: process.env.LINKR_VIEWER_PASSWORD,
};

afterEach(() => {
  process.env.LINKR_SESSION_SECRET = ORIGINAL.LINKR_SESSION_SECRET;
  process.env.LINKR_ADMIN_PASSWORD = ORIGINAL.LINKR_ADMIN_PASSWORD;
  process.env.LINKR_OPERATOR_PASSWORD = ORIGINAL.LINKR_OPERATOR_PASSWORD;
  process.env.LINKR_VIEWER_PASSWORD = ORIGINAL.LINKR_VIEWER_PASSWORD;
  resetRateLimits();
});

function configure() {
  process.env.LINKR_SESSION_SECRET = "test-session-secret-value";
  process.env.LINKR_ADMIN_PASSWORD = "admin-password";
  process.env.LINKR_OPERATOR_PASSWORD = "operator-password";
  process.env.LINKR_VIEWER_PASSWORD = "viewer-password";
}

function requestFor(role: "administrator" | "operator" | "viewer" | null, ip = "203.0.113.8"): Request {
  const headers = new Headers({ "x-forwarded-for": ip });
  if (role) {
    const token = issueSession(role, 1_000);
    headers.set("cookie", `${SESSION_COOKIE}=${token}`);
  }
  return new Request("https://factory.test/api/jobs", { headers });
}

describe("authorization", () => {
  it("separates administrator, operator, and viewer", () => {
    expect(canPerform("administrator", "reset")).toBe(true);
    expect(canPerform("administrator", "approve")).toBe(true);
    expect(canPerform("operator", "create")).toBe(true);
    expect(canPerform("operator", "approve")).toBe(false);
    expect(canPerform("operator", "reset")).toBe(false);
    expect(canPerform("viewer", "create")).toBe(false);
    expect(canPerform(null, "create")).toBe(false);
  });

  it("rejects missing, wrong-role, and unsigned sessions", () => {
    configure();
    expect(() => requireMutation(requestFor(null), "create", 1_000)).toThrow(WorkflowError);
    expect(() => requireMutation(requestFor("viewer"), "create", 1_000)).toThrow(/cannot create/i);
    expect(() => requireMutation(requestFor("operator"), "approve", 1_000)).toThrow(/cannot approve/i);
    expect(() => requireMutation(requestFor("operator"), "reset", 1_000)).toThrow(/cannot reset/i);
    expect(requireMutation(requestFor("operator"), "create", 1_000)).toBe("operator");
    expect(requireMutation(requestFor("administrator"), "reset", 1_000)).toBe("administrator");
    expect(readSession("tampered.token", 1_000)).toBeNull();
    expect(roleForPassword("admin-password")).toBe("administrator");
    expect(roleForPassword("nope")).toBeNull();
  });

  it("limits repeated mutations", () => {
    configure();
    const request = requestFor("administrator", "198.51.100.4");
    for (let i = 0; i < 30; i += 1) requireMutation(request, "create", 5_000);
    expect(() => requireMutation(request, "create", 5_000)).toThrow(/too many/i);
    expect(consumeRateLimit("fresh", 5_000, 1).allowed).toBe(true);
    expect(consumeRateLimit("fresh", 5_000, 1).allowed).toBe(false);
  });
});

describe("input validation", () => {
  it("rejects live flags, extra fields, and oversized input", () => {
    expect(() => assertJobBody({ kind: "lead.intake", simulation: false })).toThrow(/simulated/i);
    expect(() => assertJobBody({ kind: "lead.intake", executor: "github" })).toThrow(/unsupported field/i);
    expect(() => assertJobBody({ kind: "lead.intake", inputs: { verified: true } })).toThrow(/verified/i);
    expect(() => assertJobBody(["lead.intake"])).toThrow(/json object/i);
    expect(() => assertJobBody({ kind: "lead.intake", inputs: { note: "x".repeat(4_100) } })).toThrow(/too large/i);
  });
});

describe("records stay simulated", () => {
  it("keeps memory jobs simulated and marks unbuilt stations offline", () => {
    const repo = new MemoryFactoryRepository();
    const job = createClientJob(repo, { kind: "station.configure", inputs: { stationId: "intake" }, simulation: true }, 1_000, "operator");
    expect(job.simulation).toBe(true);
    expect(job.executor).toBe("simulation");
    expect(job.audit[0]?.detail).toContain("Signed-in operator");
    const copy = new MemoryFactoryRepository();
    const exported = repo.exportState();
    copy.replaceState(exported.factory, exported.jobs);
    expect(copy.getJob(job.id)?.status).toBe(job.status);

    const factory = initialFactory();
    const outreach = factory.stations.find((station) => station.id === "outreach");
    expect(outreach && deriveMachineStatus(outreach, [])).toBe("offline");
    const intake = factory.stations.find((station) => station.id === "intake");
    expect(intake && deriveMachineStatus(intake, [])).toBe("idle");
  });

  it("keeps every external worker write disabled", () => {
    expect(PLANNED_EXECUTORS.every((executor) => executor.writesEnabled === false && executor.implemented === false)).toBe(true);
    expect(FUTURE_WORKERS.every((worker) => worker.writesEnabled === false)).toBe(true);
    expect(FUTURE_WORKERS.filter((worker) => worker.mode === "write").every((worker) => worker.approvalPolicy === "owner")).toBe(true);
    expect(notConnected("shopify", "Shopify", "off").health).toBe("NOT CONNECTED");
  });
});

describe("live status mapping", () => {
  it("accepts a real GitHub commit payload and refuses a local Vercel claim", () => {
    const github = githubFromResponse(
      200,
      { sha: "abc123", commit: { message: "Keep the floor simulated\n\nbody", committer: { date: "2026-11-11T06:00:00Z" } } },
      "2026-11-11T06:01:00Z",
    );
    expect(github.state).toBe("connected");
    expect(github.writesEnabled).toBe(false);
    expect(github.evidence).toBe("abc123");
    expect(githubFromResponse(403, null, "2026-11-11T06:01:00Z").state).toBe("degraded");
    expect(vercelFromEnv({}, "2026-11-11T06:01:00Z").state).toBe("not_connected");
    expect(vercelFromEnv({ VERCEL: "1", VERCEL_GIT_COMMIT_SHA: "def456", VERCEL_ENV: "preview" }, "2026-11-11T06:01:00Z")).toMatchObject({
      state: "connected",
      evidence: "def456",
      writesEnabled: false,
    });
  });
});
