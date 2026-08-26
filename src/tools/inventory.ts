import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CommerceClient } from "../commerce/client.js";
import { runTool } from "./result.js";

export function registerInventoryTools(server: McpServer, client: CommerceClient, allowWrites: boolean): void {
  server.registerTool(
    "check_inventory",
    {
      title: "Check inventory",
      description: "Get available and reserved units for a SKU.",
      inputSchema: { sku: z.string().min(1).describe("Variant SKU, e.g. SUM24-GRN") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ sku }) => runTool(() => client.getInventory(sku)),
  );

  if (!allowWrites) return;

  server.registerTool(
    "adjust_inventory",
    {
      title: "Adjust inventory",
      description:
        "Add or remove stock for a SKU (positive delta = receive stock, negative = shrinkage/damage). " +
        "A reason is required and stock can never go below zero.",
      inputSchema: {
        sku: z.string().min(1),
        delta: z.number().int().refine((n) => n !== 0, "delta must not be zero"),
        reason: z.string().min(3).max(200).describe("Why the stock is changing, recorded for audit"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => runTool(() => client.adjustInventory(args)),
  );
}
