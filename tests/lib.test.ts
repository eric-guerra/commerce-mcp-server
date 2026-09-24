import { describe, expect, it } from "vitest";
import { canTransition, restocksOnTransition } from "../src/commerce/orderStatus.js";
import { ORDER_STATUSES } from "../src/commerce/types.js";
import { loadConfig } from "../src/config.js";
import { applyRate, dollarsToCents, formatCents } from "../src/lib/money.js";
import { decodeCursor, encodeCursor, paginate } from "../src/lib/pagination.js";

describe("money", () => {
  it("formats cents as currency", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(0)).toBe("$0.00");
  });

  it("converts dollars to cents without float drift", () => {
    expect(dollarsToCents(19.99)).toBe(1999);
    expect(dollarsToCents(0.1 + 0.2)).toBe(30);
    expect(dollarsToCents(undefined)).toBeUndefined();
  });

  it("rounds rate application to whole cents", () => {
    expect(applyRate(1999, 0.0825)).toBe(165);
  });
});

describe("pagination", () => {
  it("round-trips cursors", () => {
    expect(decodeCursor(encodeCursor(42))).toBe(42);
  });

  it("slices pages and stops at the end", () => {
    const items = Array.from({ length: 5 }, (_, i) => i);
    const page = paginate(items, 2, encodeCursor(4));
    expect(page).toEqual({ items: [4], nextCursor: null, total: 5 });
  });
});

describe("order status machine", () => {
  it("has terminal states", () => {
    for (const to of ORDER_STATUSES) {
      expect(canTransition("cancelled", to)).toBe(false);
      expect(canTransition("refunded", to)).toBe(false);
    }
  });

  it("only restocks unshipped goods", () => {
    expect(restocksOnTransition("pending", "cancelled")).toBe(true);
    expect(restocksOnTransition("paid", "refunded")).toBe(true);
    expect(restocksOnTransition("fulfilled", "refunded")).toBe(false);
    expect(restocksOnTransition("pending", "paid")).toBe(false);
  });
});

describe("loadConfig", () => {
  it("defaults to a read-only memory backend", () => {
    expect(loadConfig({})).toEqual({ backend: "memory", allowWrites: false, taxRate: 0.0825 });
  });

  it("only enables writes for the exact string 'true'", () => {
    expect(loadConfig({ COMMERCE_ALLOW_WRITES: "true" }).allowWrites).toBe(true);
    expect(loadConfig({ COMMERCE_ALLOW_WRITES: "1" }).allowWrites).toBe(false);
  });

  it("requires a valid URL for the http backend", () => {
    expect(() => loadConfig({ COMMERCE_BACKEND: "http" })).toThrow(/COMMERCE_API_URL is required/);
    expect(() => loadConfig({ COMMERCE_BACKEND: "http", COMMERCE_API_URL: "nope" })).toThrow(/not a valid URL/);
    expect(loadConfig({ COMMERCE_BACKEND: "http", COMMERCE_API_URL: "https://api.store.test" })).toMatchObject({
      backend: "http",
      timeoutMs: 10000,
    });
  });

  it("rejects unknown backends and bad tax rates", () => {
    expect(() => loadConfig({ COMMERCE_BACKEND: "graphql" })).toThrow(/Unknown COMMERCE_BACKEND/);
    expect(() => loadConfig({ COMMERCE_TAX_RATE: "8.25" })).toThrow(/between 0 and 1/);
  });
});
