import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CommerceClient } from "./commerce/client.js";
import { registerCustomerTools } from "./tools/customers.js";
import { registerInventoryTools } from "./tools/inventory.js";
import { registerOrderTools } from "./tools/orders.js";
import { registerProductTools } from "./tools/products.js";
import { registerReportTools } from "./tools/reports.js";

export const SERVER_NAME = "commerce-mcp-server";
export const SERVER_VERSION = "0.1.0";

export interface ServerOptions {
  client: CommerceClient;
  /** Write tools are not registered at all unless enabled, so read-only agents cannot see them. */
  allowWrites: boolean;
}

export function createServer({ client, allowWrites }: ServerOptions): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Tools for a store's catalog, inventory, customers, orders and sales reports. " +
        "Prices in tool output are given both as integer cents (*Cents) and formatted strings. " +
        (allowWrites
          ? "Write tools are enabled: confirm order changes with the user before calling them."
          : "This server is read-only."),
    },
  );

  registerProductTools(server, client);
  registerInventoryTools(server, client, allowWrites);
  registerCustomerTools(server, client);
  registerOrderTools(server, client, allowWrites);
  registerReportTools(server, client);

  server.registerResource(
    "categories",
    "catalog://categories",
    {
      title: "Catalog categories",
      description: "All product categories with product counts",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "application/json", text: JSON.stringify(await client.listCategories(), null, 2) },
      ],
    }),
  );

  return server;
}
