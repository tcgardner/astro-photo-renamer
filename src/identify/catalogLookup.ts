import * as logger from '../logger.js';

export interface CatalogResult {
  messier: string | null;
  caldwell: string | null;
  ngc: string | null;
  ic: string | null;
  commonName: string | null;
}

const VIZIER_BASE = 'https://vizier.cds.unistra.fr/viz-bin/asu-tsv';
const MESSIER_CAT = 'VII/118';
const CALDWELL_CAT = 'VII/294';
const NGC_CAT = 'VII/1B';

const NGC_IC_RE = /^([NI])(\d+)$/;

async function vizierNearest(
  ra: number,
  dec: number,
  radiusDeg: number,
  catalog: string,
): Promise<Record<string, string> | null> {
  const params = new URLSearchParams({
    '-source': catalog,
    '-c': `${ra}+${dec}`,
    '-c.rd': String(radiusDeg),
    '-out.max': '1',
  });

  try {
    const resp = await fetch(`${VIZIER_BASE}?${params}`, { signal: AbortSignal.timeout(20_000) });
    if (!resp.ok) return null;
    return parseTsv(await resp.text());
  } catch (err) {
    logger.warn(`  [catalog] VizieR query ${catalog} failed: ${err}`);
    return null;
  }
}

export function parseTsv(text: string): Record<string, string> | null {
  const lines = text.split('\n').filter(l => !l.startsWith('#') && l.trim().length > 0);
  if (lines.length < 2) return null;

  const headers = lines[0].split('\t').map(h => h.trim());
  const dataLines = lines.slice(1).filter(l => !/^[-\s]+$/.test(l));
  if (!dataLines.length) return null;

  const values = dataLines[0].split('\t').map(v => v.trim());
  const result: Record<string, string> = {};
  headers.forEach((h, i) => { result[h] = values[i] ?? ''; });
  return result;
}

export async function lookup(
  ra: number,
  dec: number,
  fieldRadiusDeg: number,
): Promise<CatalogResult> {
  const searchRadius = Math.max(fieldRadiusDeg * 0.5, 0.25);

  let messier: string | null = null;
  let caldwell: string | null = null;
  let ngc: string | null = null;
  let ic: string | null = null;
  let commonName: string | null = null;

  // Messier
  const mRow = await vizierNearest(ra, dec, searchRadius, MESSIER_CAT);
  if (mRow) {
    const mNum = mRow['M'] || mRow['_M'] || mRow['Messier'];
    if (mNum?.trim()) {
      const n = parseInt(mNum.trim(), 10);
      if (!isNaN(n)) messier = `M${n}`;
    }
    if (!commonName) commonName = mRow['Name']?.trim() || null;
  }

  // Caldwell
  const cRow = await vizierNearest(ra, dec, searchRadius, CALDWELL_CAT);
  if (cRow) {
    const cNum = cRow['C'] || cRow['Caldwell'];
    if (cNum?.trim()) {
      const n = parseInt(cNum.trim(), 10);
      if (!isNaN(n)) caldwell = `C${n}`;
    }
    if (!commonName) commonName = cRow['Name']?.trim() || null;
  }

  // NGC/IC
  const nRow = await vizierNearest(ra, dec, searchRadius, NGC_CAT);
  if (nRow) {
    const rawId = (nRow['NGC'] || nRow['_NGC'] || nRow['Name'] || '').trim();
    const m = NGC_IC_RE.exec(rawId);
    if (m) {
      const [, prefix, num] = m;
      if (prefix === 'N') ngc = `NGC ${num}`;
      else ic = `IC ${num}`;
    }
    if (!commonName) commonName = (nRow['CommonName'] || nRow['Name'])?.trim() || null;
  }

  return { messier, caldwell, ngc, ic, commonName: commonName || null };
}
