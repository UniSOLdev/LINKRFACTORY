import { NextResponse } from "next/server";
import { jsonError } from "@/src/jobs/http";
import { approveFactoryJob, readFactorySnapshot, withFactory } from "@/src/jobs/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await withFactory(() => {
      const job = approveFactoryJob(id);
      return { job, factory: readFactorySnapshot() };
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
