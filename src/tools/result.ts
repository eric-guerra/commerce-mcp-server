import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CommerceError } from "../lib/errors.js";

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/**
 * Runs a tool body and converts domain errors into `isError` results so the
 * model sees an actionable message (code + details) instead of a crashed call.
 */
export async function runTool(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return jsonResult(await fn());
  } catch (err) {
    if (err instanceof CommerceError) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: err.code, message: err.message, details: err.details }, null, 2),
          },
        ],
      };
    }
    throw err;
  }
}
