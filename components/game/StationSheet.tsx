"use client";

import { useState, type ReactNode } from "react";
import { buttonClass, STATUS_LABEL } from "@/lib/format";
import { taskTitle } from "@/src/domain/catalog";
import type { FactorySnapshot, StationView } from "@/src/domain/derive";
import type { JobRecord, StationId } from "@/src/domain/types";
import { SimBadge } from "@/components/game/Hud";

const TABS = ["Overview", "Jobs", "Agents", "Outputs", "Logs"] as const;

const PLANNED: Partial<Record<StationId, string>> = {
  research: "Lead research agent",
  creative: "Proposals agent",
  outreach: "Outreach channel",
  crm: "CRM sync",
  delivery: "Delivery handoff",
};

export function StationSheet({
  station,
  snapshot,
  pending,
  canCreate,
  expanded,
  onToggle,
  onClose,
  onBuild,
  onUpgrade,
  onConfigure,
}: {
  station: StationView;
  snapshot: FactorySnapshot;
  pending: boolean;
  canCreate: boolean;
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  onBuild: (id: StationId) => void;
  onUpgrade: (id: StationId) => void;
  onConfigure: (id: StationId, shift: string) => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const jobs = snapshot.jobs.filter((job) => job.inputs.stationId === station.id);
  const active = jobs.filter((job) => job.status === "running" || job.status === "queued" || job.status === "awaiting_approval");
  const queued = jobs.filter((job) => job.status === "queued");
  const blocked = jobs.filter((job) => job.status === "failed");
  const approvals = jobs.filter((job) => job.status === "awaiting_approval");
  const verified = jobs.filter((job) => Boolean((job.outputs as { verified?: boolean } | null)?.verified));
  const latest = [...jobs].reverse().find((job) => job.outputs?.summary);

  return (
    <section
      data-testid="detail-panel"
      className="station-sheet hud-card absolute inset-x-2 bottom-2 z-20 overflow-hidden rounded-3xl"
      style={{ maxHeight: expanded ? "68%" : "9.5rem" }}
    >
      <div className="flex items-start justify-between gap-2 px-3 py-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Department</p>
          <h2 className="truncate text-lg font-semibold tracking-tight">{station.name}</h2>
          <p className="text-xs text-slate-400">{STATUS_LABEL[station.status]} · level {station.level}</p>
        </div>
        <div className="flex gap-1">
          <button type="button" className={buttonClass.tiny} onClick={onToggle}>{expanded ? "Peek" : "Open"}</button>
          <button type="button" className={buttonClass.tiny} onClick={onClose}>Close</button>
        </div>
      </div>
      {!expanded && (
        <div className="flex gap-2 overflow-x-auto px-3 pb-3">
          <StationActions station={station} pending={pending || !canCreate} onBuild={onBuild} onUpgrade={onUpgrade} onConfigure={onConfigure} />
        </div>
      )}
      {expanded && (
        <div className="max-h-[calc(68vh-4.5rem)] overflow-y-auto px-3 pb-4">
          <p className="text-sm leading-relaxed text-slate-300">{station.summary}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Metric label="Queue" value={String(queued.length)} />
            <Metric label="Throughput" value={station.built ? `${station.throughputPerMinute}/min` : "Offline"} />
            <Metric label="Progress" value={`${Math.round(station.progress * 100)}%`} />
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#7C3AED]" style={{ width: `${Math.round(station.progress * 100)}%` }} />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto">
            <StationActions station={station} pending={pending || !canCreate} onBuild={onBuild} onUpgrade={onUpgrade} onConfigure={onConfigure} />
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {TABS.map((item) => (
              <button key={item} type="button" className={`min-h-10 shrink-0 rounded-full px-3 text-xs ${tab === item ? "bg-[#7C3AED] text-white" : "border border-white/10 text-slate-300"}`} onClick={() => setTab(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {tab === "Overview" && (
              <>
                <Info title="Integration">
                  {PLANNED[station.id] ? `${PLANNED[station.id]} is not connected. No live read or write runs from this station.` : "No external integration is assigned."}
                </Info>
                <Info title="Agent assignment">
                  One simulated crew member follows this department. <SimBadge /> It is not an authenticated AI worker.
                </Info>
                <Info title="Blocked work">{blocked.length ? blocked.map((job) => job.outputs?.reason ?? job.outputs?.summary).join(" ") : "None."}</Info>
                <Info title="Approval requests">{approvals.length ? `${approvals.length} waiting in the app. Nothing is sent.` : "None."}</Info>
                <Info title="Verified results">{verified.length ? `${verified.length} verified` : "None. Simulated output stays unverified."}</Info>
              </>
            )}
            {tab === "Jobs" && <JobList jobs={active.length ? active : jobs.slice(-4).reverse()} empty="No jobs on this station yet." />}
            {tab === "Agents" && (
              <Info title="Simulated crew">
                Status {STATUS_LABEL[station.status]}. Current task: {station.activeJobId ? taskTitle(jobs.find((job) => job.id === station.activeJobId)?.kind ?? "station.configure", jobs.find((job) => job.id === station.activeJobId)?.inputs ?? {}) : "Idle"}. <SimBadge />
              </Info>
            )}
            {tab === "Outputs" && (
              <Info title="Artifacts">
                {latest?.outputs?.summary ?? "No artifact yet."} {latest ? <SimBadge /> : null}
              </Info>
            )}
            {tab === "Logs" && <AuditList jobs={jobs} />}
          </div>
        </div>
      )}
    </section>
  );
}

function StationActions({
  station,
  pending,
  onBuild,
  onUpgrade,
  onConfigure,
}: {
  station: StationView;
  pending: boolean;
  onBuild: (id: StationId) => void;
  onUpgrade: (id: StationId) => void;
  onConfigure: (id: StationId, shift: string) => void;
}) {
  return (
    <>
      {!station.built && (
        <button type="button" className={buttonClass.primary} disabled={pending} data-testid="build-station" onClick={() => onBuild(station.id)}>
          Build station
        </button>
      )}
      {station.built && (
        <button type="button" className={buttonClass.primary} disabled={pending} data-testid="upgrade-station" onClick={() => onUpgrade(station.id)}>
          Upgrade
        </button>
      )}
      {station.built && (
        <button type="button" className={buttonClass.ghost} disabled={pending} data-testid="configure-station" onClick={() => onConfigure(station.id, station.config.shift === "night" ? "day" : "night")}>
          {station.config.shift === "night" ? "Day profile" : "Night profile"}
        </button>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 px-2 py-2">
      <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function Info({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-slate-300">
      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <p className="mt-1 leading-relaxed">{children}</p>
    </div>
  );
}

function JobList({ jobs, empty }: { jobs: JobRecord[]; empty: string }) {
  if (!jobs.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {jobs.map((job) => (
        <li key={job.id} className="rounded-2xl border border-white/10 px-3 py-2 text-sm" data-simulation="true" data-verified="false">
          <div className="flex items-center justify-between gap-2">
            <span>{taskTitle(job.kind, job.inputs)}</span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{job.status.replaceAll("_", " ")}</span>
          </div>
          <div className="mt-1"><SimBadge /></div>
        </li>
      ))}
    </ul>
  );
}

function AuditList({ jobs }: { jobs: JobRecord[] }) {
  const entries = jobs.flatMap((job) => job.audit.map((entry) => ({ ...entry, id: job.id }))).slice(-6).reverse();
  if (!entries.length) return <p className="text-sm text-slate-500">No history yet.</p>;
  return (
    <ul className="space-y-2 text-sm text-slate-300">
      {entries.map((entry) => (
        <li key={`${entry.id}-${entry.at}-${entry.action}`}>
          <span className="text-slate-500">{entry.action}</span> {entry.detail}
        </li>
      ))}
    </ul>
  );
}
