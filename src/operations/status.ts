export type ConnectionState = "connected" | "degraded" | "not_connected";

export interface SystemStatus {
  id: string;
  label: string;
  state: ConnectionState;
  health: string;
  writesEnabled: false;
  evidence: string | null;
  detail: string;
  observedAt: string | null;
}

function system(
  id: string,
  label: string,
  state: ConnectionState,
  health: string,
  detail: string,
  evidence: string | null = null,
  observedAt: string | null = null,
): SystemStatus {
  return { id, label, state, health, writesEnabled: false, evidence, detail, observedAt };
}

export function notConnected(id: string, label: string, detail: string): SystemStatus {
  return system(id, label, "not_connected", "NOT CONNECTED", detail);
}

export function githubFromResponse(status: number, body: unknown, observedAt: string): SystemStatus {
  if (status !== 200 || !body || typeof body !== "object") {
    return system(
      "github",
      "GitHub",
      "degraded",
      "Commit API did not return a commit",
      `The public commits endpoint returned HTTP ${status}. No write was attempted.`,
      null,
      observedAt,
    );
  }
  const record = body as { sha?: unknown; commit?: { message?: unknown; committer?: { date?: unknown } } };
  if (typeof record.sha !== "string" || !record.commit || typeof record.commit.message !== "string") {
    return system("github", "GitHub", "degraded", "Commit payload was incomplete", "GitHub responded, but the commit fields were missing.", null, observedAt);
  }
  const when = typeof record.commit.committer?.date === "string" ? record.commit.committer.date : observedAt;
  const message = record.commit.message.split("\n")[0]?.slice(0, 180) ?? "";
  return system(
    "github",
    "GitHub",
    "connected",
    "Read-only commit API responded",
    message,
    record.sha,
    when,
  );
}

export function vercelFromEnv(env: Record<string, string | undefined>, observedAt: string): SystemStatus {
  if (env.VERCEL !== "1") {
    return notConnected(
      "vercel",
      "Vercel",
      "This process is not a Vercel deployment, so deployment status is not verified here.",
    );
  }
  const sha = env.VERCEL_GIT_COMMIT_SHA;
  const ref = env.VERCEL_GIT_COMMIT_REF ?? "unknown ref";
  const target = env.VERCEL_ENV ?? "unknown";
  const host = env.VERCEL_URL ?? "unknown host";
  if (!sha) {
    return system(
      "vercel",
      "Vercel",
      "degraded",
      "Deployment metadata is incomplete",
      "Vercel is running this process, but it did not inject a commit SHA.",
      null,
      observedAt,
    );
  }
  return system(
    "vercel",
    "Vercel",
    "connected",
    `Read-only ${target} deployment metadata`,
    `${ref} at ${host}. This monitor cannot start, promote, or roll back a deployment.`,
    sha,
    observedAt,
  );
}

export async function readGithubStatus(nowIso: string): Promise<SystemStatus> {
  try {
    const response = await fetch("https://api.github.com/repos/UniSOLdev/LINKRFACTORY/commits/main", {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "linkr-factory",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const body = response.ok ? ((await response.json()) as unknown) : null;
    return githubFromResponse(response.status, body, nowIso);
  } catch {
    return system(
      "github",
      "GitHub",
      "degraded",
      "Commit API could not be reached",
      "The read-only commit request failed. No write was attempted.",
      null,
      nowIso,
    );
  }
}

export const UNCONFIGURED_SYSTEMS: SystemStatus[] = [
  notConnected("shopify", "Shopify", "No store credentials are configured, and store writes are disabled."),
  notConnected("meta", "Meta", "No ad or publishing credentials are configured. Spend and publishing stay off."),
  notConnected("google-drive", "Google Drive", "No Drive credentials are configured. File writes stay off."),
  notConnected("cursor", "Cursor", "No agent worker is authorized to change this factory."),
  notConnected("muse", "Muse", "No Muse connection is configured."),
];
