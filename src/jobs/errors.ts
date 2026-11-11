export type WorkflowErrorCode =
  | "INVALID_TRANSITION"
  | "APPROVAL_REQUIRED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SIMULATION_ONLY"
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED";

export class WorkflowError extends Error {
  readonly code: WorkflowErrorCode;

  constructor(code: WorkflowErrorCode, message: string) {
    super(message);
    this.name = "WorkflowError";
    this.code = code;
  }
}

export function statusForError(code: WorkflowErrorCode): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "RATE_LIMITED":
      return 429;
    case "CONFLICT":
    case "APPROVAL_REQUIRED":
      return 409;
    case "SIMULATION_ONLY":
      return 422;
    default:
      return 400;
  }
}
