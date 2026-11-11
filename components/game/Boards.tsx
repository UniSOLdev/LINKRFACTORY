"use client";

import { useEffect, useState } from "react";
import { buttonClass, STATUS_LABEL } from "@/lib/format";
import { taskTitle } from "@/src/domain/catalog";
import type { FactorySnapshot } from "@/src/domain/derive";
import type { StationId } from "@/src/domain/types";
import { FUTURE_WORKERS } from "@/src/workers/contract";
import { SimBadge } from "@/components/game/Hud";

interface SystemRow {
  id: string;
  label: string;
  state: "connected" | "degraded" | "not_connected";
  health: string;
  writesEnabled: false;
  evidence: string | null;
  detail: string;
  observedAt: string | null;
}

interface OperationsPayload {
  observedAt: string;
  lastSynchronization: string;
  jobs: { simulated: number; actual: number; blocked: Array<{ name: string }>; approvals: Array<{ id: string }> };
  history: Array<{ at: string; action: string; detail: string; jobId: string }>;
  systems: SystemRow[];
  externalWritesEnabled: false;
}

const PLANNED_ONLY = [
  { id: "stripe", label: "Stripe", detail: "Payments are not configured. No API call was made." },
  { id: "notion", label: "Notion", detail: "Not configured. No API call was made." },
  { id: "figma", label: "Figma", detail: "Not configured. No API call was made." },
  { id: "linear", label: "Linear", detail: "Not configured. No API call was made." },
];

export function OperationsBoard() {
  const [board, setBoard] = useState<OperationsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const response = await fetch("/api/operations", { cache: "no-store" });
        if (!response.ok) throw new Error("Operations status could not be loaded.");
        const next = (await response.json()) as OperationsPayload;
        if (!stop) {
          setBoard(next);
          setError(null);
        }
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "Operations status failed.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  const systems = board?.systems ?? [];
  const connected = systems.filter((system) => system.state === "connected").length;
  const readOnly = systems.filter((system) => system.state === "connected" && system.writesEnabled === false).length;
  const offline = systems.filter((system) => system.state !== "connected").length;

  return (
    <section className="h-full overflow-y-auto px-3 py-3" data-testid="operations-board">
      <h2 className="text-lg font-semibold tracking-tight">Integrations command center</h2>
      <p className="text-sm text-slate-400">Live status only. Writes, messages, ad spend, payments, and production deploys stay off.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Count label="Connected" value={`${connected}`} />
        <Count label="Read-only" value={`${readOnly}`} />
        <Count label="Not connected" value={`${offline + PLANNED_ONLY.length}`} />
      </div>
      {error && <p className="mt-3 text-sm text-[#F5B942]" data-testid="operations-error">{error}</p>}
      {!board && !error && <p className="mt-3 text-sm text-slate-400">Checking providers…</p>}
      <ul className="mt-3 space-y-2">
        {systems.map((system) => (
          <li key={system.id} className="hud-card rounded-2xl px-3 py-3" data-testid={`system-${system.id}`} data-state={system.state}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{system.label}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-300">{system.state === "connected" ? "Connected" : system.state === "degraded" ? "Degraded" : "Not connected"}</p>
            </div>
            <p className="mt-1 text-sm text-slate-300">{system.health}</p>
            <p className="text-sm text-slate-400">{system.detail}</p>
            {system.evidence && <p className="mt-1 break-all font-mono text-[11px] text-[#C4B5FD]">{system.evidence}</p>}
            <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">Writes disabled</p>
          </li>
        ))}
        {PLANNED_ONLY.map((system) => (
          <li key={system.id} className="rounded-2xl border border-white/10 px-3 py-3" data-testid={`system-${system.id}`} data-state="not_connected">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{system.label}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Not connected</p>
            </div>
            <p className="mt-1 text-sm text-slate-400">{system.detail}</p>
          </li>
        ))}
      </ul>
      <div className="mt-4 hud-card rounded-2xl px-3 py-3">
        <p className="text-sm font-medium">AI workers</p>
        <ul className="mt-2 space-y-2">
          {FUTURE_WORKERS.filter((worker) => worker.system === "agent" || worker.mode === "read").map((worker) => (
            <li key={worker.id} className="text-sm text-slate-300">
              <span className="text-slate-100">{worker.id}</span> · {worker.permissionScope} <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Not connected · writes off</span>
            </li>
          ))}
        </ul>
      </div>
      {board && (
        <p className="mt-3 text-xs text-slate-500">
          Last synchronization {new Date(board.lastSynchronization).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET · {board.jobs.simulated} simulated jobs · {board.jobs.actual} verified jobs
        </p>
      )}
      <button type="button" className={`${buttonClass.primary} mt-3 w-full`} disabled>
        Add integration
      </button>
    </section>
  );
}

export function MissionsBoard({
  snapshot,
  pending,
  canCreate,
  canApprove,
  onStart,
  onResolve,
  onApprove,
}: {
  snapshot: FactorySnapshot;
  pending: boolean;
  canCreate: boolean;
  canApprove: boolean;
  onStart: () => void;
  onResolve: () => void;
  onApprove: () => void;
}) {
  const done = snapshot.missions.filter((mission) => mission.completedAt).length;
  const progress = snapshot.missions.length ? Math.round((done / snapshot.missions.length) * 100) : 0;
  const featured = snapshot.missions.find((mission) => !mission.completedAt) ?? snapshot.missions[0];
  const line: StationId[] = ["intake", "research", "creative", "approval", "delivery"];
  const groups = {
    active: snapshot.jobs.filter((job) => job.status === "running" || job.status === "queued"),
    approval: snapshot.jobs.filter((job) => job.status === "awaiting_approval"),
    blocked: snapshot.jobs.filter((job) => job.status === "failed"),
    completed: snapshot.jobs.filter((job) => job.status === "completed"),
  };
  const events = snapshot.jobs
    .flatMap((job) => job.audit.map((entry) => ({ ...entry, jobId: job.id, kind: job.kind, inputs: job.inputs })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  return (
    <section className="h-full overflow-y-auto px-3 py-3" data-testid="missions">
      <h2 className="text-lg font-semibold tracking-tight">Missions and operations</h2>
      <p className="text-sm text-slate-400">Run the simulated floor. Results stay unverified.</p>
      <div className="mt-3 hud-card rounded-3xl p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#C4B5FD]">Featured mission</p>
          <SimBadge />
        </div>
        <h3 className="mt-1 text-base font-semibold" data-testid={featured ? `mission-${featured.id}` : undefined}>{featured?.title ?? "No mission"}</h3>
        <p className="mt-1 text-sm text-slate-400">{featured?.description}</p>
        <p className="mt-2 text-xs text-slate-500">Outcome stays simulated. This does not unlock a verified run.</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#7C3AED]" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-1 text-xs text-slate-400">{progress}% of missions complete</p>
        <button type="button" className={`${buttonClass.primary} mt-3 w-full`} data-testid="start-run" disabled={pending || !canCreate || snapshot.workflow.status !== "idle"} onClick={onStart}>
          Start simulated lead
        </button>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto">
        {line.map((id) => {
          const station = snapshot.stations.find((item) => item.id === id);
          if (!station) return null;
          return (
            <div key={id} className="min-w-[6.5rem] rounded-2xl border border-[#7C3AED]/40 bg-black/30 px-2 py-2">
              <p className="text-xs font-medium">{station.shortName}</p>
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">{STATUS_LABEL[station.status]}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <JobColumn title="Active" jobs={groups.active} />
        <JobColumn title="Awaiting approval" jobs={groups.approval} />
        <JobColumn title="Blocked" jobs={groups.blocked} />
        <JobColumn title="Completed" jobs={groups.completed} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={buttonClass.ghost} data-testid="resolve-block" disabled={pending || !canCreate || !snapshot.recoverableFailure} onClick={onResolve}>
          Resolve block
        </button>
        <button type="button" className={buttonClass.ghost} data-testid="approve" disabled={pending || !canApprove || !snapshot.pendingApprovalJobId} onClick={onApprove}>
          Approve
        </button>
      </div>
      <div className="mt-3">
        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Recent events</p>
        <ul className="mt-2 space-y-2">
          {events.length === 0 && <li className="text-sm text-slate-500">No events yet.</li>}
          {events.map((event) => (
            <li key={`${event.jobId}-${event.action}-${event.at}`} className="rounded-2xl border border-white/10 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>{event.action}</span>
                <SimBadge />
              </div>
              <p className="text-slate-400">{taskTitle(event.kind, event.inputs)}</p>
            </li>
          ))}
        </ul>
      </div>
      <ul className="mt-3 space-y-2">
        {snapshot.missions.map((mission) => (
          <li key={mission.id} data-testid={`mission-${mission.id}`} className="rounded-2xl border border-white/10 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{mission.title}</p>
              <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{mission.completedAt ? "Done" : "Open"}</span>
            </div>
            <p className="text-xs text-slate-500">{mission.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AgentsBoard({ snapshot }: { snapshot: FactorySnapshot }) {
  return (
    <section className="h-full overflow-y-auto px-3 py-3" data-testid="agents-board">
      <h2 className="text-lg font-semibold tracking-tight">Agents and crew</h2>
      <p className="text-sm text-slate-400">Department crews are simulated. Authenticated AI workers are not connected.</p>
      <ul className="mt-3 space-y-2">
        {snapshot.stations.map((station) => {
          const job =
            snapshot.jobs.find((item) => item.id === station.activeJobId) ??
            [...snapshot.jobs].reverse().find((item) => item.inputs.stationId === station.id && item.status === "failed");
          return (
            <li key={station.id} className="hud-card rounded-2xl px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{station.shortName} crew</p>
                <SimBadge />
              </div>
              <p className="text-sm text-slate-300">{STATUS_LABEL[station.status]} · {job ? job.outputs?.reason ?? taskTitle(job.kind, job.inputs) : "No current task"}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-[#7C3AED]" style={{ width: `${Math.round(station.progress * 100)}%` }} />
              </div>
              <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">Not an external agent · writes off</p>
            </li>
          );
        })}
      </ul>
      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Approved worker contracts</p>
        <ul className="mt-2 space-y-2">
          {FUTURE_WORKERS.map((worker) => (
            <li key={worker.id} className="rounded-2xl border border-white/10 px-3 py-2 text-sm text-slate-300">
              <p className="text-slate-100">{worker.system} · {worker.mode}</p>
              <p>{worker.permissionScope}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Not connected · owner approval required before any write</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Count({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 px-2 py-2 text-center">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[9px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
    </div>
  );
}

function JobColumn({ title, jobs }: { title: string; jobs: FactorySnapshot["jobs"] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{title} · {jobs.length}</p>
      <ul className="mt-1 space-y-1">
        {jobs.slice(0, 3).map((job) => (
          <li key={job.id} className="text-xs text-slate-200">
            {taskTitle(job.kind, job.inputs)} <SimBadge />
          </li>
        ))}
        {jobs.length === 0 && <li className="text-xs text-slate-500">None</li>}
      </ul>
    </div>
  );
}
