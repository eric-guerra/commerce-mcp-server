export type CommerceErrorCode = "NOT_FOUND" | "INVALID_INPUT" | "CONFLICT" | "UPSTREAM_ERROR";

/**
 * Domain error surfaced to MCP clients as a structured tool error rather than
 * a protocol-level failure, so agents can read the code and recover.
 */
export class CommerceError extends Error {
  constructor(
    public readonly code: CommerceErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CommerceError";
  }
}

export function notFound(entity: string, id: string): CommerceError {
  return new CommerceError("NOT_FOUND", `${entity} ${id} not found`, { entity, id });
}

export function invalid(message: string, details?: Record<string, unknown>): CommerceError {
  return new CommerceError("INVALID_INPUT", message, details);
}

export function conflict(message: string, details?: Record<string, unknown>): CommerceError {
  return new CommerceError("CONFLICT", message, details);
}
