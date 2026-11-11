"use client";

import { useCallback, useEffect, useState } from "react";
import { FactoryView } from "@/components/factory/FactoryView";
import { AgentsBoard, MissionsBoard, OperationsBoard } from "@/components/game/Boards";
import { GameHeader, GameNav, type GameTab } from "@/components/game/Hud";
import { StationSheet } from "@/components/game/StationSheet";
import { fetchFactory, postApprove, postJob, postReset } from "@/lib/api";
import { buttonClass, STATUS_HEX, STATUS_LABEL } from "@/lib/format";
import type { Role } from "@/src/auth/permissions";
import type { FactorySnapshot, StationView } from "@/src/domain/derive";
import type { StationId } from "@/src/domain/types";
import { browserPreferenceStore } from "@/src/persistence/ui-prefs";

export function FactoryApp() {
  const [snapshot, setSnapshot] = useState<FactorySnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<StationId | null>(null);
  const [view, setView] = useState<"3d" | "map">("3d");
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState<GameTab>("factory");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [password, setPassword] = useState("");
  const [clock, setClock] = useState("");

  const adopt = useCallback((next: FactorySnapshot) => {
    setSnapshot((current) => (current && next.serverNow < current.serverNow ? current : next));
    setReceivedAt(Date.now());
  }, []);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }));
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
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
    setTab("factory");
    if (id) setSheetOpen(false);
  }, []);

  const signIn = async () => {
    setError(null);
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = (await response.json()) as { role?: Role; error?: { message?: string } };
    if (!response.ok || !body.role) {
      setError(body.error?.message ?? "Sign-in failed.");
      return;
    }
    setPassword("");
    setRole(body.role);
  };

  const signOut = async () => {
    await fetch("/api/session", { method: "DELETE" });
    setRole(null);
  };

  const station = snapshot?.stations.find((item) => item.id === selectedId) ?? null;
  const canCreate = role === "administrator" || role === "operator";
  const canApprove = role === "administrator";
  const canReset = role === "administrator";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#07060f] text-white">
      <GameHeader snapshot={snapshot} clock={clock}>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="truncate text-[11px] text-slate-400" data-testid="lead-label">
            {role ? role : "Signed out"}
            {snapshot?.lead ? ` · ${snapshot.lead.name}` : ""}
          </p>
          <button type="button" className={buttonClass.tiny} data-testid="open-command" onClick={() => setSettingsOpen((open) => !open)}>
            {settingsOpen ? "Hide" : "Settings"}
          </button>
        </div>
        {settingsOpen && (
          <div className="mt-2 space-y-2 rounded-2xl border border-white/10 bg-black/30 p-2" data-testid="settings-menu">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass.tiny} data-testid="view-toggle" onClick={() => setView((current) => (current === "3d" ? "map" : "3d"))}>
                {view === "3d" ? "Map" : "3D"}
              </button>
              <button type="button" className={buttonClass.tiny} data-testid="zoom-in" onClick={() => window.dispatchEvent(new CustomEvent("linkr-zoom", { detail: 1 }))}>Zoom in</button>
              <button type="button" className={buttonClass.tiny} data-testid="zoom-out" onClick={() => window.dispatchEvent(new CustomEvent("linkr-zoom", { detail: -1 }))}>Zoom out</button>
              <button type="button" className={buttonClass.tiny} data-testid="reset-camera" onClick={() => window.dispatchEvent(new Event("linkr-camera-reset"))}>Reset view</button>
              <button type="button" className={buttonClass.tiny} data-testid="reset-simulation" disabled={pending || !canReset} onClick={() => void act(postReset)}>Reset sim</button>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Factory key"
                className="min-h-11 flex-1 rounded-full border border-white/10 bg-black/40 px-3 text-sm outline-none"
                data-testid="sign-in-password"
              />
              <button type="button" className={buttonClass.primary} data-testid="sign-in" onClick={() => void signIn()}>Sign in</button>
              {role && (
                <button type="button" className={buttonClass.ghost} onClick={() => void signOut()}>Sign out</button>
              )}
            </div>
          </div>
        )}
        {error && <p className="mt-1 text-xs text-[#F5B942]" data-testid="factory-error">{error}</p>}
      </GameHeader>

      <div className="relative min-h-0 flex-1">
        {tab === "factory" && (
          <>
            {snapshot ? (
              <FactoryView snapshot={snapshot} selectedId={selectedId} receivedAt={receivedAt} view={view} onSelect={selectStation} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading factory state…</div>
            )}
            {snapshot && (
              <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex gap-1.5 overflow-x-auto px-2">
                {snapshot.stations.map((item) => (
                  <StationChip key={item.id} station={item} selected={item.id === selectedId} onSelect={selectStation} />
                ))}
              </div>
            )}
            {snapshot && station && (
              <StationSheet
                station={station}
                snapshot={snapshot}
                pending={pending}
                canCreate={canCreate}
                expanded={sheetOpen}
                onToggle={() => setSheetOpen((open) => !open)}
                onClose={() => selectStation(null)}
                onBuild={(id) => void act(() => postJob("station.build", { stationId: id }))}
                onUpgrade={(id) => void act(() => postJob("station.upgrade", { stationId: id }))}
                onConfigure={(id, shift) => void act(() => postJob("station.configure", { stationId: id, shift }))}
              />
            )}
          </>
        )}
        {tab === "operations" && <OperationsBoard />}
        {tab === "missions" && snapshot && (
          <MissionsBoard
            snapshot={snapshot}
            pending={pending}
            canCreate={canCreate}
            canApprove={canApprove}
            onStart={() => void act(() => postJob("lead.intake"))}
            onResolve={() => snapshot.recoverableFailure && void act(() => postJob("workflow.resolve_block", { failedJobId: snapshot.recoverableFailure?.jobId }))}
            onApprove={() => snapshot.pendingApprovalJobId && void act(() => postApprove(snapshot.pendingApprovalJobId!))}
          />
        )}
        {tab === "agents" && snapshot && <AgentsBoard snapshot={snapshot} />}
        {tab !== "factory" && !snapshot && <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading factory state…</div>}
      </div>
      <GameNav tab={tab} onChange={setTab} />
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
      className={`pointer-events-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs ${selected ? "border-[#C4B5FD] bg-[#7C3AED]" : "border-white/15 bg-black/70"}`}
      onClick={() => onSelect(station.id)}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: STATUS_HEX[station.status] }} />
      {station.shortName}
      <span className="sr-only">{STATUS_LABEL[station.status]}</span>
    </button>
  );
}
