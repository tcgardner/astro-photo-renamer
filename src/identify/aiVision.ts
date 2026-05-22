import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as logger from '../logger.js';

export interface VisionResult {
  messier: string | null;
  caldwell: string | null;
  ngc: string | null;
  ic: string | null;
  commonName: string | null;
  confidence: 'high' | 'medium' | 'low';
}

const PROMPT = `You are an expert astrophotographer. Analyze this image and identify the \
deep-space object shown. Return ONLY a JSON object with no additional text:
{
  "messier": "M31" or null,
  "caldwell": "C5" or null,
  "ngc": "NGC 224" or null,
  "ic": null,
  "common_name": "Andromeda Galaxy",
  "confidence": "high" | "medium" | "low"
}
If you cannot identify the object with at least medium confidence, return \
confidence "low" and null for all identifiers.`;

const CATALOG_RE = /^(M\d{1,3}|C\d{1,3}|NGC\s*\d{1,4}|IC\s*\d{1,4})$/i;

function validateId(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim();
  return CATALOG_RE.test(s) ? s : null;
}

export function parseResponse(text: string): VisionResult {
  const m = /\{.*?\}/s.exec(text);
  if (!m) return { messier: null, caldwell: null, ngc: null, ic: null, commonName: null, confidence: 'low' };

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return { messier: null, caldwell: null, ngc: null, ic: null, commonName: null, confidence: 'low' };
  }

  const raw = String(data['confidence'] ?? 'low').toLowerCase();
  const confidence: 'high' | 'medium' | 'low' =
    raw === 'high' ? 'high' : raw === 'medium' ? 'medium' : 'low';

  return {
    messier: validateId(data['messier']),
    caldwell: validateId(data['caldwell']),
    ngc: validateId(data['ngc']),
    ic: validateId(data['ic']),
    commonName: String(data['common_name'] ?? '').trim() || null,
    confidence,
  };
}

const MEDIA_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export async function identify(
  imagePath: string,
  apiKey: string,
  model: string,
): Promise<VisionResult> {
  const low: VisionResult = { messier: null, caldwell: null, ngc: null, ic: null, commonName: null, confidence: 'low' };

  if (!apiKey) {
    logger.warn('GEMINI_API_KEY not set; skipping AI vision.');
    return low;
  }

  const imageData = readFileSync(imagePath).toString('base64');
  const mimeType = MEDIA_MAP[path.extname(imagePath).toLowerCase()] ?? 'image/jpeg';

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageData } },
            { text: PROMPT },
          ],
        },
      ],
    });

    const raw = response.text ?? '';
    const result = parseResponse(raw);
    logger.info(
      `  [vision] confidence=${result.confidence} ` +
      `messier=${result.messier} ngc=${result.ngc} ` +
      `common_name=${result.commonName}`,
    );
    return result;
  } catch (err) {
    logger.warn(`  [vision] API error: ${err}`);
    return low;
  }
}
