import { NextResponse } from "next/server";
import { jsonError } from "@/src/jobs/http";
import { resetFactory, withFactory } from "@/src/jobs/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json(await withFactory(() => resetFactory()));
  } catch (error) {
    return jsonError(error);
  }
}
