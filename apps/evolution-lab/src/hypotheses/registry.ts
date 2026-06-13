import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export type HypothesisStatus = 'open' | 'fixed' | 'wontfix';

export type HypothesisRecord = {
  id: string;
  fingerprint: string;
  title: string;
  status: HypothesisStatus;
  owner: string;
  theme: string;
  priority: 'P0' | 'P1' | 'P2';
  notes: string;
  anchorFindingId?: string;
  anchorScenarioId?: string;
  createdAt: string;
  updatedAt: string;
};

export function hypothesesPath(reportsDir?: string): string {
  if (reportsDir) {
    return join(resolve(process.cwd(), reportsDir), 'hypotheses.jsonl');
  }
  return join(resolve(process.cwd(), 'reports/evolution'), 'hypotheses.jsonl');
}

function parseLine(line: string): HypothesisRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed) as HypothesisRecord;
}

export function readHypotheses(filePath?: string): HypothesisRecord[] {
  const path = filePath ?? hypothesesPath();
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map(parseLine)
    .filter((h): h is HypothesisRecord => h !== null);
}

function writeHypotheses(records: HypothesisRecord[], filePath?: string): void {
  const path = filePath ?? hypothesesPath();
  mkdirSync(dirname(path), { recursive: true });
  const body = records.map((r) => JSON.stringify(r)).join('\n');
  writeFileSync(path, body ? `${body}\n` : '', 'utf8');
}

export function findHypothesisByFingerprint(
  fingerprint: string,
  filePath?: string,
): HypothesisRecord | undefined {
  const fp = fingerprint.trim().toLowerCase();
  return readHypotheses(filePath).find(
    (h) =>
      h.fingerprint.toLowerCase() === fp ||
      h.fingerprint.toLowerCase().startsWith(fp) ||
      fp.startsWith(h.fingerprint.toLowerCase()),
  );
}

export function findHypothesisById(id: string, filePath?: string): HypothesisRecord | undefined {
  return readHypotheses(filePath).find((h) => h.id === id);
}

export type AddHypothesisInput = {
  fingerprint: string;
  title: string;
  owner?: string;
  theme?: string;
  priority?: HypothesisRecord['priority'];
  notes?: string;
  anchorFindingId?: string;
  anchorScenarioId?: string;
  id?: string;
};

export function addHypothesis(input: AddHypothesisInput, filePath?: string): HypothesisRecord {
  const path = filePath ?? hypothesesPath();
  const existing = findHypothesisByFingerprint(input.fingerprint, path);
  if (existing) {
    throw new Error(
      `Ya existe hipótesis ${existing.id} para fingerprint ${input.fingerprint.slice(0, 12)}…`,
    );
  }
  const now = new Date().toISOString();
  const record: HypothesisRecord = {
    id: input.id ?? `hyp-${randomUUID().slice(0, 8)}`,
    fingerprint: input.fingerprint.trim().toLowerCase(),
    title: input.title.trim(),
    status: 'open',
    owner: input.owner?.trim() ?? '',
    theme: input.theme?.trim() ?? '',
    priority: input.priority ?? 'P1',
    notes: input.notes?.trim() ?? '',
    ...(input.anchorFindingId ? { anchorFindingId: input.anchorFindingId } : {}),
    ...(input.anchorScenarioId ? { anchorScenarioId: input.anchorScenarioId } : {}),
    createdAt: now,
    updatedAt: now,
  };
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

export function updateHypothesis(
  id: string,
  patch: Partial<
    Pick<
      HypothesisRecord,
      'status' | 'owner' | 'title' | 'notes' | 'anchorFindingId' | 'anchorScenarioId'
    >
  >,
  filePath?: string,
): HypothesisRecord {
  const path = filePath ?? hypothesesPath();
  const records = readHypotheses(path);
  const idx = records.findIndex((h) => h.id === id);
  if (idx < 0) throw new Error(`Hipótesis no encontrada: ${id}`);
  const current = records[idx]!;
  const updated: HypothesisRecord = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  records[idx] = updated;
  writeHypotheses(records, path);
  return updated;
}

export function hypothesisAllowsPromote(
  hypothesis: HypothesisRecord,
): { ok: boolean; reason: string } {
  if (hypothesis.status === 'wontfix') {
    return { ok: false, reason: `hipótesis ${hypothesis.id} está wontfix` };
  }
  return { ok: true, reason: `hipótesis ${hypothesis.id} (${hypothesis.status})` };
}
