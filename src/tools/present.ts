import type { Order, Product, SalesSummary } from "../commerce/types.js";
import { formatCents } from "../lib/money.js";

/**
 * Presentation helpers. Tool output keeps raw cent values for precision and adds
 * human-readable strings so the model does not have to do currency math itself.
 */

export function productSummary(product: Product) {
  const prices = product.variants.map((v) => v.priceCents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: min === max ? formatCents(min) : `${formatCents(min)} - ${formatCents(max)}`,
    inStock: product.variants.some((v) => v.inventory > 0),
    variantCount: product.variants.length,
  };
}

export function productDetail(product: Product) {
  return {
    ...product,
    variants: product.variants.map((v) => ({ ...v, price: formatCents(v.priceCents), inStock: v.inventory > 0 })),
  };
}

export function orderDetail(order: Order) {
  return {
    ...order,
    subtotal: formatCents(order.subtotalCents, order.currency),
    tax: formatCents(order.taxCents, order.currency),
    total: formatCents(order.totalCents, order.currency),
  };
}

export function orderSummary(order: Order) {
  return {
    id: order.id,
    customerId: order.customerId,
    status: order.status,
    itemCount: order.items.reduce((n, i) => n + i.quantity, 0),
    total: formatCents(order.totalCents, order.currency),
    createdAt: order.createdAt,
  };
}

export function salesReport(summary: SalesSummary) {
  return {
    ...summary,
    gross: formatCents(summary.grossCents, summary.currency),
    refunded: formatCents(summary.refundedCents, summary.currency),
    net: formatCents(summary.netCents, summary.currency),
    topProducts: summary.topProducts.map((p) => ({ ...p, revenue: formatCents(p.revenueCents, summary.currency) })),
  };
}
