# Commerce MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI agents safe, structured access to a store's catalog, inventory, customers, orders and sales reports.

It runs against a built-in **in-memory sandbox store** (for local agent development and demos) or any backend that implements a small **REST contract**, so the same tools work from Claude Desktop, Claude Code, or any MCP client.

```
┌─────────────┐  MCP (stdio)  ┌──────────────────────┐   CommerceClient   ┌──────────────────┐
│  AI agent   │ ────────────▶ │  Tools / resources   │ ─────────────────▶ │ MemoryCommerce   │
│ (MCP client)│ ◀──────────── │  zod-validated input │                    │ HttpCommerce ──▶ REST API
└─────────────┘               └──────────────────────┘                    └──────────────────┘
```

## Features

- **10 tools**: catalog search, product detail, inventory, customers, orders and sales reporting.
- **Read-only by default.** Write tools are *not registered at all* unless `COMMERCE_ALLOW_WRITES=true`, so read-only agents can't even see them.
- **Agent-friendly errors.** Domain failures come back as `isError` results with a code (`NOT_FOUND`, `INVALID_INPUT`, `CONFLICT`, `UPSTREAM_ERROR`) and details, e.g. which SKUs are short and the allowed next order states, so the model can recover on its own.
- **Money-safe.** All amounts are integer cents. Output includes formatted strings so the model never does currency math.
- **Correct order semantics.** Orders are all-or-nothing on stock, duplicate lines are merged, and the order state machine restocks only goods that never shipped.
- **Tool annotations** (`readOnlyHint`, `destructiveHint`) so clients can gate risky calls behind confirmation.

## Tools

| Tool | Type | Description |
|---|---|---|
| `search_products` | read | Keyword search with category, dollar price range and in-stock filters; cursor pagination |
| `get_product` | read | Full product with variants, SKUs, prices, stock |
| `check_inventory` | read | Available and reserved units for a SKU |
| `get_customer` | read | Customer profile with order count and five most recent orders |
| `list_orders` | read | Orders newest first, filter by customer and status |
| `get_order` | read | Line items, subtotal, tax, total |
| `sales_summary` | read | Gross / refunded / net revenue and top products for a date range |
| `create_order` | write | Create a pending order; rejected as a whole if any line is short |
| `update_order_status` | write | Move an order through `pending → paid → fulfilled`, `cancelled`, `refunded` |
| `adjust_inventory` | write | Receive stock or record shrinkage with an audit reason; never below zero |

**Resource:** `catalog://categories` lists the categories with product counts.

### Order lifecycle

```
pending ──▶ paid ──▶ fulfilled
   │          │          │
   ▼          ▼          ▼
cancelled  refunded   refunded
(restock)  (restock)  (no restock: goods shipped)
```

## Quick start

```bash
npm install
npm run build
npm start            # in-memory sandbox, read-only
```

### Use with Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "commerce": {
      "command": "node",
      "args": ["/absolute/path/to/commerce-mcp-server/dist/index.js"],
      "env": { "COMMERCE_ALLOW_WRITES": "true" }
    }
  }
}
```

With Claude Code:

```bash
claude mcp add commerce -e COMMERCE_ALLOW_WRITES=true -- node /absolute/path/to/dist/index.js
```

Try asking: *"Which camping items under $60 are in stock?"*, *"Create an order for Sofia for two navy bottles"*, *"How did September sales compare to August?"*

### Docker

```bash
docker build -t commerce-mcp-server .
docker run -i --rm -e COMMERCE_ALLOW_WRITES=true commerce-mcp-server
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `COMMERCE_BACKEND` | `memory` | `memory` or `http` |
| `COMMERCE_ALLOW_WRITES` | `false` | Must be exactly `true` to register write tools |
| `COMMERCE_TAX_RATE` | `0.0825` | Tax rate for the memory backend (0 to 1) |
| `COMMERCE_API_URL` | n/a | Base URL for the http backend (required for `http`) |
| `COMMERCE_API_TOKEN` | n/a | Sent as `Authorization: Bearer <token>` |
| `COMMERCE_TIMEOUT_MS` | `10000` | Per-request timeout for the http backend |

## HTTP backend contract

Point `COMMERCE_BACKEND=http` at any service that implements:

| Method | Path | Notes |
|---|---|---|
| GET | `products?q&category&min_price&max_price&in_stock&limit&cursor` | prices in cents → `Page<Product>` |
| GET | `products/:id` | `Product` |
| GET | `categories` | `Category[]` |
| GET | `inventory/:sku` | `InventoryLevel` |
| POST | `inventory/:sku/adjustments` | `{ delta, reason }` |
| GET | `customers/:id` | `Customer` |
| GET | `orders?customer_id&status&limit&cursor` | `Page<Order>` |
| GET | `orders/:id` | `Order` |
| POST | `orders` | `{ customerId, items: [{ sku, quantity }] }` |
| PATCH | `orders/:id` | `{ status }` |
| GET | `reports/sales?from&to` | `SalesSummary` |

The shapes are defined in [`src/commerce/types.ts`](src/commerce/types.ts). HTTP 404/400/422/409 map to `NOT_FOUND`/`INVALID_INPUT`/`CONFLICT`, and anything else maps to `UPSTREAM_ERROR`. A JSON body `{ message, details }` is passed through to the agent.

## Project structure

```
src/
  index.ts             stdio entrypoint
  server.ts            McpServer wiring, instructions, resources
  config.ts            env parsing and validation
  commerce/
    client.ts          CommerceClient interface (the only thing tools depend on)
    memoryClient.ts    sandbox store: search scoring, stock checks, state machine, reports
    httpClient.ts      REST adapter with timeout and error mapping
    orderStatus.ts     lifecycle transitions and restock rules
    seed.ts            demo catalog, customers and orders
  tools/               one file per tool group, plus presenters and error wrapping
  lib/                 errors, money, cursor pagination
tests/                 unit tests + end-to-end MCP client/server tests over an in-memory transport
```

## Development

```bash
npm run dev          # run from source with tsx
npm test             # vitest (54 tests)
npm run typecheck
```

To add a backend, implement `CommerceClient` and return it from `src/commerce/factory.ts`. No tool code changes.

## License

MIT
