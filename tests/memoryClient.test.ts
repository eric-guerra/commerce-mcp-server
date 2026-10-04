import { beforeEach, describe, expect, it } from "vitest";
import { MemoryCommerceClient } from "../src/commerce/memoryClient.js";
import { seedData } from "../src/commerce/seed.js";
import { CommerceError } from "../src/lib/errors.js";

const NOW = new Date("2026-10-19T12:00:00.000Z");

async function expectCommerceError(promise: Promise<unknown>, code: CommerceError["code"]) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(CommerceError);
  expect((err as CommerceError).code).toBe(code);
  return err as CommerceError;
}

describe("MemoryCommerceClient", () => {
  let client: MemoryCommerceClient;

  beforeEach(() => {
    client = new MemoryCommerceClient(seedData, { taxRate: 0.1, now: () => NOW });
  });

  describe("searchProducts", () => {
    it("ranks name and tag matches above description-only matches", async () => {
      const page = await client.searchProducts({ query: "trail" });
      expect(page.items.length).toBeGreaterThan(0);
      expect(page.items[0]?.id).toBe("prd_trail_runner");
    });

    it("filters by category case-insensitively", async () => {
      const page = await client.searchProducts({ category: "camping" });
      expect(page.items.map((p) => p.category)).toEqual(["Camping", "Camping", "Camping"]);
    });

    it("filters by price range in cents", async () => {
      const page = await client.searchProducts({ minPriceCents: 10000, maxPriceCents: 20000 });
      for (const product of page.items) {
        expect(product.variants.some((v) => v.priceCents >= 10000 && v.priceCents <= 20000)).toBe(true);
      }
      expect(page.items.map((p) => p.id)).not.toContain("prd_tent_2p");
    });

    it("excludes fully sold-out products when inStock is set", async () => {
      const all = await client.searchProducts({ query: "trekking poles" });
      const inStock = await client.searchProducts({ query: "trekking poles", inStock: true });
      expect(all.items.map((p) => p.id)).toContain("prd_trek_poles");
      expect(inStock.items.map((p) => p.id)).not.toContain("prd_trek_poles");
    });

    it("paginates with an opaque cursor", async () => {
      const first = await client.searchProducts({ limit: 4 });
      expect(first.items).toHaveLength(4);
      expect(first.total).toBe(10);
      expect(first.nextCursor).not.toBeNull();

      const second = await client.searchProducts({ limit: 4, cursor: first.nextCursor! });
      expect(second.items).toHaveLength(4);
      expect(second.items[0]?.id).not.toBe(first.items[0]?.id);

      const third = await client.searchProducts({ limit: 4, cursor: second.nextCursor! });
      expect(third.items).toHaveLength(2);
      expect(third.nextCursor).toBeNull();
    });

    it("rejects malformed cursors", async () => {
      await expectCommerceError(client.searchProducts({ cursor: "not-a-cursor" }), "INVALID_INPUT");
    });

    it("returns copies that cannot mutate the store", async () => {
      const product = await client.getProduct("prd_headlamp");
      product.variants[0]!.inventory = 0;
      expect((await client.getInventory("LUM400")).available).toBe(33);
    });
  });

  describe("createOrder", () => {
    it("creates a pending order, computes tax and decrements stock", async () => {
      const order = await client.createOrder({
        customerId: "cus_sofia",
        items: [
          { sku: "LUM400", quantity: 2 },
          { sku: "PKT-STV", quantity: 1 },
        ],
      });

      expect(order).toMatchObject({
        id: "ord_1006",
        status: "pending",
        subtotalCents: 2 * 4999 + 5499,
        taxCents: Math.round((2 * 4999 + 5499) * 0.1),
        createdAt: NOW.toISOString(),
      });
      expect(order.totalCents).toBe(order.subtotalCents + order.taxCents);
      expect((await client.getInventory("LUM400")).available).toBe(31);
      expect((await client.getInventory("LUM400")).reserved).toBe(2);
    });

    it("merges duplicate SKUs before checking stock", async () => {
      const order = await client.createOrder({
        customerId: "cus_ava",
        items: [
          { sku: "RDG-2P", quantity: 2 },
          { sku: "RDG-2P", quantity: 1 },
        ],
      });
      expect(order.items).toHaveLength(1);
      expect(order.items[0]?.quantity).toBe(3);
    });

    it("rejects the whole order when any line is short, leaving stock untouched", async () => {
      const err = await expectCommerceError(
        client.createOrder({
          customerId: "cus_ava",
          items: [
            { sku: "LUM400", quantity: 1 },
            { sku: "STRM-L", quantity: 5 },
          ],
        }),
        "CONFLICT",
      );
      expect(err.details).toEqual({ shortages: [{ sku: "STRM-L", requested: 5, available: 3 }] });
      expect((await client.getInventory("LUM400")).available).toBe(33);
    });

    it("rejects unknown customers and SKUs", async () => {
      await expectCommerceError(
        client.createOrder({ customerId: "cus_nobody", items: [{ sku: "LUM400", quantity: 1 }] }),
        "NOT_FOUND",
      );
      await expectCommerceError(
        client.createOrder({ customerId: "cus_ava", items: [{ sku: "NOPE", quantity: 1 }] }),
        "NOT_FOUND",
      );
    });

    it("rejects empty orders and non-positive quantities", async () => {
      await expectCommerceError(client.createOrder({ customerId: "cus_ava", items: [] }), "INVALID_INPUT");
      await expectCommerceError(
        client.createOrder({ customerId: "cus_ava", items: [{ sku: "LUM400", quantity: 0 }] }),
        "INVALID_INPUT",
      );
    });
  });

  describe("updateOrderStatus", () => {
    it("follows the order lifecycle", async () => {
      const paid = await client.updateOrderStatus("ord_1005", "paid");
      expect(paid.status).toBe("paid");
      expect(paid.updatedAt).toBe(NOW.toISOString());
      const fulfilled = await client.updateOrderStatus("ord_1005", "fulfilled");
      expect(fulfilled.status).toBe("fulfilled");
    });

    it("rejects invalid transitions with the allowed next states", async () => {
      const err = await expectCommerceError(client.updateOrderStatus("ord_1001", "pending"), "CONFLICT");
      expect(err.details).toMatchObject({ current: "fulfilled", allowed: ["refunded"] });
    });

    it("restocks when a pending order is cancelled", async () => {
      const before = (await client.getInventory("ALP20-REG")).available;
      await client.updateOrderStatus("ord_1005", "cancelled");
      expect((await client.getInventory("ALP20-REG")).available).toBe(before + 1);
    });

    it("restocks when a paid order is refunded but not when a fulfilled one is", async () => {
      const bagsBefore = (await client.getInventory("SUM24-GRN")).available;
      await client.updateOrderStatus("ord_1004", "refunded");
      expect((await client.getInventory("SUM24-GRN")).available).toBe(bagsBefore + 1);

      const tentsBefore = (await client.getInventory("RDG-2P")).available;
      await client.updateOrderStatus("ord_1002", "refunded");
      expect((await client.getInventory("RDG-2P")).available).toBe(tentsBefore);
    });
  });

  describe("adjustInventory", () => {
    it("applies positive and negative deltas", async () => {
      expect((await client.adjustInventory({ sku: "CTP-PAIR", delta: 12, reason: "PO 5521 received" })).available).toBe(12);
      expect((await client.adjustInventory({ sku: "CTP-PAIR", delta: -2, reason: "Damaged in transit" })).available).toBe(10);
    });

    it("never allows negative stock", async () => {
      await expectCommerceError(client.adjustInventory({ sku: "STRM-L", delta: -4, reason: "Cycle count" }), "CONFLICT");
    });

    it("requires a non-zero integer delta and a reason", async () => {
      await expectCommerceError(client.adjustInventory({ sku: "STRM-L", delta: 0, reason: "x" }), "INVALID_INPUT");
      await expectCommerceError(client.adjustInventory({ sku: "STRM-L", delta: 1.5, reason: "x" }), "INVALID_INPUT");
      await expectCommerceError(client.adjustInventory({ sku: "STRM-L", delta: 1, reason: "  " }), "INVALID_INPUT");
    });
  });

  describe("listOrders", () => {
    it("returns newest first and filters by customer and status", async () => {
      const all = await client.listOrders({});
      expect(all.items.map((o) => o.id)).toEqual(["ord_1005", "ord_1004", "ord_1003", "ord_1002", "ord_1001"]);

      const ava = await client.listOrders({ customerId: "cus_ava" });
      expect(ava.items.map((o) => o.id)).toEqual(["ord_1004", "ord_1001"]);

      const fulfilled = await client.listOrders({ status: "fulfilled" });
      expect(fulfilled.total).toBe(2);
    });
  });

  describe("salesSummary", () => {
    it("excludes pending orders and nets out refunds", async () => {
      const summary = await client.salesSummary({});
      expect(summary.orderCount).toBe(4);
      expect(summary.netCents).toBe(summary.grossCents - summary.refundedCents);

      const refunded = await client.getOrder("ord_1003");
      expect(summary.refundedCents).toBe(refunded.totalCents);
      expect(summary.topProducts[0]?.productId).toBe("prd_tent_2p");
      expect(summary.topProducts.map((p) => p.productId)).not.toContain("prd_rain_shell");
    });

    it("respects the date range", async () => {
      const summary = await client.salesSummary({ from: "2026-09-01T00:00:00Z", to: "2026-09-30T23:59:59Z" });
      expect(summary.orderCount).toBe(2);
    });

    it("validates dates", async () => {
      await expectCommerceError(client.salesSummary({ from: "yesterday" }), "INVALID_INPUT");
      await expectCommerceError(
        client.salesSummary({ from: "2026-10-01T00:00:00Z", to: "2026-09-01T00:00:00Z" }),
        "INVALID_INPUT",
      );
    });
  });

  it("lists categories with product counts", async () => {
    expect(await client.listCategories()).toEqual([
      { name: "Accessories", productCount: 3 },
      { name: "Apparel", productCount: 2 },
      { name: "Bags", productCount: 1 },
      { name: "Camping", productCount: 3 },
      { name: "Footwear", productCount: 1 },
    ]);
  });
});
