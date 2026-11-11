import { WorkflowError } from "@/src/jobs/errors";

const MAX_BODY = 8_000;
const JOB_KEYS = new Set(["kind", "inputs", "simulation"]);

export async function readJsonLimited(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new WorkflowError("INVALID_INPUT", "Request is too large.");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new WorkflowError("INVALID_INPUT", "Request must be JSON.");
  }
}

export function assertJobBody(body: unknown): { kind?: unknown; inputs?: unknown; simulation?: unknown } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new WorkflowError("INVALID_INPUT", "Request must be a JSON object.");
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!JOB_KEYS.has(key)) throw new WorkflowError("INVALID_INPUT", "Request contains an unsupported field.");
  }
  if (record.simulation === false) {
    throw new WorkflowError("SIMULATION_ONLY", "This release only accepts simulated jobs.");
  }
  if (record.verified === true) {
    throw new WorkflowError("SIMULATION_ONLY", "Simulated jobs cannot be marked verified.");
  }
  if (record.inputs !== undefined) {
    if (!record.inputs || typeof record.inputs !== "object" || Array.isArray(record.inputs)) {
      throw new WorkflowError("INVALID_INPUT", "Job inputs must be an object.");
    }
    const inputs = record.inputs as Record<string, unknown>;
    if (inputs.verified === true || inputs.simulation === false) {
      throw new WorkflowError("SIMULATION_ONLY", "Simulated jobs cannot be marked verified.");
    }
    if (JSON.stringify(record.inputs).length > 4_000) {
      throw new WorkflowError("INVALID_INPUT", "Job inputs are too large.");
    }
  }
  return record;
}

export function assertPasswordBody(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new WorkflowError("INVALID_INPUT", "Request must be a JSON object.");
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "password") throw new WorkflowError("INVALID_INPUT", "Request contains an unsupported field.");
  }
  if (typeof record.password !== "string" || record.password.length < 8 || record.password.length > 200) {
    throw new WorkflowError("INVALID_INPUT", "Password is missing.");
  }
  return record.password;
}
