import { NextResponse } from "next/server";
import { requireMutation } from "@/src/auth/guard";
import { jsonError } from "@/src/jobs/http";
import { approveFactoryJob, readFactorySnapshot, withFactory } from "@/src/jobs/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const role = requireMutation(request, "approve");
    const { id } = await context.params;
    if (!/^job_[A-Za-z0-9-]{8,80}$/.test(id)) {
      return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Job id is not valid." } }, { status: 400 });
    }
    const result = await withFactory(() => {
      const job = approveFactoryJob(id, role);
      return { job, factory: readFactorySnapshot() };
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
