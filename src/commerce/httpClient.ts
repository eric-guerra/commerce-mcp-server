import { CommerceError, type CommerceErrorCode } from "../lib/errors.js";
import type { CommerceClient } from "./client.js";
import type {
  Category,
  Customer,
  DateRange,
  InventoryAdjustment,
  InventoryLevel,
  NewOrder,
  Order,
  OrderQuery,
  OrderStatus,
  Page,
  Product,
  ProductQuery,
  SalesSummary,
} from "./types.js";

export interface HttpClientOptions {
  baseUrl: string;
  token?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

type Query = Record<string, string | number | boolean | undefined>;

/**
 * Adapter for a store backend exposing a conventional REST API
 * (see README "HTTP backend contract").
 */
export class HttpCommerceClient implements CommerceClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`;
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetch ?? fetch;
  }

  searchProducts(q: ProductQuery): Promise<Page<Product>> {
    return this.request("GET", "products", {
      query: {
        q: q.query,
        category: q.category,
        min_price: q.minPriceCents,
        max_price: q.maxPriceCents,
        in_stock: q.inStock,
        limit: q.limit,
        cursor: q.cursor,
      },
    });
  }

  getProduct(id: string): Promise<Product> {
    return this.request("GET", `products/${encodeURIComponent(id)}`);
  }

  listCategories(): Promise<Category[]> {
    return this.request("GET", "categories");
  }

  getInventory(sku: string): Promise<InventoryLevel> {
    return this.request("GET", `inventory/${encodeURIComponent(sku)}`);
  }

  adjustInventory({ sku, delta, reason }: InventoryAdjustment): Promise<InventoryLevel> {
    return this.request("POST", `inventory/${encodeURIComponent(sku)}/adjustments`, { body: { delta, reason } });
  }

  getCustomer(id: string): Promise<Customer> {
    return this.request("GET", `customers/${encodeURIComponent(id)}`);
  }

  listOrders(q: OrderQuery): Promise<Page<Order>> {
    return this.request("GET", "orders", {
      query: { customer_id: q.customerId, status: q.status, limit: q.limit, cursor: q.cursor },
    });
  }

  getOrder(id: string): Promise<Order> {
    return this.request("GET", `orders/${encodeURIComponent(id)}`);
  }

  createOrder(order: NewOrder): Promise<Order> {
    return this.request("POST", "orders", { body: order });
  }

  updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
    return this.request("PATCH", `orders/${encodeURIComponent(id)}`, { body: { status } });
  }

  salesSummary({ from, to }: DateRange): Promise<SalesSummary> {
    return this.request("GET", "reports/sales", { query: { from, to } });
  }

  private async request<T>(method: string, path: string, init: { query?: Query; body?: unknown } = {}): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = { accept: "application/json" };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (init.body !== undefined) headers["content-type"] = "application/json";

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new CommerceError("UPSTREAM_ERROR", `Request to commerce API failed: ${(err as Error).message}`, {
        method,
        path,
      });
    }

    if (!response.ok) throw await toCommerceError(response, method, path);
    return (await response.json()) as T;
  }
}

async function toCommerceError(response: Response, method: string, path: string): Promise<CommerceError> {
  let message = `${method} ${path} failed with HTTP ${response.status}`;
  let details: Record<string, unknown> = { status: response.status };
  try {
    const body = (await response.json()) as { message?: unknown; details?: unknown };
    if (typeof body.message === "string") message = body.message;
    if (body.details && typeof body.details === "object") details = { ...details, ...body.details };
  } catch {
    // Non-JSON error body; keep the generic message.
  }
  return new CommerceError(statusToCode(response.status), message, details);
}

function statusToCode(status: number): CommerceErrorCode {
  if (status === 404) return "NOT_FOUND";
  if (status === 400 || status === 422) return "INVALID_INPUT";
  if (status === 409) return "CONFLICT";
  return "UPSTREAM_ERROR";
}
