import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CommerceClient } from "../commerce/client.js";
import { ORDER_STATUSES } from "../commerce/types.js";
import { orderDetail, orderSummary } from "./present.js";
import { runTool } from "./result.js";

export function registerOrderTools(server: McpServer, client: CommerceClient, allowWrites: boolean): void {
  server.registerTool(
    "list_orders",
    {
      title: "List orders",
      description: "List orders newest first, optionally filtered by customer and status.",
      inputSchema: {
        customerId: z.string().optional(),
        status: z.enum(ORDER_STATUSES).optional(),
        limit: z.number().int().min(1).max(50).default(10),
        cursor: z.string().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      runTool(async () => {
        const page = await client.listOrders(args);
        return { ...page, items: page.items.map(orderSummary) };
      }),
  );

  server.registerTool(
    "get_order",
    {
      title: "Get order",
      description: "Get an order with line items, totals and current status.",
      inputSchema: { orderId: z.string().min(1).describe("Order id, e.g. ord_1004") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ orderId }) => runTool(async () => orderDetail(await client.getOrder(orderId))),
  );

  if (!allowWrites) return;

  server.registerTool(
    "create_order",
    {
      title: "Create order",
      description:
        "Create a pending order for a customer. Stock is checked for all lines first; " +
        "if any SKU is short, nothing is reserved and the shortages are returned.",
      inputSchema: {
        customerId: z.string().min(1),
        items: z
          .array(z.object({ sku: z.string().min(1), quantity: z.number().int().positive() }))
          .min(1)
          .max(50),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) => runTool(async () => orderDetail(await client.createOrder(args))),
  );

  server.registerTool(
    "update_order_status",
    {
      title: "Update order status",
      description:
        "Move an order through its lifecycle: pending -> paid | cancelled, paid -> fulfilled | refunded, " +
        "fulfilled -> refunded. Cancelling or refunding an unshipped order restocks its items.",
      inputSchema: {
        orderId: z.string().min(1),
        status: z.enum(ORDER_STATUSES),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ orderId, status }) => runTool(async () => orderDetail(await client.updateOrderStatus(orderId, status))),
  );
}
