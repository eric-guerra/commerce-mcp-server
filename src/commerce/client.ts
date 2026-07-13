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

/**
 * Backend-agnostic commerce API. The MCP tools only depend on this interface,
 * so the same server can front an in-memory sandbox or a real store's REST API.
 */
export interface CommerceClient {
  searchProducts(query: ProductQuery): Promise<Page<Product>>;
  getProduct(id: string): Promise<Product>;
  listCategories(): Promise<Category[]>;

  getInventory(sku: string): Promise<InventoryLevel>;
  adjustInventory(adjustment: InventoryAdjustment): Promise<InventoryLevel>;

  getCustomer(id: string): Promise<Customer>;

  listOrders(query: OrderQuery): Promise<Page<Order>>;
  getOrder(id: string): Promise<Order>;
  createOrder(order: NewOrder): Promise<Order>;
  updateOrderStatus(id: string, status: OrderStatus): Promise<Order>;

  salesSummary(range: DateRange): Promise<SalesSummary>;
}
