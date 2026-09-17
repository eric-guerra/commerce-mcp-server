import { applyRate } from "../lib/money.js";
import type { Customer, Order, OrderStatus, Product } from "./types.js";

export interface SeedData {
  products: Product[];
  customers: Customer[];
  orders: Order[];
}

export const SEED_TAX_RATE = 0.0825;

const products: Product[] = [
  {
    id: "prd_trail_runner",
    name: "Trail Runner 3 Shoe",
    description: "Lightweight trail running shoe with a grippy lugged outsole and rock plate.",
    category: "Footwear",
    tags: ["running", "trail", "shoes", "outdoor"],
    variants: [
      { sku: "TR3-BLK-9", title: "Black / 9", priceCents: 12999, inventory: 14 },
      { sku: "TR3-BLK-10", title: "Black / 10", priceCents: 12999, inventory: 8 },
      { sku: "TR3-ORG-10", title: "Orange / 10", priceCents: 12999, inventory: 0 },
    ],
    createdAt: "2026-01-12T15:00:00.000Z",
  },
  {
    id: "prd_daypack",
    name: "Summit 24L Daypack",
    description: "Water-resistant hiking daypack with hydration sleeve and hip belt.",
    category: "Bags",
    tags: ["hiking", "backpack", "outdoor", "travel"],
    variants: [
      { sku: "SUM24-GRN", title: "Forest Green", priceCents: 8900, inventory: 22 },
      { sku: "SUM24-GRY", title: "Slate Gray", priceCents: 8900, inventory: 5 },
    ],
    createdAt: "2026-02-03T15:00:00.000Z",
  },
  {
    id: "prd_insulated_bottle",
    name: "Insulated Bottle 32oz",
    description: "Double-wall stainless steel bottle that keeps drinks cold for 24 hours.",
    category: "Accessories",
    tags: ["hydration", "bottle", "camping"],
    variants: [
      { sku: "BTL32-WHT", title: "White", priceCents: 3499, inventory: 60 },
      { sku: "BTL32-NVY", title: "Navy", priceCents: 3499, inventory: 41 },
    ],
    createdAt: "2026-02-20T15:00:00.000Z",
  },
  {
    id: "prd_rain_shell",
    name: "Stormline Rain Shell",
    description: "Packable 2.5-layer waterproof jacket with pit zips and adjustable hood.",
    category: "Apparel",
    tags: ["jacket", "rain", "waterproof", "hiking"],
    variants: [
      { sku: "STRM-M", title: "Medium", priceCents: 15900, inventory: 7 },
      { sku: "STRM-L", title: "Large", priceCents: 15900, inventory: 3 },
    ],
    createdAt: "2026-03-08T15:00:00.000Z",
  },
  {
    id: "prd_merino_tee",
    name: "Merino Base Tee",
    description: "Odor-resistant merino wool t-shirt for running, hiking and travel.",
    category: "Apparel",
    tags: ["merino", "shirt", "running", "travel"],
    variants: [
      { sku: "MER-TEE-S", title: "Small", priceCents: 6500, inventory: 18 },
      { sku: "MER-TEE-M", title: "Medium", priceCents: 6500, inventory: 25 },
      { sku: "MER-TEE-L", title: "Large", priceCents: 6500, inventory: 12 },
    ],
    createdAt: "2026-03-15T15:00:00.000Z",
  },
  {
    id: "prd_headlamp",
    name: "Lumen 400 Headlamp",
    description: "Rechargeable 400-lumen headlamp with red night mode.",
    category: "Accessories",
    tags: ["lighting", "camping", "running"],
    variants: [{ sku: "LUM400", title: "Standard", priceCents: 4999, inventory: 33 }],
    createdAt: "2026-04-01T15:00:00.000Z",
  },
  {
    id: "prd_tent_2p",
    name: "Ridgeline 2P Tent",
    description: "Freestanding two-person backpacking tent, 3 lb 2 oz trail weight.",
    category: "Camping",
    tags: ["tent", "backpacking", "camping", "outdoor"],
    variants: [{ sku: "RDG-2P", title: "2 Person", priceCents: 34900, inventory: 4 }],
    createdAt: "2026-04-18T15:00:00.000Z",
  },
  {
    id: "prd_sleeping_bag",
    name: "Alpine 20F Sleeping Bag",
    description: "Down sleeping bag rated to 20 degrees F with a water-resistant shell.",
    category: "Camping",
    tags: ["sleeping bag", "down", "camping", "backpacking"],
    variants: [
      { sku: "ALP20-REG", title: "Regular", priceCents: 27900, inventory: 6 },
      { sku: "ALP20-LNG", title: "Long", priceCents: 29900, inventory: 2 },
    ],
    createdAt: "2026-05-02T15:00:00.000Z",
  },
  {
    id: "prd_trek_poles",
    name: "Carbon Trekking Poles",
    description: "Collapsible carbon fiber trekking poles with cork grips (pair).",
    category: "Accessories",
    tags: ["hiking", "poles", "trekking"],
    variants: [{ sku: "CTP-PAIR", title: "Pair", priceCents: 11900, inventory: 0 }],
    createdAt: "2026-06-10T15:00:00.000Z",
  },
  {
    id: "prd_camp_stove",
    name: "Pocket Camp Stove",
    description: "Ultralight canister stove that boils a liter of water in 3.5 minutes.",
    category: "Camping",
    tags: ["stove", "cooking", "camping", "backpacking"],
    variants: [{ sku: "PKT-STV", title: "Standard", priceCents: 5499, inventory: 19 }],
    createdAt: "2026-07-07T15:00:00.000Z",
  },
];

const customers: Customer[] = [
  { id: "cus_ava", email: "ava.chen@example.com", name: "Ava Chen", createdAt: "2026-02-11T10:00:00.000Z" },
  { id: "cus_marcus", email: "marcus.reed@example.com", name: "Marcus Reed", createdAt: "2026-03-22T10:00:00.000Z" },
  { id: "cus_sofia", email: "sofia.ramirez@example.com", name: "Sofia Ramirez", createdAt: "2026-05-30T10:00:00.000Z" },
];

function seedOrder(
  id: string,
  customerId: string,
  status: OrderStatus,
  createdAt: string,
  lines: Array<[sku: string, quantity: number]>,
): Order {
  const items = lines.map(([sku, quantity]) => {
    const product = products.find((p) => p.variants.some((v) => v.sku === sku));
    const variant = product?.variants.find((v) => v.sku === sku);
    if (!product || !variant) throw new Error(`Seed references unknown SKU ${sku}`);
    return {
      sku,
      productId: product.id,
      name: `${product.name} (${variant.title})`,
      quantity,
      unitPriceCents: variant.priceCents,
    };
  });
  const subtotalCents = items.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);
  const taxCents = applyRate(subtotalCents, SEED_TAX_RATE);
  return {
    id,
    customerId,
    status,
    items,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    currency: "USD",
    createdAt,
    updatedAt: createdAt,
  };
}

const orders: Order[] = [
  seedOrder("ord_1001", "cus_ava", "fulfilled", "2026-08-04T18:22:00.000Z", [["TR3-BLK-9", 1], ["MER-TEE-S", 2]]),
  seedOrder("ord_1002", "cus_marcus", "fulfilled", "2026-08-19T13:05:00.000Z", [["RDG-2P", 1], ["PKT-STV", 1]]),
  seedOrder("ord_1003", "cus_sofia", "refunded", "2026-09-02T09:41:00.000Z", [["STRM-M", 1]]),
  seedOrder("ord_1004", "cus_ava", "paid", "2026-09-27T20:10:00.000Z", [["SUM24-GRN", 1], ["BTL32-NVY", 2]]),
  seedOrder("ord_1005", "cus_marcus", "pending", "2026-10-14T16:30:00.000Z", [["ALP20-REG", 1]]),
];

export const seedData: SeedData = { products, customers, orders };
