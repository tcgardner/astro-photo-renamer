import ExifReader from 'exifreader';
import { readFileSync } from 'fs';

export interface ExifResult {
  catalogName: string | null;
  ra: number | null;
  dec: number | null;
}

const CATALOG_RE = /\b(M\s*\d{1,3}|NGC\s*\d{1,4}|IC\s*\d{1,4}|C\s*\d{1,3})\b/i;
const CRVAL1_RE = /CRVAL1\s*[=:]\s*([+-]?\d+\.?\d*)/i;
const CRVAL2_RE = /CRVAL2\s*[=:]\s*([+-]?\d+\.?\d*)/i;
const RA_RE = /\bRA\s*[=:]\s*([+-]?\d+\.?\d*)/i;
const DEC_RE = /\bDEC\s*[=:]\s*([+-]?\d+\.?\d*)/i;

function normalizeCatalog(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '');
}

export function probe(imagePath: string): ExifResult {
  let buf: Buffer;
  try {
    buf = readFileSync(imagePath);
  } catch {
    return { catalogName: null, ra: null, dec: null };
  }

  let tags: unknown;
  try {
    tags = ExifReader.load(buf, { expanded: true });
  } catch {
    return { catalogName: null, ra: null, dec: null };
  }

  const textBlobs: string[] = [];
  const tagsObj = tags as Record<string, unknown>;

  // Standard EXIF text tags.
  const exif = tagsObj['exif'] as Record<string, { description?: unknown }> | undefined;
  if (exif) {
    for (const tagName of ['ImageDescription', 'XPComment', 'UserComment']) {
      const val = exif[tagName]?.description;
      if (typeof val === 'string') textBlobs.push(val);
    }
  }

  // XMP / other metadata.
  const xmp = tagsObj['xmp'];
  if (xmp) textBlobs.push(JSON.stringify(xmp));

  const combined = textBlobs.join(' ');

  let catalogName: string | null = null;
  const catMatch = CATALOG_RE.exec(combined);
  if (catMatch) catalogName = normalizeCatalog(catMatch[1]);

  let ra: number | null = null;
  let dec: number | null = null;

  for (const [raRe, decRe] of [[CRVAL1_RE, CRVAL2_RE], [RA_RE, DEC_RE]]) {
    const mRa = raRe.exec(combined);
    const mDec = decRe.exec(combined);
    if (mRa && mDec) {
      const raParsed = parseFloat(mRa[1]);
      const decParsed = parseFloat(mDec[1]);
      if (!isNaN(raParsed) && !isNaN(decParsed)) {
        ra = raParsed;
        dec = decParsed;
        break;
      }
    }
  }

  return { catalogName, ra, dec };
}
