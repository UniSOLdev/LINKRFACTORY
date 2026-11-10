import { NextResponse } from "next/server";
import { jsonError } from "@/src/jobs/http";
import { readFactoryJob, withFactory } from "@/src/jobs/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ job: await withFactory(() => readFactoryJob(id)) });
  } catch (error) {
    return jsonError(error);
  }
}
