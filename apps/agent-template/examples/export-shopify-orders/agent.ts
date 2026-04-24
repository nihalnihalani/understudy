// TinyFish script emitted by Gemini 3 Flash for `export-shopify-orders`.
// Pinned skills: shopify.orders.list@2.3.1, csv.serialize@1.1.0.
// This is the artifact the demo wall shows at 2:55 (architecture.md §15).

import { openAgent, runSkill } from "@tinyfish/cli";

interface ExportInputs {
  dateRange?: string;
  format?: "CSV" | "JSON" | "PARQUET";
}

export default async function exportShopifyOrders(inputs: ExportInputs = {}) {
  const dateRange = inputs.dateRange ?? "yesterday";
  const format = inputs.format ?? "CSV";

  const agent = await openAgent({
    url: "https://admin.shopify.com/store/demo",
    product: "web_agent",
  });

  const orders = await runSkill(agent, "shopify.orders.list@2.3.1", {
    dateRange,
    includeRefunds: false,
  });

  const serialized = await runSkill(agent, "csv.serialize@1.1.0", {
    rows: orders.rows,
    columns: ["order_id", "customer_email", "total", "currency", "placed_at"],
  });

  await agent.close();

  return {
    id: `export-${Date.now()}`,
    rowCount: orders.rows.length,
    downloadUrl: serialized.url,
    format,
    generatedAt: new Date().toISOString(),
  };
}
