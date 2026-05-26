import { readFileSync } from 'fs';

export interface UploadPayload {
  catalog_id:        string;
  filename:          string;
  original_filename: string;
  id_stage:          string;
  processed_at:      string;
  captured_at?:      string;
  common_name?:      string;
  run_log_run_at?:   string;
}

export interface UploadResult {
  id:       number;
  filename: string;
  file_url: string;
}

export async function uploadImage(
  baseUrl: string,
  filePath: string,
  payload: UploadPayload,
): Promise<UploadResult> {
  const bytes = readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([bytes]), payload.filename);
  for (const [k, v] of Object.entries(payload)) {
    if (v != null) form.append(k, String(v));
  }
  const res = await fetch(`${baseUrl}/api/images/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`astro-db upload returned ${res.status}`);
  return res.json() as Promise<UploadResult>;
}

// Returns existing filenames for a catalog_id so the seen-map can be pre-populated.
export async function getExistingFilenames(
  baseUrl: string,
  catalogId: string,
): Promise<string[]> {
  const res = await fetch(`${baseUrl}/api/images/${encodeURIComponent(catalogId)}`);
  if (!res.ok) return [];
  const rows = await res.json() as Array<{ filename: string }>;
  return rows.map(r => r.filename);
}
