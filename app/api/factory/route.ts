import { NextResponse } from "next/server";
import { jsonError } from "@/src/jobs/http";
import { readFactorySnapshot } from "@/src/jobs/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    return NextResponse.json(readFactorySnapshot());
  } catch (error) {
    return jsonError(error);
  }
}
