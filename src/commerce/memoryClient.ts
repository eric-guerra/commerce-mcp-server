import { conflict, invalid, notFound } from "../lib/errors.js";
import { applyRate } from "../lib/money.js";
import { DEFAULT_PAGE_SIZE, paginate } from "../lib/pagination.js";
import type { CommerceClient } from "./client.js";
import { allowedTransitions, canTransition, isRevenueStatus, restocksOnTransition } from "./orderStatus.js";
import type { SeedData } from "./seed.js";
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
  ProductSales,
  SalesSummary,
  Variant,
} from "./types.js";

export interface MemoryClientOptions {
  taxRate?: number;
  currency?: string;
  now?: () => Date;
}

interface SkuEntry {
  product: Product;
  variant: Variant;
}

/**
 * In-memory sandbox store. Useful for local agent development, demos and tests;
 * mirrors the behaviour expected of a real backend (stock checks, order state machine).
 */
export class MemoryCommerceClient implements CommerceClient {
  private readonly products = new Map<string, Product>();
  private readonly skus = new Map<string, SkuEntry>();
  private readonly customers = new Map<string, Customer>();
  private readonly orders = new Map<string, Order>();
  private orderSeq = 1000;

  private readonly taxRate: number;
  private readonly currency: string;
  private readonly now: () => Date;

  constructor(seed: SeedData, options: MemoryClientOptions = {}) {
    this.taxRate = options.taxRate ?? 0.0825;
    this.currency = options.currency ?? "USD";
    this.now = options.now ?? (() => new Date());

    for (const source of seed.products) {
      const product = structuredClone(source);
      this.products.set(product.id, product);
      for (const variant of product.variants) this.skus.set(variant.sku, { product, variant });
    }
    for (const customer of seed.customers) this.customers.set(customer.id, structuredClone(customer));
    for (const order of seed.orders) {
      this.orders.set(order.id, structuredClone(order));
      const seq = Number(order.id.replace(/^ord_/, ""));
      if (Number.isFinite(seq)) this.orderSeq = Math.max(this.orderSeq, seq);
    }
  }

  async searchProducts(query: ProductQuery): Promise<Page<Product>> {
    const terms = tokenize(query.query ?? "");
    const category = query.category?.toLowerCase();

    const matches = [...this.products.values()]
      .map((product) => ({ product, score: terms.length ? scoreProduct(product, terms) : 1 }))
      .filter(({ score }) => score > 0)
      .filter(({ product }) => !category || product.category.toLowerCase() === category)
      .filter(({ product }) => product.variants.some((v) => priceInRange(v, query)))
      .filter(({ product }) => !query.inStock || product.variants.some((v) => v.inventory > 0))
      .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
      .map(({ product }) => structuredClone(product));

    return paginate(matches, query.limit ?? DEFAULT_PAGE_SIZE, query.cursor);
  }

  async getProduct(id: string): Promise<Product> {
    const product = this.products.get(id);
    if (!product) throw notFound("Product", id);
    return structuredClone(product);
  }

  async listCategories(): Promise<Category[]> {
    const counts = new Map<string, number>();
    for (const p of this.products.values()) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, productCount]) => ({ name, productCount }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getInventory(sku: string): Promise<InventoryLevel> {
    return this.inventoryLevel(this.requireSku(sku));
  }

  async adjustInventory({ sku, delta, reason }: InventoryAdjustment): Promise<InventoryLevel> {
    if (!Number.isInteger(delta) || delta === 0) throw invalid("delta must be a non-zero integer", { delta });
    if (!reason.trim()) throw invalid("reason is required for inventory adjustments");
    const entry = this.requireSku(sku);
    const next = entry.variant.inventory + delta;
    if (next < 0) {
      throw conflict(`Adjustment would make ${sku} inventory negative`, {
        available: entry.variant.inventory,
        delta,
      });
    }
    entry.variant.inventory = next;
    return this.inventoryLevel(entry);
  }

  async getCustomer(id: string): Promise<Customer> {
    const customer = this.customers.get(id);
    if (!customer) throw notFound("Customer", id);
    return structuredClone(customer);
  }

  async listOrders(query: OrderQuery): Promise<Page<Order>> {
    const orders = [...this.orders.values()]
      .filter((o) => !query.customerId || o.customerId === query.customerId)
      .filter((o) => !query.status || o.status === query.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => structuredClone(o));
    return paginate(orders, query.limit ?? DEFAULT_PAGE_SIZE, query.cursor);
  }

  async getOrder(id: string): Promise<Order> {
    const order = this.orders.get(id);
    if (!order) throw notFound("Order", id);
    return structuredClone(order);
  }

  async createOrder({ customerId, items }: NewOrder): Promise<Order> {
    if (!this.customers.has(customerId)) throw notFound("Customer", customerId);
    if (items.length === 0) throw invalid("Order must contain at least one item");

    // Merge duplicate SKUs so stock is checked against the combined quantity.
    const quantities = new Map<string, number>();
    for (const { sku, quantity } of items) {
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw invalid("quantity must be a positive integer", { sku, quantity });
      }
      quantities.set(sku, (quantities.get(sku) ?? 0) + quantity);
    }

    // Validate every line before mutating anything so a failed order leaves stock untouched.
    const lines = [...quantities].map(([sku, quantity]) => ({ entry: this.requireSku(sku), quantity }));
    const shortages = lines
      .filter(({ entry, quantity }) => entry.variant.inventory < quantity)
      .map(({ entry, quantity }) => ({
        sku: entry.variant.sku,
        requested: quantity,
        available: entry.variant.inventory,
      }));
    if (shortages.length) throw conflict("Insufficient inventory", { shortages });

    for (const { entry, quantity } of lines) entry.variant.inventory -= quantity;

    const orderItems = lines.map(({ entry, quantity }) => ({
      sku: entry.variant.sku,
      productId: entry.product.id,
      name: `${entry.product.name} (${entry.variant.title})`,
      quantity,
      unitPriceCents: entry.variant.priceCents,
    }));
    const subtotalCents = orderItems.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);
    const taxCents = applyRate(subtotalCents, this.taxRate);
    const timestamp = this.now().toISOString();

    const order: Order = {
      id: `ord_${++this.orderSeq}`,
      customerId,
      status: "pending",
      items: orderItems,
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
      currency: this.currency,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.orders.set(order.id, order);
    return structuredClone(order);
  }

  async updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
    const order = this.orders.get(id);
    if (!order) throw notFound("Order", id);
    if (!canTransition(order.status, status)) {
      throw conflict(`Cannot move order ${id} from ${order.status} to ${status}`, {
        current: order.status,
        allowed: allowedTransitions(order.status),
      });
    }
    if (restocksOnTransition(order.status, status)) {
      for (const item of order.items) {
        const entry = this.skus.get(item.sku);
        if (entry) entry.variant.inventory += item.quantity;
      }
    }
    order.status = status;
    order.updatedAt = this.now().toISOString();
    return structuredClone(order);
  }

  async salesSummary({ from, to }: DateRange): Promise<SalesSummary> {
    const fromTime = parseDate(from, "from");
    const toTime = parseDate(to, "to");
    if (fromTime !== undefined && toTime !== undefined && fromTime > toTime) {
      throw invalid("from must be before to", { from, to });
    }

    const inRange = [...this.orders.values()].filter((o) => {
      const t = Date.parse(o.createdAt);
      return (
        isRevenueStatus(o.status) &&
        (fromTime === undefined || t >= fromTime) &&
        (toTime === undefined || t <= toTime)
      );
    });

    const grossCents = inRange.reduce((sum, o) => sum + o.totalCents, 0);
    const refundedCents = inRange
      .filter((o) => o.status === "refunded")
      .reduce((sum, o) => sum + o.totalCents, 0);

    const byProduct = new Map<string, ProductSales>();
    for (const order of inRange) {
      if (order.status === "refunded") continue;
      for (const item of order.items) {
        const row = byProduct.get(item.productId) ?? {
          productId: item.productId,
          name: this.products.get(item.productId)?.name ?? item.name,
          unitsSold: 0,
          revenueCents: 0,
        };
        row.unitsSold += item.quantity;
        row.revenueCents += item.quantity * item.unitPriceCents;
        byProduct.set(item.productId, row);
      }
    }

    return {
      from: from ?? null,
      to: to ?? null,
      orderCount: inRange.length,
      grossCents,
      refundedCents,
      netCents: grossCents - refundedCents,
      currency: this.currency,
      topProducts: [...byProduct.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 5),
    };
  }

  private requireSku(sku: string): SkuEntry {
    const entry = this.skus.get(sku);
    if (!entry) throw notFound("SKU", sku);
    return entry;
  }

  private inventoryLevel({ product, variant }: SkuEntry): InventoryLevel {
    let reserved = 0;
    for (const order of this.orders.values()) {
      if (order.status !== "pending") continue;
      for (const item of order.items) if (item.sku === variant.sku) reserved += item.quantity;
    }
    return { sku: variant.sku, productId: product.id, available: variant.inventory, reserved };
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/** Simple weighted keyword relevance: name > tags/category > description. */
function scoreProduct(product: Product, terms: string[]): number {
  const fields = {
    name: tokenize(product.name),
    tags: product.tags.flatMap(tokenize),
    category: tokenize(product.category),
    description: tokenize(product.description),
  };
  const hit = (words: string[], term: string) => words.some((w) => w.startsWith(term));
  let score = 0;
  for (const term of terms) {
    if (hit(fields.name, term)) score += 3;
    if (hit(fields.tags, term)) score += 2;
    if (hit(fields.category, term)) score += 2;
    if (hit(fields.description, term)) score += 1;
  }
  return score;
}

function priceInRange(variant: Variant, { minPriceCents, maxPriceCents }: ProductQuery): boolean {
  return (
    (minPriceCents === undefined || variant.priceCents >= minPriceCents) &&
    (maxPriceCents === undefined || variant.priceCents <= maxPriceCents)
  );
}

function parseDate(value: string | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw invalid(`${field} is not a valid ISO date`, { [field]: value });
  return time;
}
