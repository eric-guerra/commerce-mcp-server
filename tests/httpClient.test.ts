import { describe, expect, it, vi } from "vitest";
import { HttpCommerceClient } from "../src/commerce/httpClient.js";
import { CommerceError } from "../src/lib/errors.js";

function mockFetch(status: number, body: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function lastCall(fetchMock: ReturnType<typeof mockFetch>) {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: new URL(String(url)), init: init! };
}

describe("HttpCommerceClient", () => {
  it("joins paths onto a base URL that has its own path segment", async () => {
    const fetchMock = mockFetch(200, { id: "prd_1" });
    const client = new HttpCommerceClient({ baseUrl: "https://api.store.test/v1", fetch: fetchMock });
    await client.getProduct("prd/1");
    expect(lastCall(fetchMock).url.href).toBe("https://api.store.test/v1/products/prd%2F1");
  });

  it("maps query fields to snake_case params and omits undefined values", async () => {
    const fetchMock = mockFetch(200, { items: [], nextCursor: null, total: 0 });
    const client = new HttpCommerceClient({ baseUrl: "https://api.store.test/", fetch: fetchMock });
    await client.searchProducts({ query: "tent", maxPriceCents: 40000, inStock: true });
    const { url } = lastCall(fetchMock);
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "tent", max_price: "40000", in_stock: "true" });
  });

  it("sends a bearer token and JSON body on writes", async () => {
    const fetchMock = mockFetch(200, { id: "ord_1" });
    const client = new HttpCommerceClient({ baseUrl: "https://api.store.test", token: "secret", fetch: fetchMock });
    await client.updateOrderStatus("ord_1", "paid");
    const { init } = lastCall(fetchMock);
    expect(init.method).toBe("PATCH");
    expect(init.headers).toMatchObject({ authorization: "Bearer secret", "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ status: "paid" });
  });

  it.each([
    [404, "NOT_FOUND"],
    [400, "INVALID_INPUT"],
    [422, "INVALID_INPUT"],
    [409, "CONFLICT"],
    [503, "UPSTREAM_ERROR"],
  ] as const)("maps HTTP %i to %s", async (status, code) => {
    const client = new HttpCommerceClient({
      baseUrl: "https://api.store.test",
      fetch: mockFetch(status, { message: "upstream said no", details: { field: "x" } }),
    });
    const err = await client.getOrder("ord_1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CommerceError);
    expect(err).toMatchObject({ code, message: "upstream said no", details: { status, field: "x" } });
  });

  it("falls back to a generic message for non-JSON error bodies", async () => {
    const client = new HttpCommerceClient({ baseUrl: "https://api.store.test", fetch: mockFetch(500, "<html>oops</html>") });
    await expect(client.listCategories()).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      message: "GET categories failed with HTTP 500",
    });
  });

  it("wraps network failures as UPSTREAM_ERROR", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = new HttpCommerceClient({ baseUrl: "https://api.store.test", fetch: fetchMock });
    await expect(client.getCustomer("cus_1")).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });
});
