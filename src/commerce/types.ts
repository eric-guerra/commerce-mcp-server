export interface Variant {
  sku: string;
  title: string;
  priceCents: number;
  inventory: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  variants: Variant[];
  createdAt: string;
}

export interface Category {
  name: string;
  productCount: number;
}

export interface Customer {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export const ORDER_STATUSES = ["pending", "paid", "fulfilled", "cancelled", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderItem {
  sku: string;
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

export interface ProductQuery {
  query?: string;
  category?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  inStock?: boolean;
  limit?: number;
  cursor?: string;
}

export interface OrderQuery {
  customerId?: string;
  status?: OrderStatus;
  limit?: number;
  cursor?: string;
}

export interface NewOrderLine {
  sku: string;
  quantity: number;
}

export interface NewOrder {
  customerId: string;
  items: NewOrderLine[];
}

export interface InventoryLevel {
  sku: string;
  productId: string;
  available: number;
  /** Units held by pending (unpaid) orders. Already deducted from `available`. */
  reserved: number;
}

export interface InventoryAdjustment {
  sku: string;
  delta: number;
  reason: string;
}

export interface DateRange {
  from?: string;
  to?: string;
}

export interface ProductSales {
  productId: string;
  name: string;
  unitsSold: number;
  revenueCents: number;
}

export interface SalesSummary {
  from: string | null;
  to: string | null;
  orderCount: number;
  grossCents: number;
  refundedCents: number;
  netCents: number;
  currency: string;
  topProducts: ProductSales[];
}
