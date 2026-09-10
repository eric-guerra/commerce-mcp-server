import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CommerceClient } from "../commerce/client.js";
import { salesReport } from "./present.js";
import { runTool } from "./result.js";

export function registerReportTools(server: McpServer, client: CommerceClient): void {
  server.registerTool(
    "sales_summary",
    {
      title: "Sales summary",
      description:
        "Gross, refunded and net revenue plus top products for orders created in a date range. " +
        "Pending and cancelled orders are excluded.",
      inputSchema: {
        from: z.string().datetime({ offset: true }).optional().describe("ISO 8601 start, inclusive"),
        to: z.string().datetime({ offset: true }).optional().describe("ISO 8601 end, inclusive"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (range) => runTool(async () => salesReport(await client.salesSummary(range))),
  );
}
