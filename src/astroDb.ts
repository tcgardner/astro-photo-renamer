export interface RegisterImagePayload {
  catalog_id:        string;
  filename:          string;
  original_filename: string;
  file_path:         string;
  id_stage:          string;
  processed_at:      string;
  captured_at?:      string;
  common_name?:      string;
  run_log_run_at?:   string;
}

export async function registerImage(
  baseUrl: string,
  payload: RegisterImagePayload,
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  // 409 = already registered — treat as success
  if (!res.ok && res.status !== 409) {
    throw new Error(`astro-db POST /api/images returned ${res.status}`);
  }
}
