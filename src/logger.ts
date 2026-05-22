import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';

interface LogEntry {
  ts: string;
  source: string;
  stage: string;
  identifier: string | null;
  common_name: string | null;
  dest: string | null;
  success: boolean;
  notes: string;
}

export class RunLogger {
  private entries: LogEntry[] = [];
  private startTime = performance.now();

  constructor(private outputDir: string) {}

  record(opts: {
    sourceFile: string;
    stage: string;
    identifier: string | null;
    commonName: string | null;
    destFile: string | null;
    success: boolean;
    notes?: string;
  }): void {
    this.entries.push({
      ts: new Date().toISOString(),
      source: opts.sourceFile,
      stage: opts.stage,
      identifier: opts.identifier,
      common_name: opts.commonName,
      dest: opts.destFile,
      success: opts.success,
      notes: opts.notes ?? '',
    });
  }

  flush(): string {
    const elapsed = (performance.now() - this.startTime) / 1000;
    const log = {
      run_at: new Date().toISOString(),
      elapsed_seconds: Math.round(elapsed * 10) / 10,
      total: this.entries.length,
      resolved: this.entries.filter(e => e.success).length,
      unresolved: this.entries.filter(e => !e.success).length,
      images: this.entries,
    };
    const dest = join(this.outputDir, 'run_log.json');
    mkdirSync(this.outputDir, { recursive: true });
    writeFileSync(dest, JSON.stringify(log, null, 2), 'utf8');
    return dest;
  }
}

function _print(level: string, msg: string, toStderr = false): void {
  const ts = new Date().toTimeString().slice(0, 8);
  const line = `[${ts}] ${level} ${msg}\n`;
  if (toStderr) process.stderr.write(line);
  else process.stdout.write(line);
}

export function info(msg: string): void { _print('INFO ', msg); }
export function warn(msg: string): void { _print('WARN ', msg, true); }
export function error(msg: string): void { _print('ERROR', msg, true); }
export function success(msg: string): void { _print('OK   ', msg); }
