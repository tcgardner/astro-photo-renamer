import { existsSync, readFileSync, writeFileSync } from 'fs';

export interface CacheEntry {
  filename: string;
  downloadedAt: string;
}

export type DownloadCache = Record<string, CacheEntry>;

export function load(cacheFile: string): DownloadCache {
  if (!existsSync(cacheFile)) return {};
  try {
    return JSON.parse(readFileSync(cacheFile, 'utf8')) as DownloadCache;
  } catch {
    return {};
  }
}

export function save(cacheFile: string, cache: DownloadCache): void {
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
}

export function has(cache: DownloadCache, itemId: string): boolean {
  return Object.prototype.hasOwnProperty.call(cache, itemId);
}

export function add(cache: DownloadCache, itemId: string, filename: string): void {
  cache[itemId] = { filename, downloadedAt: new Date().toISOString() };
}
