import type { AppConfig } from "../config.js";
import type { CommerceClient } from "./client.js";
import { HttpCommerceClient } from "./httpClient.js";
import { MemoryCommerceClient } from "./memoryClient.js";
import { seedData } from "./seed.js";

export function createCommerceClient(config: AppConfig): CommerceClient {
  if (config.backend === "http") {
    return new HttpCommerceClient({ baseUrl: config.apiUrl, token: config.apiToken, timeoutMs: config.timeoutMs });
  }
  return new MemoryCommerceClient(seedData, { taxRate: config.taxRate });
}
