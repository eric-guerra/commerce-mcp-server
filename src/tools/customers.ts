import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CommerceClient } from "../commerce/client.js";
import { orderSummary } from "./present.js";
import { runTool } from "./result.js";

export function registerCustomerTools(server: McpServer, client: CommerceClient): void {
  server.registerTool(
    "get_customer",
    {
      title: "Get customer",
      description: "Get a customer profile with their five most recent orders.",
      inputSchema: { customerId: z.string().min(1).describe("Customer id, e.g. cus_ava") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ customerId }) =>
      runTool(async () => {
        const [customer, orders] = await Promise.all([
          client.getCustomer(customerId),
          client.listOrders({ customerId, limit: 5 }),
        ]);
        return { ...customer, orderCount: orders.total, recentOrders: orders.items.map(orderSummary) };
      }),
  );
}
