#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync, readdirSync } from 'fs';
import * as path from 'path';
import { cfg } from './config.js';
import * as logger from './logger.js';
import { RunLogger } from './logger.js';
import * as gphoto from './gphoto.js';
import * as pipeline from './identify/pipeline.js';
import * as rename from './rename.js';
import * as astroDb from './astroDb.js';

function findImages(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => /\.(jpg|jpeg)$/i.test(f))
    .map(f => path.join(dir, f))
    .sort();
}

async function cmdDownload(): Promise<void> {
  cfg.ensureDirs();
  const files = await gphoto.downloadSelection(cfg.gphotoCred, cfg.stagingDir, cfg.skipExisting, cfg.downloadCacheFile);
  logger.success(`Downloaded ${files.length} image(s) to ${cfg.stagingDir}`);
}

async function cmdIdentifyAndRename(stagedFiles: string[]): Promise<void> {
  cfg.ensureDirs();
  const runLog = new RunLogger(cfg.outputDir);
  const seen = new Map<string, number>();

  // Pre-populate seen from resolved/ to handle re-runs.
  if (existsSync(cfg.resolvedDir)) {
    for (const f of readdirSync(cfg.resolvedDir)) {
      const stem = path.basename(f, path.extname(f));
      const base = stem.replace(/_\d{2}$/, '');
      seen.set(base, (seen.get(base) ?? 0) + 1);
    }
  }

  for (const imgPath of stagedFiles) {
    if (!existsSync(imgPath)) {
      logger.warn(`Missing file (skipped): ${imgPath}`);
      continue;
    }

    const result = await pipeline.run(imgPath, {
      astrometryApiKey: cfg.astrometryApiKey,
      plateSolveTimeout: cfg.plateSolveTimeout,
      geminiApiKey: cfg.geminiApiKey,
      aiVisionModel: cfg.aiVisionModel,
    });

    if (result.resolved) {
      const dest = rename.moveResolved(imgPath, result, cfg.resolvedDir, seen, cfg.dryRun);
      runLog.record({
        sourceFile: path.basename(imgPath),
        stage: result.stage,
        identifier: result.messier ?? result.caldwell ?? result.ngc ?? result.ic,
        commonName: result.commonName,
        destFile: path.basename(dest),
        success: true,
      });

      if (!cfg.dryRun) {
        void astroDb.registerImage(cfg.astroDbUrl, {
          catalog_id:        result.messier ?? result.caldwell ?? result.ngc ?? result.ic!,
          filename:          path.basename(dest),
          original_filename: path.basename(imgPath),
          file_path:         dest,
          id_stage:          result.stage,
          processed_at:      new Date().toISOString(),
          captured_at:       result.capturedAt ?? undefined,
          common_name:       result.commonName ?? undefined,
        }).catch(err => logger.warn(`  DB registration skipped: ${(err as Error).message}`));
      }
    } else {
      const dest = rename.moveUnresolved(imgPath, cfg.unresolvedDir, cfg.dryRun);
      runLog.record({
        sourceFile: path.basename(imgPath),
        stage: 'unresolved',
        identifier: null,
        commonName: null,
        destFile: path.basename(dest),
        success: false,
      });
    }
  }

  const logPath = runLog.flush();
  logger.success(`Run log written to ${logPath}`);
}

async function cmdRun(local: boolean): Promise<void> {
  let staged: string[] = [];

  if (!local) {
    cfg.ensureDirs();
    staged = await gphoto.downloadSelection(cfg.gphotoCred, cfg.stagingDir, cfg.skipExisting, cfg.downloadCacheFile);
  } else {
    cfg.ensureDirs();
    staged = findImages(cfg.stagingDir);
    logger.info(`Local mode: found ${staged.length} image(s) in ${cfg.stagingDir}`);
  }

  if (!staged.length) {
    logger.warn('No images to process.');
    return;
  }

  await cmdIdentifyAndRename(staged);
}

if (cfg.dryRun) logger.warn('DRY_RUN=true — no files will be moved or renamed.');

const program = new Command();
program
  .name('astro-photo-renamer')
  .description('Select photos via Google Photos Picker and rename astrophotos by catalog identifier.');

program
  .command('download')
  .description('Open Google Photos Picker and download selected images.')
  .action(async () => {
    await cmdDownload();
  });

program
  .command('identify')
  .description('Run identification pipeline on staged images.')
  .action(async () => {
    const staged = findImages(cfg.stagingDir);
    if (!staged.length) {
      logger.warn(`No images found in ${cfg.stagingDir}. Run 'download' first.`);
      process.exit(1);
    }
    logger.info(`Processing ${staged.length} staged image(s)…`);
    await cmdIdentifyAndRename(staged);
  });

program
  .command('rename')
  .description("Rename already-identified images (alias for 'identify').")
  .action(async () => {
    await cmdIdentifyAndRename(findImages(cfg.stagingDir));
  });

program
  .command('run')
  .description('Open picker, download, identify, and rename in one shot.')
  .option('--local', 'Skip download; process images already in staging/', false)
  .action(async (opts: { local: boolean }) => {
    await cmdRun(opts.local);
  });

program.parseAsync(process.argv).catch(err => {
  logger.error(String(err));
  process.exit(1);
});
