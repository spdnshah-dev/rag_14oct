import "server-only";

export function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

// A short error description that is safe to log or show: keys and tokens are masked.
export function describeError(error: unknown, maxLength = 300): string {
  const status = errorStatus(error);
  const message = error instanceof Error ? error.message : String(error);
  const masked = message
    .replace(/gsk_[0-9A-Za-z]+/g, "[key]")
    .replace(/(Bearer\s+)[^\s"]+/gi, "$1[token]");
  const prefix = status && !masked.startsWith(String(status)) ? `status=${status} ` : "";
  return `${prefix}${masked}`.slice(0, maxLength);
}

// Logs an error without request content or secrets.
export function logError(context: string, error: unknown) {
  console.error(`[${context}] ${describeError(error, 500)}`);
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs one named step, so an error says which step failed.
export async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new StepError(label, error);
  }
}

export class StepError extends Error {
  status: number | undefined;
  constructor(label: string, cause: unknown) {
    super(`${label}: ${describeError(cause)}`);
    this.status = errorStatus(cause);
  }
}
