import { NextResponse } from "next/server";
import { jsonError } from "@/src/jobs/http";
import { readFactorySnapshot, withFactory } from "@/src/jobs/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await withFactory(() => readFactorySnapshot()));
  } catch (error) {
    return jsonError(error);
  }
}
