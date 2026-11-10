import type { FactorySnapshot } from "@/src/domain/derive";
import type { JobKind } from "@/src/domain/types";

async function readBody(response: Response): Promise<{ error?: { message?: string }; factory?: FactorySnapshot }> {
  return (await response.json()) as { error?: { message?: string }; factory?: FactorySnapshot };
}

export async function fetchFactory(): Promise<FactorySnapshot> {
  const response = await fetch("/api/factory", { cache: "no-store" });
  if (!response.ok) throw new Error("The factory state could not be loaded.");
  return (await response.json()) as FactorySnapshot;
}

export async function postJob(kind: JobKind, inputs: Record<string, unknown> = {}): Promise<FactorySnapshot> {
  const response = await fetch("/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, inputs, simulation: true }),
  });
  const body = await readBody(response);
  if (!response.ok || !body.factory) throw new Error(body.error?.message ?? "The job was rejected.");
  return body.factory;
}

export async function postApprove(id: string): Promise<FactorySnapshot> {
  const response = await fetch(`/api/jobs/${id}/approve`, { method: "POST" });
  const body = await readBody(response);
  if (!response.ok || !body.factory) throw new Error(body.error?.message ?? "Approval was rejected.");
  return body.factory;
}

export async function postReset(): Promise<FactorySnapshot> {
  const response = await fetch("/api/factory/reset", { method: "POST" });
  if (!response.ok) throw new Error("Reset failed.");
  return (await response.json()) as FactorySnapshot;
}
