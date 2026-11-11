import { NextResponse } from "next/server";
import { clientKey, currentRole } from "@/src/auth/guard";
import { consumeRateLimit } from "@/src/auth/rate-limit";
import {
  clearSessionCookieHeader,
  issueSession,
  roleForPassword,
  sessionCookieHeader,
  signInConfigured,
} from "@/src/auth/session";
import { assertPasswordBody, readJsonLimited } from "@/src/auth/validate";
import { jsonError } from "@/src/jobs/http";
import { WorkflowError } from "@/src/jobs/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.json({
    role: currentRole(request),
    configured: signInConfigured(),
  });
}

export async function POST(request: Request) {
  try {
    if (!signInConfigured()) {
      throw new WorkflowError("UNAUTHORIZED", "Sign-in is not configured on this deployment.");
    }
    const limit = consumeRateLimit(`signin:${clientKey(request)}`, Date.now(), 10);
    if (!limit.allowed) throw new WorkflowError("RATE_LIMITED", "Too many sign-in attempts. Wait a minute.");
    const password = assertPasswordBody(await readJsonLimited(request));
    const role = roleForPassword(password);
    if (!role) throw new WorkflowError("UNAUTHORIZED", "That key was not accepted.");
    const token = issueSession(role);
    if (!token) throw new WorkflowError("UNAUTHORIZED", "Sign-in is not configured on this deployment.");
    return NextResponse.json(
      { role },
      { headers: { "set-cookie": sessionCookieHeader(token) } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE() {
  return NextResponse.json({ role: null }, { headers: { "set-cookie": clearSessionCookieHeader() } });
}
