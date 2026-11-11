"use client";

import { useCallback, useEffect, useState } from "react";
import { buttonClass } from "@/lib/format";
import type { Role } from "@/src/auth/permissions";

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

interface OperationsBoard {
  role: Role | null;
  observedAt: string;
  lastSynchronization: string;
  jobs: {
    simulated: number;
    actual: number;
    blocked: Array<{ id: string; name: string }>;
    approvals: Array<{ id: string; kind: string }>;
  };
  history: Array<{ at: string; action: string; detail: string; jobId: string }>;
  systems: SystemRow[];
  externalWritesEnabled: false;
}

const STATE_LABEL: Record<SystemRow["state"], string> = {
  connected: "Connected",
  degraded: "Degraded",
  not_connected: "NOT CONNECTED",
};

export function CommandCenter({
  role,
  pending,
  canCreate,
  canApprove,
  canReset,
  pendingApproval,
  onRole,
  onStart,
  onApprove,
  onReset,
  onClose,
}: {
  role: Role | null;
  pending: boolean;
  canCreate: boolean;
  canApprove: boolean;
  canReset: boolean;
  pendingApproval: boolean;
  onRole: (role: Role | null) => void;
  onStart: () => void;
  onApprove: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [board, setBoard] = useState<OperationsBoard | null>(null);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/operations", { cache: "no-store" });
    if (!response.ok) throw new Error("Operations status could not be loaded.");
    setBoard((await response.json()) as OperationsBoard);
  }, []);

  useEffect(() => {
    void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Operations status failed."));
  }, [load]);

  const signIn = async () => {
    setMessage(null);
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = (await response.json()) as { role?: Role; error?: { message?: string } };
    if (!response.ok || !body.role) {
      setMessage(body.error?.message ?? "Sign-in failed.");
      return;
    }
    setPassword("");
    onRole(body.role);
    setMessage(`Signed in as ${body.role}. External writes stay off.`);
    await load();
  };

  const signOut = async () => {
    await fetch("/api/session", { method: "DELETE" });
    onRole(null);
    setMessage("Signed out.");
  };

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/55 p-2 sm:items-center sm:p-6" data-testid="command-center">
      <section className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0B0F1A] shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.38em] text-slate-500">Command center</p>
            <h2 className="text-xl font-semibold tracking-tight">Live operations</h2>
            <p className="text-sm text-slate-400">{role ? `Signed in as ${role}` : "Viewing the floor. Sign in to change it."}</p>
          </div>
          <button type="button" className={buttonClass.tiny} onClick={onClose}>
            Close
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Factory key"
              className="min-h-11 flex-1 rounded-full border border-white/10 bg-black/30 px-4 text-sm outline-none focus:border-[#C4B5FD]"
              data-testid="sign-in-password"
            />
            <button type="button" className={buttonClass.primary} data-testid="sign-in" onClick={() => void signIn()}>
              Sign in
            </button>
            {role && (
              <button type="button" className={buttonClass.ghost} onClick={() => void signOut()}>
                Sign out
              </button>
            )}
          </div>
          {message && <p className="text-sm text-[#C4B5FD]">{message}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass.primary} disabled={pending || !canCreate} onClick={onStart}>
              Start simulated lead
            </button>
            <button type="button" className={buttonClass.ghost} disabled={pending || !canApprove || !pendingApproval} onClick={onApprove}>
              Approve
            </button>
            <button type="button" className={buttonClass.ghost} disabled={pending || !canReset} onClick={onReset}>
              Reset simulation
            </button>
          </div>
          {board && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <Stat label="Last synchronization" value={new Date(board.lastSynchronization).toLocaleString()} />
                <Stat label="Jobs" value={`${board.jobs.simulated} simulated · ${board.jobs.actual} verified`} />
                <Stat label="Blocked" value={board.jobs.blocked.length ? board.jobs.blocked.map((item) => item.name).join(", ") : "None"} />
                <Stat label="Approvals" value={board.jobs.approvals.length ? `${board.jobs.approvals.length} required` : "None"} />
              </div>
              <ul className="space-y-2">
                {board.systems.map((system) => (
                  <li key={system.id} className="rounded-2xl border border-white/10 px-3 py-2" data-testid={`system-${system.id}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{system.label}</p>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400" data-state={system.state}>
                        {STATE_LABEL[system.state]}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-slate-300">{system.health}</p>
                    <p className="text-sm text-slate-400">{system.detail}</p>
                    {system.evidence && <p className="mt-1 break-all font-mono text-xs text-[#C4B5FD]">{system.evidence}</p>}
                    <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">Writes disabled</p>
                  </li>
                ))}
              </ul>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Action history</p>
                <ul className="mt-2 space-y-2">
                  {board.history.length === 0 && <li className="text-sm text-slate-400">No actions yet.</li>}
                  {board.history.map((entry) => (
                    <li key={`${entry.jobId}-${entry.action}-${entry.at}`} className="text-sm text-slate-300">
                      <span className="text-slate-500">{entry.action}</span> {entry.detail}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-slate-500">External writes, advertising spend, payments, and production deployments are disabled.</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-100">{value}</p>
    </div>
  );
}
