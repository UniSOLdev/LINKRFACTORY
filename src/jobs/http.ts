import { NextResponse } from "next/server";
import { WorkflowError, statusForError } from "@/src/jobs/errors";

export function jsonError(error: unknown) {
  if (error instanceof WorkflowError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: statusForError(error.code) },
    );
  }
  console.error(error);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Factory job system failed." } }, { status: 500 });
}
