import { NextResponse } from "next/server";
import { currentRole } from "@/src/auth/guard";
import { jsonError } from "@/src/jobs/http";
import { postgresPing } from "@/src/jobs/postgres-store";
import { readFactorySnapshot, withFactory } from "@/src/jobs/runtime";
import { notConnected, readGithubStatus, UNCONFIGURED_SYSTEMS, vercelFromEnv } from "@/src/operations/status";
import { FUTURE_WORKERS } from "@/src/workers/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const observedAt = new Date().toISOString();
    const [snapshot, github, database] = await Promise.all([
      withFactory(() => readFactorySnapshot()),
      readGithubStatus(observedAt),
      postgresPing(),
    ]);
    const jobs = snapshot.jobs;
    const verifiedOutput = (job: (typeof jobs)[number]) => {
      const outputs = job.outputs as { verified?: boolean } | null;
      return outputs?.verified === true;
    };
    const simulatedJobs = jobs.filter((job) => job.simulation === true && !verifiedOutput(job)).length;
    const actualJobs = jobs.filter((job) => verifiedOutput(job)).length;
    const blocked = snapshot.stations.filter((station) => station.status === "blocked");
    const approvals = jobs.filter((job) => job.status === "awaiting_approval");
    const history = jobs
      .flatMap((job) => job.audit.map((entry) => ({ ...entry, jobId: job.id, kind: job.kind, simulation: true, verified: false })))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 12);

    const supabase = !process.env.SUPABASE_DB_URL
      ? notConnected("supabase", "Supabase", "No database URL is configured. Factory state is not durable on this process.")
      : database.ok
        ? {
            id: "supabase",
            label: "Supabase",
            state: "connected" as const,
            health: "Read-only database check succeeded",
            writesEnabled: false as const,
            evidence: "select 1",
            detail: "Factory persistence is connected. Customer-data writes and business adapters stay disabled.",
            observedAt,
          }
        : {
            id: "supabase",
            label: "Supabase",
            state: "degraded" as const,
            health: "Database check failed",
            writesEnabled: false as const,
            evidence: null,
            detail: database.message,
            observedAt,
          };

    return NextResponse.json({
      role: currentRole(request),
      observedAt,
      lastSynchronization: snapshot.serverNow ? new Date(snapshot.serverNow).toISOString() : observedAt,
      simulation: true,
      verified: false,
      jobs: {
        simulated: simulatedJobs,
        actual: actualJobs,
        blocked: blocked.map((station) => ({ id: station.id, name: station.name })),
        approvals: approvals.map((job) => ({ id: job.id, kind: job.kind })),
      },
      history,
      systems: [github, vercelFromEnv(process.env, observedAt), supabase, ...UNCONFIGURED_SYSTEMS],
      workers: FUTURE_WORKERS,
      externalWritesEnabled: false,
    });
  } catch (error) {
    return jsonError(error);
  }
}
