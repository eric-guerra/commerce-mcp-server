#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCommerceClient } from "./commerce/factory.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer({ client: createCommerceClient(config), allowWrites: config.allowWrites });
  await server.connect(new StdioServerTransport());

  // stdout carries the MCP protocol, so diagnostics go to stderr.
  console.error(`commerce-mcp-server ready (backend=${config.backend}, writes=${config.allowWrites ? "on" : "off"})`);

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
