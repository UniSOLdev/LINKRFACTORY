import { canPerform, type Mutation, type Role } from "@/src/auth/permissions";
import { consumeRateLimit } from "@/src/auth/rate-limit";
import { readSession, SESSION_COOKIE, signInConfigured } from "@/src/auth/session";
import { WorkflowError } from "@/src/jobs/errors";

function cookieValue(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "local";
}

export function currentRole(request: Request, nowMs = Date.now()): Role | null {
  return readSession(cookieValue(request.headers.get("cookie"), SESSION_COOKIE), nowMs)?.role ?? null;
}

export function requireMutation(request: Request, action: Mutation, nowMs = Date.now()): Role {
  if (!signInConfigured()) {
    throw new WorkflowError("UNAUTHORIZED", "Sign-in is not configured on this deployment.");
  }
  const role = currentRole(request, nowMs);
  if (!role) throw new WorkflowError("UNAUTHORIZED", "Sign in before changing the factory.");
  if (!canPerform(role, action)) {
    throw new WorkflowError("FORBIDDEN", `The ${role} role cannot ${action} factory work.`);
  }
  const limit = consumeRateLimit(`${clientKey(request)}:${action}`, nowMs);
  if (!limit.allowed) throw new WorkflowError("RATE_LIMITED", "Too many changes. Wait a minute and try again.");
  return role;
}
