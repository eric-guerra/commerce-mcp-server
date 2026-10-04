import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryCommerceClient } from "../src/commerce/memoryClient.js";
import { seedData } from "../src/commerce/seed.js";
import { createServer } from "../src/server.js";

const READ_TOOLS = ["check_inventory", "get_customer", "get_order", "get_product", "list_orders", "sales_summary", "search_products"];
const WRITE_TOOLS = ["adjust_inventory", "create_order", "update_order_status"];

let cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanup.map((fn) => fn()));
  cleanup = [];
});

async function connect(allowWrites: boolean) {
  const commerce = new MemoryCommerceClient(seedData, { now: () => new Date("2026-10-19T12:00:00.000Z") });
  const server = createServer({ client: commerce, allowWrites });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  cleanup.push(() => client.close(), () => server.close());
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const first = result.content[0];
  if (first?.type !== "text") throw new Error("expected text content");
  return { isError: result.isError ?? false, body: JSON.parse(first.text) };
}

describe("MCP server", () => {
  it("exposes only read tools by default", async () => {
    const client = await connect(false);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(READ_TOOLS);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  });

  it("adds write tools when enabled", async () => {
    const client = await connect(true);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort());
    const update = tools.find((t) => t.name === "update_order_status");
    expect(update?.annotations?.destructiveHint).toBe(true);
  });

  it("search_products converts dollar filters and returns summaries", async () => {
    const client = await connect(false);
    const { isError, body } = await call(client, "search_products", { query: "camping", maxPrice: 60 });
    expect(isError).toBe(false);
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(["category", "id", "inStock", "name", "price", "variantCount"]);
    }
    expect(body.items.map((i: { id: string }) => i.id)).not.toContain("prd_tent_2p");
  });

  it("get_product includes formatted variant prices", async () => {
    const client = await connect(false);
    const { body } = await call(client, "get_product", { productId: "prd_daypack" });
    expect(body.variants[0]).toMatchObject({ sku: "SUM24-GRN", price: "$89.00", inStock: true });
  });

  it("returns structured tool errors for domain failures", async () => {
    const client = await connect(false);
    const { isError, body } = await call(client, "get_order", { orderId: "ord_9999" });
    expect(isError).toBe(true);
    expect(body).toMatchObject({ error: "NOT_FOUND", details: { entity: "Order", id: "ord_9999" } });
  });

  it("rejects arguments that fail schema validation", async () => {
    const client = await connect(false);
    const result = (await client.callTool({ name: "search_products", arguments: { limit: 500 } })) as CallToolResult;
    expect(result.isError).toBe(true);
  });

  it("supports an end-to-end order flow when writes are enabled", async () => {
    const client = await connect(true);

    const created = await call(client, "create_order", {
      customerId: "cus_sofia",
      items: [{ sku: "BTL32-WHT", quantity: 3 }],
    });
    expect(created.isError).toBe(false);
    expect(created.body).toMatchObject({ status: "pending", subtotal: "$104.97" });

    const stock = await call(client, "check_inventory", { sku: "BTL32-WHT" });
    expect(stock.body).toMatchObject({ available: 57, reserved: 3 });

    const paid = await call(client, "update_order_status", { orderId: created.body.id, status: "paid" });
    expect(paid.body.status).toBe("paid");

    const badMove = await call(client, "update_order_status", { orderId: created.body.id, status: "pending" });
    expect(badMove.isError).toBe(true);
    expect(badMove.body.error).toBe("CONFLICT");

    const customer = await call(client, "get_customer", { customerId: "cus_sofia" });
    expect(customer.body.orderCount).toBe(2);
    expect(customer.body.recentOrders[0].id).toBe(created.body.id);
  });

  it("sales_summary reports formatted totals", async () => {
    const client = await connect(false);
    const { body } = await call(client, "sales_summary", { from: "2026-08-01T00:00:00Z" });
    expect(body.orderCount).toBe(4);
    expect(body.net).toMatch(/^\$[\d,]+\.\d{2}$/);
  });

  it("serves the categories resource", async () => {
    const client = await connect(false);
    const { contents } = await client.readResource({ uri: "catalog://categories" });
    const first = contents[0] as { text: string };
    expect(JSON.parse(first.text)).toContainEqual({ name: "Camping", productCount: 3 });
  });
});
