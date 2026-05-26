#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync, readdirSync, unlinkSync } from 'fs';
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
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .map(f => path.join(dir, f))
    .sort();
}

// Pre-populate `seen` with existing filenames from astro-db for a given catalog entry.
async function populateSeen(catalogId: string, seen: Map<string, number>): Promise<void> {
  const filenames = await astroDb.getExistingFilenames(cfg.astroDbUrl, catalogId).catch(() => []);
  for (const filename of filenames) {
    const stem = path.basename(filename, path.extname(filename));
    const base = stem.replace(/_\d{2}$/, '');
    seen.set(base, (seen.get(base) ?? 0) + 1);
  }
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
  const seenPopulated = new Set<string>();

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
      // Normalize: strip spaces so stored catalog_id is always spaceless (e.g. "NGC2024" not "NGC 2024").
      const catalogId = (result.messier ?? result.caldwell ?? result.ngc ?? result.ic!).replace(/\s+/g, '');

      // Lazy: pre-populate seen from astro-db the first time we encounter this catalog entry.
      if (!seenPopulated.has(catalogId) && !cfg.dryRun) {
        await populateSeen(catalogId, seen);
        seenPopulated.add(catalogId);
      }

      const baseName  = rename.buildBaseName(result);
      const ext       = path.extname(imgPath).toLowerCase();
      const destFilename = rename.resolveFilename(baseName, ext, seen);

      if (cfg.dryRun) {
        logger.info(`  [dry-run] Would upload → ${destFilename}`);
        runLog.record({
          sourceFile: path.basename(imgPath),
          stage: result.stage,
          identifier: catalogId,
          commonName: result.commonName,
          destFile: destFilename,
          success: true,
        });
        continue;
      }

      try {
        const uploaded = await astroDb.uploadImage(cfg.astroDbUrl, imgPath, {
          catalog_id:        catalogId,
          filename:          destFilename,
          original_filename: path.basename(imgPath),
          id_stage:          result.stage,
          processed_at:      new Date().toISOString(),
          captured_at:       result.capturedAt ?? undefined,
          common_name:       result.commonName ?? undefined,
        });

        unlinkSync(imgPath);
        logger.success(`  Uploaded → ${destFilename} (id=${uploaded.id})`);

        runLog.record({
          sourceFile: path.basename(imgPath),
          stage: result.stage,
          identifier: catalogId,
          commonName: result.commonName,
          destFile: destFilename,
          success: true,
        });
      } catch (err: any) {
        logger.warn(`  Upload failed: ${(err as Error).message} — file kept in staging`);
        runLog.record({
          sourceFile: path.basename(imgPath),
          stage: result.stage,
          identifier: catalogId,
          commonName: result.commonName,
          destFile: destFilename,
          success: false,
        });
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

if (cfg.dryRun) logger.warn('DRY_RUN=true — no files will be uploaded or removed.');

const program = new Command();
program
  .name('astro-photo-renamer')
  .description('Select photos via Google Photos Picker, identify, and upload to astro-db.');

program
  .command('download')
  .description('Open Google Photos Picker and download selected images.')
  .action(async () => {
    await cmdDownload();
  });

program
  .command('identify')
  .description('Run identification pipeline on staged images and upload to astro-db.')
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
  .description("Alias for 'identify'.")
  .action(async () => {
    await cmdIdentifyAndRename(findImages(cfg.stagingDir));
  });

program
  .command('run')
  .description('Open picker, download, identify, and upload in one shot.')
  .option('--local', 'Skip download; process images already in staging/', false)
  .action(async (opts: { local: boolean }) => {
    await cmdRun(opts.local);
  });

program.parseAsync(process.argv).catch(err => {
  logger.error(String(err));
  process.exit(1);
});
