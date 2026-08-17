import type { Page } from "../commerce/types.js";
import { invalid } from "./errors.js";

export const DEFAULT_PAGE_SIZE = 20;

export function encodeCursor(offset: number): string {
  return Buffer.from(`o:${offset}`).toString("base64url");
}

export function decodeCursor(cursor: string): number {
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const match = /^o:(\d+)$/.exec(raw);
  if (!match) throw invalid("Invalid pagination cursor", { cursor });
  return Number(match[1]);
}

export function paginate<T>(all: readonly T[], limit = DEFAULT_PAGE_SIZE, cursor?: string): Page<T> {
  const offset = cursor ? decodeCursor(cursor) : 0;
  const end = offset + limit;
  return {
    items: all.slice(offset, end),
    nextCursor: end < all.length ? encodeCursor(end) : null,
    total: all.length,
  };
}
