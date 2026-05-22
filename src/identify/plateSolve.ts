import { readFileSync } from 'fs';
import * as path from 'path';
import * as logger from '../logger.js';

export interface PlateResult {
  ra: number | null;
  dec: number | null;
  radius: number | null;
  objectsInField: string[];
}

const BASE = 'https://nova.astrometry.net/api';

async function apiPost(endpoint: string, body: FormData): Promise<Record<string, unknown>> {
  const resp = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  return resp.json() as Promise<Record<string, unknown>>;
}

async function login(apiKey: string): Promise<string> {
  const form = new FormData();
  form.append('request-json', JSON.stringify({ apikey: apiKey }));
  const data = await apiPost('/login', form);
  if (data['status'] !== 'success') throw new Error(`astrometry.net login failed: ${JSON.stringify(data)}`);
  return data['session'] as string;
}

async function submit(sessionKey: string, imagePath: string): Promise<number> {
  const buf = readFileSync(imagePath);
  const blob = new Blob([buf], { type: 'image/jpeg' });
  const form = new FormData();
  form.append('request-json', JSON.stringify({ session: sessionKey }));
  form.append('file', blob, path.basename(imagePath));

  const resp = await fetch(`${BASE}/upload`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!resp.ok) throw new Error(`Upload failed: HTTP ${resp.status}`);
  const data = await resp.json() as Record<string, unknown>;
  if (data['status'] !== 'success') throw new Error(`Upload failed: ${JSON.stringify(data)}`);
  return parseInt(data['subid'] as string, 10);
}

async function pollSubmission(subid: number, deadline: number): Promise<number> {
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`${BASE}/submissions/${subid}`, { signal: AbortSignal.timeout(15_000) });
      if (resp.ok) {
        const data = await resp.json() as Record<string, unknown>;
        const jobs = ((data['jobs'] as unknown[]) ?? []).filter(j => j !== null).map(Number);
        if (jobs.length) return jobs[0];
      }
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Timed out waiting for submission ${subid} to get a job.`);
}

async function pollJob(jobId: number, deadline: number): Promise<string> {
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`${BASE}/jobs/${jobId}`, { signal: AbortSignal.timeout(15_000) });
      if (resp.ok) {
        const data = await resp.json() as Record<string, unknown>;
        const status = data['status'] as string ?? '';
        if (status === 'success' || status === 'failure') return status;
      }
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Timed out waiting for job ${jobId}.`);
}

export async function solve(
  imagePath: string,
  apiKey: string,
  timeoutSeconds = 180,
): Promise<PlateResult> {
  if (!apiKey) {
    logger.warn('ASTROMETRY_API_KEY not set; skipping plate solving.');
    return { ra: null, dec: null, radius: null, objectsInField: [] };
  }

  const deadline = Date.now() + timeoutSeconds * 1000;
  const imgName = path.basename(imagePath);

  try {
    const sessionKey = await login(apiKey);
    logger.info(`  [plate] Uploading ${imgName}…`);
    const subid = await submit(sessionKey, imagePath);
    logger.info(`  [plate] Submission ${subid}; waiting for job…`);

    const jobId = await pollSubmission(subid, deadline);
    logger.info(`  [plate] Job ${jobId}; solving…`);

    const status = await pollJob(jobId, deadline);
    if (status !== 'success') {
      logger.warn(`  [plate] Job ${jobId} failed for ${imgName}.`);
      return { ra: null, dec: null, radius: null, objectsInField: [] };
    }

    const infoResp = await fetch(`${BASE}/jobs/${jobId}/info`, { signal: AbortSignal.timeout(15_000) });
    if (!infoResp.ok) throw new Error(`Info fetch failed: HTTP ${infoResp.status}`);
    const info = await infoResp.json() as Record<string, unknown>;

    const cal = (info['calibration'] as Record<string, unknown>) ?? {};
    const ra = cal['ra'] != null ? parseFloat(cal['ra'] as string) : null;
    const dec = cal['dec'] != null ? parseFloat(cal['dec'] as string) : null;
    const radius = cal['radius'] != null ? parseFloat(cal['radius'] as string) : null;
    const objectsInField = (info['objects_in_field'] as string[]) ?? [];

    logger.success(
      `  [plate] Solved: RA=${ra?.toFixed(4)} Dec=${dec?.toFixed(4)} ` +
      `r=${radius?.toFixed(3)}° objects=${JSON.stringify(objectsInField)}`,
    );
    return { ra, dec, radius, objectsInField };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Timed out')) logger.warn(`  [plate] ${msg}`);
    else logger.warn(`  [plate] Error solving ${imgName}: ${msg}`);
    return { ra: null, dec: null, radius: null, objectsInField: [] };
  }
}
