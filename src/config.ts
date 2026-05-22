import dotenv from 'dotenv';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

dotenv.config();

function optional(key: string, defaultValue = ''): string {
  return (process.env[key] ?? defaultValue).trim();
}

function parseBool(key: string, defaultValue = false): boolean {
  const val = (process.env[key] ?? String(defaultValue)).trim().toLowerCase();
  return ['1', 'true', 'yes'].includes(val);
}

function parseInt_(key: string, defaultValue = 0): number {
  const val = parseInt(process.env[key] ?? String(defaultValue), 10);
  return isNaN(val) ? defaultValue : val;
}

class Config {
  readonly gphotoCred: string;
  readonly stagingDir: string;
  readonly outputDir: string;
  readonly unresolvedDir: string;
  readonly resolvedDir: string;
  readonly astrometryApiKey: string;
  readonly geminiApiKey: string;
  readonly aiVisionModel: string;
  readonly dryRun: boolean;
  readonly plateSolveTimeout: number;
  readonly skipExisting: boolean;
  readonly downloadCacheFile: string;

  constructor() {
    this.gphotoCred = optional('GPHOTO_CREDENTIALS_FILE', 'credentials.json');
    this.stagingDir = optional('STAGING_DIR', './staging');
    this.outputDir = optional('OUTPUT_DIR', './output');
    this.unresolvedDir = optional('UNRESOLVED_DIR', './output/unresolved');
    this.resolvedDir = resolve(this.outputDir, 'resolved');
    this.astrometryApiKey = optional('ASTROMETRY_API_KEY');
    this.geminiApiKey = optional('GEMINI_API_KEY');
    this.aiVisionModel = optional('AI_VISION_MODEL', 'gemini-2.5-flash');
    this.dryRun = parseBool('DRY_RUN', false);
    this.plateSolveTimeout = parseInt_('PLATE_SOLVE_TIMEOUT_SECONDS', 180);
    this.skipExisting = parseBool('SKIP_EXISTING', true);
    this.downloadCacheFile = optional('DOWNLOAD_CACHE_FILE', './output/download_cache.json');
  }

  ensureDirs(): void {
    for (const dir of [this.stagingDir, this.resolvedDir, this.unresolvedDir]) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

export const cfg = new Config();
