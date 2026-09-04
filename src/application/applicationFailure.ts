export type ApplicationFailureKind =
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "payload_too_large";

/** A customer-safe failure that application and delivery seams may translate. */
export class ApplicationFailure extends Error {
  constructor(
    readonly kind: ApplicationFailureKind,
    readonly code: string,
    readonly safeMessage: string,
  ) {
    super(safeMessage);
    this.name = "ApplicationFailure";
  }
}
