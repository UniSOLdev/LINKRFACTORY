import { NextResponse } from "next/server";
import { jsonError } from "@/src/jobs/http";
import { resetFactory } from "@/src/jobs/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST() {
  try {
    return NextResponse.json(resetFactory());
  } catch (error) {
    return jsonError(error);
  }
}
