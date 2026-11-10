import type { MachineStatus } from "@/src/domain/types";

export const STATUS_HEX: Record<MachineStatus, string> = {
  idle: "#64748B",
  working: "#7C3AED",
  blocked: "#F5B942",
  awaiting_approval: "#C4B5FD",
  completed: "#34D399",
};

export const STATUS_LABEL: Record<MachineStatus, string> = {
  idle: "Idle",
  working: "Working",
  blocked: "Blocked",
  awaiting_approval: "Awaiting approval",
  completed: "Completed",
};

export function formatResourceAmount(id: string, amount: number): string {
  if (id === "revenue") return `$${amount.toLocaleString("en-US")}`;
  return amount.toLocaleString("en-US");
}

export const buttonClass = {
  primary:
    "inline-flex min-h-11 items-center justify-center rounded-full bg-[#7C3AED] px-4 text-sm font-medium text-white transition hover:bg-[#6D28D9] disabled:cursor-not-allowed disabled:opacity-40",
  ghost:
    "inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 text-sm font-medium text-slate-100 transition hover:border-[#C4B5FD]/50 disabled:cursor-not-allowed disabled:opacity-40",
  tiny:
    "inline-flex min-h-9 items-center justify-center rounded-full border border-white/10 px-3 text-xs font-medium text-slate-200 transition hover:border-[#C4B5FD]/40 disabled:opacity-40",
};
