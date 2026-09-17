import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CommerceClient } from "../commerce/client.js";
import { dollarsToCents } from "../lib/money.js";
import { productDetail, productSummary } from "./present.js";
import { runTool } from "./result.js";

export function registerProductTools(server: McpServer, client: CommerceClient): void {
  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description:
        "Search the catalog by keyword with optional category, price and stock filters. " +
        "Returns compact summaries; call get_product for variants, SKUs and stock levels.",
      inputSchema: {
        query: z.string().max(200).optional().describe("Keywords, e.g. 'waterproof hiking jacket'"),
        category: z.string().optional().describe("Exact category name (see the catalog://categories resource)"),
        minPrice: z.number().nonnegative().optional().describe("Minimum variant price in dollars"),
        maxPrice: z.number().nonnegative().optional().describe("Maximum variant price in dollars"),
        inStock: z.boolean().optional().describe("Only return products with at least one variant in stock"),
        limit: z.number().int().min(1).max(50).default(10),
        cursor: z.string().optional().describe("nextCursor from a previous page"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      runTool(async () => {
        const page = await client.searchProducts({
          query: args.query,
          category: args.category,
          minPriceCents: dollarsToCents(args.minPrice),
          maxPriceCents: dollarsToCents(args.maxPrice),
          inStock: args.inStock,
          limit: args.limit,
          cursor: args.cursor,
        });
        return { ...page, items: page.items.map(productSummary) };
      }),
  );

  server.registerTool(
    "get_product",
    {
      title: "Get product",
      description: "Get full product details including every variant's SKU, price and inventory.",
      inputSchema: { productId: z.string().min(1).describe("Product id, e.g. prd_daypack") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ productId }) => runTool(async () => productDetail(await client.getProduct(productId))),
  );
}
