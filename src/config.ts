export type AppConfig =
  | { backend: "memory"; allowWrites: boolean; taxRate: number }
  | { backend: "http"; allowWrites: boolean; apiUrl: string; apiToken?: string; timeoutMs: number };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const backend = env.COMMERCE_BACKEND ?? "memory";
  const allowWrites = env.COMMERCE_ALLOW_WRITES === "true";

  if (backend === "memory") {
    const taxRate = Number(env.COMMERCE_TAX_RATE ?? "0.0825");
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
      throw new Error(`COMMERCE_TAX_RATE must be between 0 and 1, got "${env.COMMERCE_TAX_RATE}"`);
    }
    return { backend, allowWrites, taxRate };
  }

  if (backend === "http") {
    const apiUrl = env.COMMERCE_API_URL;
    if (!apiUrl) throw new Error("COMMERCE_API_URL is required when COMMERCE_BACKEND=http");
    if (!URL.canParse(apiUrl)) throw new Error(`COMMERCE_API_URL is not a valid URL: "${apiUrl}"`);
    const timeoutMs = Number(env.COMMERCE_TIMEOUT_MS ?? "10000");
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error(`COMMERCE_TIMEOUT_MS must be a positive integer, got "${env.COMMERCE_TIMEOUT_MS}"`);
    }
    return { backend, allowWrites, apiUrl, apiToken: env.COMMERCE_API_TOKEN || undefined, timeoutMs };
  }

  throw new Error(`Unknown COMMERCE_BACKEND "${backend}" (expected "memory" or "http")`);
}
