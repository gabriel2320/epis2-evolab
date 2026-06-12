import { execFile } from 'node:child_process';
import { totalmem, freemem, loadavg } from 'node:os';
import { promisify } from 'node:util';
import type { F5ProcessSample, F5ResourceSnapshot } from './f5-resources.js';

const execFileAsync = promisify(execFile);

function mb(bytes: number): number {
  return bytes / (1024 * 1024);
}

function isEvolabProcess(cmd: string): boolean {
  const c = cmd.toLowerCase();
  return (
    c.includes('evolab') ||
    c.includes('evolution-lab') ||
    c.includes('f5-extended-watchdog') ||
    c.includes('evolab:evolve')
  );
}

async function sampleWindowsProcesses(): Promise<F5ProcessSample[]> {
  const ps = `
    Get-CimInstance Win32_Process |
      Where-Object { $_.Name -match '^(node|ollama)(\\.exe)?$' } |
      Select-Object ProcessId, Name, WorkingSetSize, CommandLine |
      ConvertTo-Json -Compress
  `;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-Command', ps],
      { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const trimmed = stdout.trim();
    if (!trimmed) return [];
    const parsed = JSON.parse(trimmed) as
      | { ProcessId: number; Name: string; WorkingSetSize: number; CommandLine?: string }
      | Array<{ ProcessId: number; Name: string; WorkingSetSize: number; CommandLine?: string }>;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const out: F5ProcessSample[] = [];
    for (const row of rows) {
      const name = String(row.Name ?? '');
      const cmd = String(row.CommandLine ?? '');
      const isOllama = /ollama/i.test(name);
      const isEvolab = isOllama ? false : isEvolabProcess(cmd);
      if (!isOllama && !isEvolab) continue;
      out.push({
        name,
        pid: Number(row.ProcessId),
        rssMb: mb(Number(row.WorkingSetSize) || 0),
        tag: isOllama ? 'ollama' : 'evolab',
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function sampleUnixProcesses(): Promise<F5ProcessSample[]> {
  try {
    const { stdout } = await execFileAsync('ps', ['-eo', 'pid,rss,comm,args'], {
      timeout: 10_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const out: F5ProcessSample[] = [];
    for (const line of stdout.split('\n').slice(1)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
      if (!match) continue;
      const [, pidStr, rssKb, comm, args] = match;
      const commName = comm ?? '';
      const argLine = args ?? '';
      const isOllama = /ollama/i.test(commName) || /ollama/i.test(argLine);
      const isEvolab = isOllama ? false : isEvolabProcess(argLine);
      if (!isOllama && !isEvolab) continue;
      out.push({
        name: commName,
        pid: Number(pidStr),
        rssMb: mb(Number(rssKb) * 1024),
        tag: isOllama ? 'ollama' : 'evolab',
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function sampleGpu(): Promise<F5ResourceSnapshot['gpu'] | undefined> {
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      [
        '--query-gpu=utilization.gpu,memory.used,memory.total',
        '--format=csv,noheader,nounits',
      ],
      { timeout: 8000 },
    );
    const line = stdout.trim().split('\n')[0];
    if (!line) return undefined;
    const [utilStr, usedStr, totalStr] = line.split(',').map((s) => s.trim());
    const usedMemMb = Number.parseFloat(usedStr ?? '');
    const totalMemMb = Number.parseFloat(totalStr ?? '');
    if (!Number.isFinite(usedMemMb) || !Number.isFinite(totalMemMb) || totalMemMb <= 0) {
      return undefined;
    }
    return {
      usedMemMb,
      totalMemMb,
      usedPercent: (usedMemMb / totalMemMb) * 100,
      ...(Number.isFinite(Number(utilStr)) ? { utilPercent: Number(utilStr) } : {}),
    };
  } catch {
    return undefined;
  }
}

async function sampleOllama(ollamaUrl: string): Promise<F5ResourceSnapshot['ollama']> {
  try {
    const res = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/ps`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { up: false, modelCount: 0, loadedModels: [] };
    const body = (await res.json()) as {
      models?: Array<{ name: string; size: number; size_vram?: number }>;
    };
    const models = (body.models ?? []).map((m) => ({
      name: m.name,
      sizeMb: mb(m.size ?? 0),
    }));
    return { up: true, modelCount: models.length, loadedModels: models };
  } catch {
    return { up: false, modelCount: 0, loadedModels: [] };
  }
}

/** Muestrea RAM/CPU/GPU solo para procesos evolab + ollama (modelos locales). */
export async function sampleF5Resources(opts: {
  ollamaUrl?: string;
} = {}): Promise<F5ResourceSnapshot> {
  const ollamaUrl = opts.ollamaUrl ?? process.env.EPIS2_EVOLAB_OLLAMA_URL ?? 'http://127.0.0.1:11434';
  const total = totalmem();
  const free = freemem();
  const usedPercent = total > 0 ? ((total - free) / total) * 100 : 0;
  const loads = loadavg();

  const processes =
    process.platform === 'win32'
      ? await sampleWindowsProcesses()
      : await sampleUnixProcesses();

  const evolabRssMb = processes.filter((p) => p.tag === 'evolab').reduce((s, p) => s + p.rssMb, 0);
  const ollamaRssMb = processes.filter((p) => p.tag === 'ollama').reduce((s, p) => s + p.rssMb, 0);

  const [gpu, ollama] = await Promise.all([sampleGpu(), sampleOllama(ollamaUrl)]);

  const snapshot: F5ResourceSnapshot = {
    ts: new Date().toISOString(),
    system: {
      totalMemMb: mb(total),
      freeMemMb: mb(free),
      usedPercent,
      ...(loads[0] != null ? { loadAvg1: loads[0] } : {}),
    },
    processes,
    evolabRssMb,
    ollamaRssMb,
    ollama,
  };
  if (gpu) snapshot.gpu = gpu;
  return snapshot;
}
