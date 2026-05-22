import * as exifProbe from './exifProbe.js';
import * as plateSolve from './plateSolve.js';
import * as catalogLookup from './catalogLookup.js';
import * as aiVision from './aiVision.js';
import * as logger from '../logger.js';

export interface IdentifyResult {
  messier: string | null;
  caldwell: string | null;
  ngc: string | null;
  ic: string | null;
  commonName: string | null;
  stage: string;
  resolved: boolean;
}

type CatalogFields = Pick<IdentifyResult, 'messier' | 'caldwell' | 'ngc' | 'ic'>;

export function mergeObjectsInField(objects: string[]): CatalogFields | null {
  const recognized = objects
    .map(obj => catalogNameToFields(obj))
    .filter(f => Object.values(f).some(Boolean));
  if (!recognized.length) return null;
  return {
    messier:  recognized.find(f => f.messier)?.messier   ?? null,
    caldwell: recognized.find(f => f.caldwell)?.caldwell ?? null,
    ngc:      recognized.find(f => f.ngc)?.ngc           ?? null,
    ic:       recognized.find(f => f.ic)?.ic             ?? null,
  };
}

function normalize(raw: string): string {
  return raw.trim().toUpperCase().replace(/^(M|C)\s+(\d)/, '$1$2');
}

export function catalogNameToFields(name: string): CatalogFields {
  name = normalize(name);
  if (/^M\d+$/.test(name))     return { messier: name, caldwell: null, ngc: null, ic: null };
  if (/^C\d+$/.test(name))     return { messier: null, caldwell: name, ngc: null, ic: null };
  if (/^NGC\s*\d+$/.test(name)) return { messier: null, caldwell: null, ngc: name.replace(/^NGC\s*/, 'NGC '), ic: null };
  if (/^IC\s*\d+$/.test(name))  return { messier: null, caldwell: null, ngc: null, ic: name.replace(/^IC\s*/, 'IC ') };
  return { messier: null, caldwell: null, ngc: null, ic: null };
}

export interface RunOptions {
  astrometryApiKey: string;
  plateSolveTimeout: number;
  geminiApiKey: string;
  aiVisionModel: string;
}

export async function run(imagePath: string, opts: RunOptions): Promise<IdentifyResult> {
  const imgName = imagePath.split(/[\\/]/).pop()!;

  // ── Layer 1: EXIF probe ──────────────────────────────────────────────────
  logger.info(`[L1-EXIF] ${imgName}`);
  const exif = exifProbe.probe(imagePath);

  if (exif.catalogName) {
    const fields = catalogNameToFields(exif.catalogName);
    logger.success(`  Resolved via EXIF: ${exif.catalogName}`);
    return { ...fields, commonName: null, stage: 'exif', resolved: true };
  }

  let ra = exif.ra;
  let dec = exif.dec;
  let radius: number | null = null;
  let stagePrefix: string;

  if (ra !== null && dec !== null) {
    logger.info(`  EXIF has RA/Dec (${ra.toFixed(4)}, ${dec.toFixed(4)}); skipping plate solve.`);
    stagePrefix = 'exif_coords';
  } else {
    // ── Layer 2: Plate solve ─────────────────────────────────────────────
    logger.info(`[L2-PLATE] ${imgName}`);
    const ps = await plateSolve.solve(imagePath, opts.astrometryApiKey, opts.plateSolveTimeout);

    const merged = mergeObjectsInField(ps.objectsInField);
    if (merged) {
      const label = merged.messier ?? merged.caldwell ?? merged.ngc ?? merged.ic;
      logger.success(`  Resolved via plate solve objects_in_field: ${label}`);
      return { ...merged, commonName: null, stage: 'plate_solve', resolved: true };
    }

    ra = ps.ra;
    dec = ps.dec;
    radius = ps.radius;
    stagePrefix = 'plate_solve';
  }

  if (ra !== null && dec !== null) {
    // ── Layer 2b: Catalog cross-reference ───────────────────────────────
    logger.info(`[L2b-CAT] RA=${ra.toFixed(4)} Dec=${dec.toFixed(4)}`);
    const cat = await catalogLookup.lookup(ra, dec, radius ?? 0.5);

    if (cat.messier || cat.caldwell || cat.ngc || cat.ic) {
      logger.success(
        `  Resolved via catalog lookup: ` +
        `M=${cat.messier} C=${cat.caldwell} NGC=${cat.ngc} IC=${cat.ic}`,
      );
      return {
        messier: cat.messier,
        caldwell: cat.caldwell,
        ngc: cat.ngc,
        ic: cat.ic,
        commonName: cat.commonName,
        stage: `${stagePrefix}+catalog`,
        resolved: true,
      };
    }
  }

  // ── Layer 3: AI vision fallback ──────────────────────────────────────────
  logger.info(`[L3-AI] ${imgName}`);
  const vis = await aiVision.identify(imagePath, opts.geminiApiKey, opts.aiVisionModel);

  if (
    (vis.confidence === 'high' || vis.confidence === 'medium') &&
    (vis.messier || vis.caldwell || vis.ngc || vis.ic)
  ) {
    logger.success(
      `  Resolved via AI vision (${vis.confidence}): ` +
      `M=${vis.messier} NGC=${vis.ngc} name=${vis.commonName}`,
    );
    return {
      messier: vis.messier,
      caldwell: vis.caldwell,
      ngc: vis.ngc,
      ic: vis.ic,
      commonName: vis.commonName,
      stage: 'ai_vision',
      resolved: true,
    };
  }

  // ── Layer 4: Unresolved ──────────────────────────────────────────────────
  logger.warn(`  Unresolved: ${imgName}`);
  return {
    messier: null, caldwell: null, ngc: null, ic: null,
    commonName: null, stage: 'unresolved', resolved: false,
  };
}
