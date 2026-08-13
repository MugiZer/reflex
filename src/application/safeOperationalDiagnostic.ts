const WINDOWS_PATH = /(?:[A-Za-z]:\\|\\\\)[^\s"']+/g;
const POSIX_PATH = /\/(?:[^\s"']+\/)*[^\s"']+/g;
const CREDENTIAL = /\b(password|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi;
const SQL = /\b(?:select|insert|update|delete|create|alter|drop)\b[\s\S]*/i;

export function safeOperationalDiagnostic(error: unknown): { name: string; message: string } {
  const name = error instanceof Error && error.name ? error.name : "Error";
  const rawMessage = error instanceof Error ? error.message : String(error);
  const firstLine = rawMessage.split(/\r?\n/, 1)[0] ?? "Unexpected failure";
  const message = SQL.test(firstLine)
    ? "Database operation failed."
    : firstLine
      .replace(CREDENTIAL, "$1=[redacted]")
      .replace(WINDOWS_PATH, "[path redacted]")
      .replace(POSIX_PATH, "[path redacted]")
      .slice(0, 300);
  return { name, message: message || "Unexpected failure" };
}
