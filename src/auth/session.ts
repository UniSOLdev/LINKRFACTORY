import { createHash, createHmac, timingSafeEqual } from "crypto";
import { isRole, type Role } from "@/src/auth/permissions";

export const SESSION_COOKIE = "linkr_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

export interface SessionClaims {
  role: Role;
  exp: number;
}

function secret(): string | null {
  const value = process.env.LINKR_SESSION_SECRET;
  if (!value || value.length < 16) return null;
  return value;
}

function passwords(): Record<Role, string | undefined> {
  return {
    administrator: process.env.LINKR_ADMIN_PASSWORD,
    operator: process.env.LINKR_OPERATOR_PASSWORD,
    viewer: process.env.LINKR_VIEWER_PASSWORD,
  };
}

function sameSecret(input: string, expected: string): boolean {
  const left = createHash("sha256").update(input).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function signInConfigured(): boolean {
  return Boolean(secret() && Object.values(passwords()).some(Boolean));
}

export function roleForPassword(password: string): Role | null {
  if (!password || password.length > 200) return null;
  const configured = passwords();
  for (const role of ["administrator", "operator", "viewer"] as const) {
    const expected = configured[role];
    if (expected && sameSecret(password, expected)) return role;
  }
  return null;
}

export function issueSession(role: Role, nowMs = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const body = Buffer.from(JSON.stringify({ role, exp: nowMs + MAX_AGE_SECONDS * 1000 })).toString("base64url");
  const mac = createHmac("sha256", key).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readSession(token: string | undefined, nowMs = Date.now()): SessionClaims | null {
  const key = secret();
  if (!key || !token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", key).update(body).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { role?: unknown; exp?: unknown };
    if (typeof parsed.role !== "string" || !isRole(parsed.role)) return null;
    if (typeof parsed.exp !== "number" || parsed.exp < nowMs) return null;
    return { role: parsed.role, exp: parsed.exp };
  } catch {
    return null;
  }
}

export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}
