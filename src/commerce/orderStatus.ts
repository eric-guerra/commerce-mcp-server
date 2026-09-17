import type { OrderStatus } from "./types.js";

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["fulfilled", "refunded"],
  fulfilled: ["refunded"],
  cancelled: [],
  refunded: [],
};

export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Stock goes back on the shelf only if the goods never left the warehouse. */
export function restocksOnTransition(from: OrderStatus, to: OrderStatus): boolean {
  return to === "cancelled" || (to === "refunded" && from === "paid");
}

/** Orders that represent captured revenue for reporting. */
export function isRevenueStatus(status: OrderStatus): boolean {
  return status === "paid" || status === "fulfilled" || status === "refunded";
}
