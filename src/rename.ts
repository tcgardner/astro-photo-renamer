import { copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import * as path from 'path';
import type { IdentifyResult } from './identify/pipeline.js';
import * as logger from './logger.js';

export function buildBaseName(result: IdentifyResult): string {
  let identifier: string;
  if (result.messier)       identifier = result.messier;
  else if (result.caldwell) identifier = result.caldwell;
  else if (result.ngc)      identifier = result.ngc.replace(' ', '_');
  else if (result.ic)       identifier = result.ic.replace(' ', '_');
  else throw new Error('IdentifyResult has no identifier');

  if (result.commonName) return `${identifier}_${sanitize(result.commonName)}`;
  return identifier;
}

function sanitize(text: string): string {
  text = text.trim().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '_');
  return text.replace(/^_+|_+$/g, '');
}

// Returns just the filename (no directory prefix). Increments the seen counter.
export function resolveFilename(
  baseName: string,
  suffix: string,
  seen: Map<string, number>,
): string {
  const count = (seen.get(baseName) ?? 0) + 1;
  seen.set(baseName, count);
  return count === 1
    ? `${baseName}${suffix}`
    : `${baseName}_${String(count).padStart(2, '0')}${suffix}`;
}

export function resolveDest(
  baseName: string,
  suffix: string,
  resolvedDir: string,
  seen: Map<string, number>,
): string {
  return path.join(resolvedDir, resolveFilename(baseName, suffix, seen));
}

function moveFile(src: string, dest: string): void {
  try {
    renameSync(src, dest);
  } catch {
    // Cross-device fallback.
    copyFileSync(src, dest);
    unlinkSync(src);
  }
}

export function moveResolved(
  src: string,
  result: IdentifyResult,
  resolvedDir: string,
  seen: Map<string, number>,
  dryRun = false,
): string {
  const dest = resolveDest(buildBaseName(result), path.extname(src).toLowerCase(), resolvedDir, seen);
  if (dryRun) {
    logger.info(`  [dry-run] Would move → ${path.basename(dest)}`);
  } else {
    mkdirSync(resolvedDir, { recursive: true });
    moveFile(src, dest);
    logger.success(`  Moved → ${path.basename(dest)}`);
  }
  return dest;
}

export function moveUnresolved(src: string, unresolvedDir: string, dryRun = false): string {
  const ext = path.extname(src);
  const stem = path.basename(src, ext);
  let dest = path.join(unresolvedDir, path.basename(src));
  let counter = 1;

  while (existsSync(dest) && !dryRun) {
    counter++;
    dest = path.join(unresolvedDir, `${stem}_${String(counter).padStart(2, '0')}${ext}`);
  }

  if (dryRun) {
    logger.info(`  [dry-run] Would copy to unresolved → ${path.basename(dest)}`);
  } else {
    mkdirSync(unresolvedDir, { recursive: true });
    moveFile(src, dest);
    logger.warn(`  Unresolved → ${path.basename(dest)}`);
  }
  return dest;
}
