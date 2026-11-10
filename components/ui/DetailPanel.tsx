import type { FactorySnapshot, StationView } from "@/src/domain/derive";
import { buttonClass, STATUS_HEX, STATUS_LABEL } from "@/lib/format";

const LINE = new Set(["intake", "research", "qualification", "creative", "delivery"]);

export function DetailPanel({
  station,
  snapshot,
  pending,
  onBuild,
  onUpgrade,
  onConfigure,
  onClose,
}: {
  station: StationView | null;
  snapshot: FactorySnapshot;
  pending: boolean;
  onBuild: (stationId: StationView["id"]) => void;
  onUpgrade: (stationId: StationView["id"]) => void;
  onConfigure: (stationId: StationView["id"], shift: "day" | "night") => void;
  onClose: () => void;
}) {
  if (!station) {
    return (
      <section className="flex h-full flex-col gap-4 p-4" data-testid="detail-panel">
        <p className="text-[10px] font-medium uppercase tracking-[0.38em] text-slate-500">Floor</p>
        <h2 className="text-xl font-semibold tracking-tight">LINKR operating floor</h2>
        <p className="text-sm leading-relaxed text-slate-400">
          Select a building. Machine lights follow the job record: idle, working, blocked, awaiting approval, or completed.
        </p>
        <p className="text-sm leading-relaxed text-slate-400">
          Executor: simulation adapter. GitHub, Shopify, Meta, Google Drive, Supabase, Vercel, and the business agents are not connected.
        </p>
        <ul className="space-y-2 text-sm text-slate-300">
          {snapshot.plannedExecutors.map((executor) => (
            <li key={executor.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2">
              <span>{executor.purpose}</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Not connected</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const openJob = snapshot.jobs.find((job) => job.id === station.activeJobId) ?? null;
  const recent = snapshot.jobs.filter((job) => job.inputs.stationId === station.id).slice(-3).reverse();

  return (
    <section className="flex h-full flex-col gap-4 p-4" data-testid="detail-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.38em] text-slate-500">Department</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{station.name}</h2>
        </div>
        <button type="button" className={buttonClass.tiny} onClick={onClose}>
          Close
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs"
          data-testid="machine-status"
        >
          <span className="h-2 w-2 rounded-full" style={{ background: STATUS_HEX[station.status] }} />
          {STATUS_LABEL[station.status]}
        </span>
        <span className="rounded-full bg-[#7C3AED]/15 px-3 py-1 text-xs text-[#C4B5FD]">Simulated</span>
        {!station.built && <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">Not built</span>}
      </div>
      <p className="text-sm leading-relaxed text-slate-400">{station.summary}</p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <dt className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Throughput</dt>
          <dd className="mt-1 font-semibold" data-testid="throughput">
            {LINE.has(station.id) && station.built ? `${station.throughputPerMinute}/min` : "No live rate"}
          </dd>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <dt className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Level</dt>
          <dd className="mt-1 font-semibold" data-testid="station-level">
            {station.level}
          </dd>
        </div>
      </dl>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">Dependencies</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-300">
          {station.dependencies.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">Tasks</p>
        {station.tasks.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No jobs on this station yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {station.tasks.map((task) => (
              <li key={task.id} className="rounded-xl border border-white/10 px-3 py-2 text-sm" data-simulation="true" data-verified="false">
                <div className="flex items-center justify-between gap-2">
                  <span>{task.title}</span>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{task.status.replaceAll("_", " ")}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {openJob && (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Active job</p>
          <p className="mt-1 font-mono text-[11px] text-[#C4B5FD]">{openJob.id}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#7C3AED]" style={{ width: `${Math.round(station.progress * 100)}%` }} />
          </div>
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        {!station.built && (
          <button type="button" className={buttonClass.primary} disabled={pending} data-testid="build-station" onClick={() => onBuild(station.id)}>
            Build station
          </button>
        )}
        {station.built && LINE.has(station.id) && (
          <button type="button" className={buttonClass.primary} disabled={pending} data-testid="upgrade-station" onClick={() => onUpgrade(station.id)}>
            Upgrade throughput
          </button>
        )}
        {station.built && !LINE.has(station.id) && (
          <button type="button" className={buttonClass.primary} disabled={pending} data-testid="upgrade-station" onClick={() => onUpgrade(station.id)}>
            Upgrade station
          </button>
        )}
        {station.built && (
          <button
            type="button"
            className={buttonClass.ghost}
            disabled={pending}
            data-testid="configure-station"
            onClick={() => onConfigure(station.id, station.config.shift === "night" ? "day" : "night")}
          >
            Save {station.config.shift === "night" ? "day" : "night"} profile
          </button>
        )}
      </div>
      {recent.length > 0 && (
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">Audit</p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-400">
            {recent[0]?.audit.slice(-3).map((entry) => (
              <li key={`${entry.at}-${entry.action}`}>
                <span className="text-slate-200">{entry.action}</span> — {entry.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
