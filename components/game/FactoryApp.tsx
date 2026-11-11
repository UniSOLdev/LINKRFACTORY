"use client";

import { useCallback, useEffect, useState } from "react";
import { FactoryView } from "@/components/factory/FactoryView";
import { CommandCenter } from "@/components/game/CommandCenter";
import { DetailPanel } from "@/components/ui/DetailPanel";
import { MissionList } from "@/components/ui/MissionList";
import { fetchFactory, postApprove, postJob, postReset } from "@/lib/api";
import { buttonClass, formatResourceAmount, STATUS_HEX, STATUS_LABEL } from "@/lib/format";
import type { FactorySnapshot, StationView } from "@/src/domain/derive";
import type { Role } from "@/src/auth/permissions";
import type { StationId } from "@/src/domain/types";
import { browserPreferenceStore } from "@/src/persistence/ui-prefs";

export function FactoryApp() {
  const [snapshot, setSnapshot] = useState<FactorySnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<StationId | null>(null);
  const [view, setView] = useState<"3d" | "map">("3d");
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  const adopt = useCallback((next: FactorySnapshot) => {
    setSnapshot((current) => (current && next.serverNow < current.serverNow ? current : next));
    setReceivedAt(Date.now());
  }, []);

  useEffect(() => {
    void fetch("/api/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { role?: Role | null }) => setRole(body.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    const prefs = browserPreferenceStore.load();
    setSelectedId(prefs.selectedStationId);
    setView(prefs.view);
  }, []);

  useEffect(() => {
    browserPreferenceStore.save({ selectedStationId: selectedId, view });
  }, [selectedId, view]);

  useEffect(() => {
    let stop = false;
    const pull = async () => {
      try {
        const next = await fetchFactory();
        if (!stop) {
          adopt(next);
          setError(null);
        }
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "The factory could not be reached.");
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 800);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [adopt]);

  const act = useCallback(
    async (task: () => Promise<FactorySnapshot>) => {
      setPending(true);
      setError(null);
      try {
        adopt(await task());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      } finally {
        setPending(false);
      }
    },
    [adopt],
  );

  const selectStation = useCallback((id: StationId | null) => {
    setSelectedId(id);
    if (id) setMobileOpen(true);
  }, []);

  const station = snapshot?.stations.find((item) => item.id === selectedId) ?? null;
  const canCreate = role === "administrator" || role === "operator";
  const canApprove = role === "administrator";
  const canReset = role === "administrator";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink text-white">
        <header className="border-b border-white/10 bg-[#05070D] px-3 py-2 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.42em] text-slate-500">Operating system</p>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-semibold tracking-tight">LINKR</span>
                <span className="text-sm text-slate-400">Factory</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" className={buttonClass.tiny} data-testid="view-toggle" onClick={() => setView((current) => (current === "3d" ? "map" : "3d"))}>
                {view === "3d" ? "Map" : "3D"}
              </button>
              <button type="button" className={buttonClass.tiny} data-testid="zoom-in" onClick={() => window.dispatchEvent(new CustomEvent("linkr-zoom", { detail: 1 }))}>
                Zoom in
              </button>
              <button type="button" className={buttonClass.tiny} data-testid="zoom-out" onClick={() => window.dispatchEvent(new CustomEvent("linkr-zoom", { detail: -1 }))}>
                Zoom out
              </button>
              <button type="button" className={buttonClass.tiny} data-testid="reset-camera" onClick={() => window.dispatchEvent(new Event("linkr-camera-reset"))}>
                Reset view
              </button>
              <button type="button" className={buttonClass.tiny} data-testid="open-command" onClick={() => setCommandOpen(true)}>
                Command
              </button>
              <button type="button" className={buttonClass.tiny} data-testid="reset-simulation" disabled={pending || !canReset} onClick={() => void act(postReset)}>
                Reset simulation
              </button>
            </div>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#C4B5FD] sm:line-clamp-none" data-testid="simulation-banner" data-simulation="true" data-verified="false">
            {snapshot?.disclaimer ?? "All leads, tasks, deliverables, and revenue in LINKR Factory are simulated."}
          </p>
          {snapshot && (
            <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.16em] text-slate-300" data-testid="workflow-status">
                  {snapshot.workflow.status.replaceAll("_", " ")}
                </span>
                {snapshot.lead && (
                  <span className="truncate text-sm text-slate-200" data-testid="lead-label">
                    {snapshot.lead.name} · {snapshot.lead.company} · simulated lead
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {snapshot.workflow.status === "idle" && (
                  <button type="button" className={buttonClass.primary} data-testid="start-run" disabled={pending || !canCreate} onClick={() => void act(() => postJob("lead.intake"))}>
                    Start simulated lead
                  </button>
                )}
                {snapshot.recoverableFailure && (
                  <button type="button" className={buttonClass.primary} data-testid="resolve-block" disabled={pending || !canCreate} onClick={() => void act(() => postJob("workflow.resolve_block", { failedJobId: snapshot.recoverableFailure?.jobId }))}>
                    Resolve block
                  </button>
                )}
                {snapshot.pendingApprovalJobId && (
                  <button type="button" className={buttonClass.primary} data-testid="approve" disabled={pending || !canApprove} onClick={() => void act(() => postApprove(snapshot.pendingApprovalJobId!))}>
                    Approve
                  </button>
                )}
              </div>
            </div>
          )}
          {snapshot?.recoverableFailure && <p className="mt-2 text-sm text-[#F5B942]">{snapshot.recoverableFailure.reason}</p>}
          {snapshot?.pendingApprovalJobId && (
            <p className="mt-2 text-sm text-[#C4B5FD]">Approval required. The simulation stops here until you approve it. Nothing is sent.</p>
          )}
          {error && <p className="mt-2 text-sm text-[#F5B942]" data-testid="factory-error">{error}</p>}
          {snapshot && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {snapshot.resources.map((resource) => (
                <div
                  key={resource.id}
                  title={resource.definition}
                  data-testid={`resource-${resource.id}`}
                  data-simulation="true"
                  data-verified="false"
                  className="min-w-[6.4rem] shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5"
                >
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{resource.name}</p>
                  <p className="text-sm font-semibold">
                    {formatResourceAmount(resource.id, resource.amount)}
                    <span className="ml-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[#A78BFA]">sim</span>
                  </p>
                </div>
              ))}
            </div>
          )}
          {snapshot && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {snapshot.stations.map((item) => (
                <StationChip key={item.id} station={item} selected={item.id === selectedId} onSelect={selectStation} />
              ))}
            </div>
          )}
        </header>

        <div className="relative flex min-h-0 flex-1">
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-white/10 bg-[#0B0F1A] lg:block">
            {snapshot && <MissionList snapshot={snapshot} />}
          </aside>
          <div className="relative min-w-0 flex-1">
            <div className="absolute inset-0">
              {snapshot ? (
                <FactoryView snapshot={snapshot} selectedId={selectedId} receivedAt={receivedAt} view={view} onSelect={selectStation} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading factory state…</div>
              )}
            </div>
          </div>
          <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-white/10 bg-[#0B0F1A] lg:block">
            {snapshot && (
              <DetailPanel
                station={station}
                snapshot={snapshot}
                pending={pending || !canCreate}
                onClose={() => selectStation(null)}
                onBuild={(id) => void act(() => postJob("station.build", { stationId: id }))}
                onUpgrade={(id) => void act(() => postJob("station.upgrade", { stationId: id }))}
                onConfigure={(id, shift) => void act(() => postJob("station.configure", { stationId: id, shift }))}
              />
            )}
          </aside>
          {commandOpen && snapshot && (
            <CommandCenter
              role={role}
              pending={pending || !canCreate}
              canCreate={canCreate}
              canApprove={canApprove}
              canReset={canReset}
              pendingApproval={Boolean(snapshot.pendingApprovalJobId)}
              onRole={setRole}
              onStart={() => void act(() => postJob("lead.intake"))}
              onApprove={() => snapshot.pendingApprovalJobId && void act(() => postApprove(snapshot.pendingApprovalJobId!))}
              onReset={() => void act(postReset)}
              onClose={() => setCommandOpen(false)}
            />
          )}
        </div>

        {snapshot && (
          <div className="pointer-events-auto border-t border-white/10 bg-[#0B0F1A]/95 lg:hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
              data-testid="mobile-sheet"
              onClick={() => setMobileOpen((open) => !open)}
            >
              <span>{station ? station.name : "Missions and station"}</span>
              <span className="text-xs uppercase tracking-[0.16em] text-slate-400">{mobileOpen ? "Hide" : "Open"}</span>
            </button>
            {mobileOpen && (
              <div className="max-h-[48vh] overflow-y-auto">
                <MissionList snapshot={snapshot} />
                <DetailPanel
                  station={station}
                  snapshot={snapshot}
                  pending={pending || !canCreate}
                  onClose={() => selectStation(null)}
                  onBuild={(id) => void act(() => postJob("station.build", { stationId: id }))}
                  onUpgrade={(id) => void act(() => postJob("station.upgrade", { stationId: id }))}
                  onConfigure={(id, shift) => void act(() => postJob("station.configure", { stationId: id, shift }))}
                />
              </div>
            )}
          </div>
        )}
    </div>
  );
}

function StationChip({
  station,
  selected,
  onSelect,
}: {
  station: StationView;
  selected: boolean;
  onSelect: (id: StationId) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`station-chip-${station.id}`}
      onClick={() => onSelect(station.id)}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${selected ? "border-[#C4B5FD] bg-[#7C3AED]/20" : "border-white/10 bg-black/30"}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_HEX[station.status] }} />
      {station.shortName}
      <span className="sr-only">{STATUS_LABEL[station.status]}</span>
    </button>
  );
}
