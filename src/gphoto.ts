import { authenticate } from '@google-cloud/local-auth';
import { OAuth2Client } from 'google-auth-library';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import open from 'open';
import { SingleBar, Presets } from 'cli-progress';
import * as logger from './logger.js';
import * as downloadCache from './downloadCache.js';

const SCOPES = ['https://www.googleapis.com/auth/photospicker.mediaitems.readonly'];
const TOKEN_FILE = 'token.json';
const PICKER_BASE = 'https://photospicker.googleapis.com/v1';

interface CredentialsFile {
  installed?: { client_id: string; client_secret: string };
  web?: { client_id: string; client_secret: string };
}

function readClientInfo(credFile: string): { clientId: string; clientSecret: string } {
  const raw: CredentialsFile = JSON.parse(readFileSync(credFile, 'utf8'));
  const { client_id, client_secret } = raw.installed ?? raw.web!;
  return { clientId: client_id, clientSecret: client_secret };
}

async function getClient(credentialsFile: string): Promise<OAuth2Client> {
  if (existsSync(TOKEN_FILE)) {
    const saved = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
    if (saved.refresh_token || (saved.access_token && saved.expiry_date > Date.now())) {
      const { clientId, clientSecret } = readClientInfo(credentialsFile);
      const client = new OAuth2Client({ clientId, clientSecret });
      client.setCredentials(saved);
      client.on('tokens', tokens => {
        const current = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
        writeFileSync(TOKEN_FILE, JSON.stringify({ ...current, ...tokens }));
      });
      return client;
    }
  }

  if (!existsSync(credentialsFile)) {
    throw new Error(
      `Google credentials file not found: ${credentialsFile}\n` +
      'Download it from Google Cloud Console → OAuth 2.0 Client IDs.',
    );
  }

  const client = await authenticate({ keyfilePath: credentialsFile, scopes: SCOPES });
  const { clientId, clientSecret } = readClientInfo(credentialsFile);
  writeFileSync(TOKEN_FILE, JSON.stringify({ ...client.credentials, clientId, clientSecret }));
  client.on('tokens', tokens => {
    const current = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
    writeFileSync(TOKEN_FILE, JSON.stringify({ ...current, ...tokens }));
  });
  return client;
}

// Parses protobuf Duration strings like "4s" or "1.5s" into milliseconds.
function parseDurationMs(d: string): number {
  const m = /^(\d+(?:\.\d+)?)s$/.exec(d);
  return m ? parseFloat(m[1]) * 1000 : 5000;
}

interface PickerSession {
  id: string;
  pickerUri: string;
  pollIntervalMs: number;
}

async function createSession(client: OAuth2Client): Promise<PickerSession> {
  const { token } = await client.getAccessToken();
  const resp = await fetch(`${PICKER_BASE}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  const data = await resp.json() as Record<string, unknown>;
  const polling = data['pollingConfig'] as Record<string, string> | undefined;
  return {
    id: data['id'] as string,
    pickerUri: data['pickerUri'] as string,
    pollIntervalMs: polling ? parseDurationMs(polling['pollInterval']) : 5000,
  };
}

async function waitForSelection(client: OAuth2Client, session: PickerSession): Promise<void> {
  logger.info('Waiting for photo selection to be confirmed in the browser…');
  while (true) {
    await new Promise(r => setTimeout(r, session.pollIntervalMs));
    const { token } = await client.getAccessToken();
    const resp = await fetch(`${PICKER_BASE}/sessions/${session.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    const data = await resp.json() as Record<string, unknown>;
    if (data['mediaItemsSet']) break;
  }
}

async function* listSessionItems(
  client: OAuth2Client,
  sessionId: string,
): AsyncGenerator<Record<string, unknown>> {
  let pageToken: string | undefined;
  while (true) {
    const url = new URL(`${PICKER_BASE}/mediaItems`);
    url.searchParams.set('sessionId', sessionId);
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const { token } = await client.getAccessToken();
    const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    const data = await resp.json() as Record<string, unknown>;
    for (const item of (data['mediaItems'] as Record<string, unknown>[]) ?? []) yield item;
    pageToken = data['nextPageToken'] as string | undefined;
    if (!pageToken) break;
  }
}

async function deleteSession(client: OAuth2Client, sessionId: string): Promise<void> {
  const { token } = await client.getAccessToken();
  await fetch(`${PICKER_BASE}/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function downloadWithRetry(
  client: OAuth2Client,
  url: string,
  dest: string,
): Promise<string | null> {
  let lastErr = 'unknown error';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { token } = await client.getAccessToken();
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      writeFileSync(dest, Buffer.from(buf));
      return null;
    } catch (err) {
      lastErr = String(err);
      if (attempt === 2) return lastErr;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  return lastErr;
}

export async function downloadSelection(
  credentialsFile: string,
  stagingDir: string,
  skipExisting = true,
  cacheFile?: string,
): Promise<string[]> {
  const client = await getClient(credentialsFile);
  mkdirSync(stagingDir, { recursive: true });

  const cache = cacheFile ? downloadCache.load(cacheFile) : null;

  const session = await createSession(client);
  logger.info('Opening Google Photos Picker in your browser…');
  await open(session.pickerUri);

  await waitForSelection(client, session);

  logger.info('Fetching selected media items…');
  const items: Record<string, unknown>[] = [];
  for await (const item of listSessionItems(client, session.id)) items.push(item);
  logger.info(`${items.length} item(s) selected.`);

  const downloaded: string[] = [];
  let cacheHits = 0;
  const bar = new SingleBar(
    { format: 'Downloading [{bar}] {value}/{total} img' },
    Presets.shades_classic,
  );
  bar.start(items.length, 0);

  for (const item of items) {
    const itemId = item['id'] as string;
    const mediaFile = item['mediaFile'] as Record<string, unknown> | undefined;
    const filename = (mediaFile?.['filename'] as string | undefined) || `${itemId}.jpg`;
    const dest = path.join(stagingDir, filename);
    bar.increment();

    if (cache && downloadCache.has(cache, itemId)) {
      logger.info(`  Skip (cached): ${filename}`);
      cacheHits++;
      continue;
    }

    if (skipExisting && existsSync(dest)) {
      logger.info(`  Skip (exists): ${filename}`);
      downloaded.push(dest);
      continue;
    }

    const baseUrl = mediaFile?.['baseUrl'] as string | undefined;
    if (!baseUrl) {
      logger.warn(`  No baseUrl for ${filename} — skipping`);
      continue;
    }
    const err = await downloadWithRetry(client, baseUrl + '=d', dest);
    if (!err) {
      downloaded.push(dest);
      if (cache) downloadCache.add(cache, itemId, filename);
    } else {
      logger.warn(`  Failed to download ${filename}: ${err}`);
    }
  }

  bar.stop();

  if (cache && cacheFile) {
    downloadCache.save(cacheFile, cache);
    if (cacheHits) logger.info(`  ${cacheHits} item(s) skipped (already downloaded).`);
  }

  await deleteSession(client, session.id);
  return downloaded;
}
