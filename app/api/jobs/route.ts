import { NextResponse } from "next/server";
import { jsonError } from "@/src/jobs/http";
import { createFactoryJob, readFactorySnapshot, withFactory } from "@/src/jobs/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await withFactory(() => readFactorySnapshot());
    return NextResponse.json({ jobs: snapshot.jobs });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { kind?: unknown; inputs?: unknown; simulation?: unknown };
    const result = await withFactory(() => {
      const job = createFactoryJob(body);
      return { job, factory: readFactorySnapshot() };
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
