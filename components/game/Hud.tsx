"use client";

import type { ReactNode } from "react";
import { formatResourceAmount } from "@/lib/format";
import type { Role } from "@/src/auth/permissions";
import type { FactorySnapshot } from "@/src/domain/derive";

export type GameTab = "factory" | "operations" | "missions" | "agents";

const TABS: Array<{ id: GameTab; label: string }> = [
  { id: "factory", label: "Factory" },
  { id: "operations", label: "Operations" },
  { id: "missions", label: "Missions" },
  { id: "agents", label: "Agents" },
];

export function GameHeader({
  snapshot,
  clock,
  children,
}: {
  snapshot: FactorySnapshot | null;
  clock: string;
  children?: ReactNode;
}) {
  const status = snapshot?.workflow.status ?? "idle";
  const tone = status === "blocked" ? "text-[#F5B942]" : status === "awaiting_approval" ? "text-[#C4B5FD]" : "text-[#34D399]";
  return (
    <header className="shrink-0 border-b border-white/10 bg-[#07060f]/95 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#7C3AED] text-sm font-semibold">LF</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">LINKR Factory</p>
            <p className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Operating system</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1" data-testid="workflow-status">
          <span className={`h-2 w-2 rounded-full bg-current ${tone}`} />
          <span className={`text-[10px] font-medium uppercase tracking-[0.16em] ${tone}`}>{status.replaceAll("_", " ")}</span>
          <span className="ml-1 text-[10px] text-slate-400">{clock}</span>
        </div>
      </div>
      <p className="mt-2 truncate rounded-full border border-[#7C3AED]/40 bg-[#7C3AED]/15 px-3 py-1 text-[11px] text-[#DDD6FE]" data-testid="simulation-banner" data-simulation="true" data-verified="false">
        Simulation mode. Leads, tasks, and revenue are simulated.
      </p>
      {snapshot && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {snapshot.resources
            .filter((resource) => ["leads", "verifiedData", "opportunities", "tasks", "revenue"].includes(resource.id))
            .map((resource) => (
              <div key={resource.id} data-testid={`resource-${resource.id}`} data-simulation="true" data-verified="false" className="min-w-[5.6rem] shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] px-2 py-1">
                <p className="truncate text-[9px] uppercase tracking-[0.14em] text-slate-500">{resource.name}</p>
                <p className="text-sm font-semibold">
                  {formatResourceAmount(resource.id, resource.amount)}
                  <span className="ml-1 text-[9px] uppercase tracking-[0.14em] text-[#A78BFA]">sim</span>
                </p>
              </div>
            ))}
        </div>
      )}
      {children}
    </header>
  );
}

export function GameNav({ tab, onChange }: { tab: GameTab; onChange: (tab: GameTab) => void }) {
  return (
    <nav className="shrink-0 border-t border-white/10 bg-[#0B0714] px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1" data-testid="bottom-nav">
      <div className="mx-auto grid w-full max-w-md grid-cols-4">
      {TABS.map((item) => {
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`tab-${item.id}`}
            className={`min-h-12 rounded-2xl text-xs font-medium ${active ? "bg-[#7C3AED] text-white" : "text-slate-400"}`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
        </button>
      );
    })}
      </div>
    </nav>
  );
}

export function SimBadge() {
  return <span className="rounded-full bg-[#7C3AED]/20 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[#C4B5FD]">Sim</span>;
}

export function RoleLine({ role }: { role: Role | null }) {
  return <p className="text-xs text-slate-400">{role ? `Signed in as ${role}` : "Viewing. Sign in to change the factory."}</p>;
}
