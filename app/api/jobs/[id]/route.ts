import { NextResponse } from "next/server";
import { jsonError } from "@/src/jobs/http";
import { readFactoryJob } from "@/src/jobs/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ job: readFactoryJob(id) });
  } catch (error) {
    return jsonError(error);
  }
}
