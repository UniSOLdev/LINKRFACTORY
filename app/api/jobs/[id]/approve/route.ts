import { NextResponse } from "next/server";
import { jsonError } from "@/src/jobs/http";
import { approveFactoryJob, readFactorySnapshot } from "@/src/jobs/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const job = approveFactoryJob(id);
    return NextResponse.json({ job, factory: readFactorySnapshot() });
  } catch (error) {
    return jsonError(error);
  }
}
