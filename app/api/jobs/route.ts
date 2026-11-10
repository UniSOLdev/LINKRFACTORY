import { NextResponse } from "next/server";
import { jsonError } from "@/src/jobs/http";
import { createFactoryJob, readFactorySnapshot } from "@/src/jobs/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    const snapshot = readFactorySnapshot();
    return NextResponse.json({ jobs: snapshot.jobs });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { kind?: unknown; inputs?: unknown; simulation?: unknown };
    const job = createFactoryJob(body);
    return NextResponse.json({ job, factory: readFactorySnapshot() }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
