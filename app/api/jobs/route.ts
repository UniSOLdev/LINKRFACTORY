import { NextResponse } from "next/server";
import { requireMutation } from "@/src/auth/guard";
import { assertJobBody, readJsonLimited } from "@/src/auth/validate";
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
    const role = requireMutation(request, "create");
    const body = assertJobBody(await readJsonLimited(request));
    const result = await withFactory(() => {
      const job = createFactoryJob(body, role);
      return { job, factory: readFactorySnapshot() };
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
