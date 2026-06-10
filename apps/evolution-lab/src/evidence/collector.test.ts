import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EvidenceCollector } from './collector.js';
import type { EvolutionRun, ScenarioDefinition } from '../contracts/schemas.js';

const run: EvolutionRun = {
  id: '00000000-0000-4000-8000-000000000042',
  scenarioId: 'test-scenario',
  scenarioVersion: 1,
  targetEnvironmentId: 'epis2-local-sandbox',
  personaId: 'physician-default',
  status: 'seeding',
  randomSeed: 'seed-1',
};

const scenario = {
  id: 'test-scenario',
  version: 1,
  name: 'Test',
  risk: 'low',
  target: { capabilities: [] },
  persona: { role: 'physician' },
  goal: { action: 'test' },
  steps: [],
  expected: {},
  evaluators: [],
} as unknown as ScenarioDefinition;

let tempDir: string;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

describe('EvidenceCollector evidence mode', () => {
  it('full: crea subdirectorios y escribe capturas api/model/logs', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'evolab-full-'));
    const collector = new EvidenceCollector(tempDir, 'full');
    const bundle = collector.prepare(run, scenario);

    expect(existsSync(join(bundle.runDir, 'api'))).toBe(true);
    expect(existsSync(join(bundle.runDir, 'model'))).toBe(true);
    expect(existsSync(join(bundle.runDir, 'logs'))).toBe(true);
    expect(existsSync(join(bundle.runDir, 'screenshots'))).toBe(true);

    const apiPath = collector.writeApiCapture(bundle, 'login', { status: 200 });
    expect(existsSync(apiPath)).toBe(true);
    collector.writeLog(bundle, 'run', ['a=1']);
    expect(existsSync(join(bundle.runDir, 'logs', 'run.log'))).toBe(true);

    collector.finalize(bundle, run, [], 'completed');
    expect(existsSync(bundle.resultPath)).toBe(true);
  });

  it('minimal: solo metadata/result/evaluation — sin api/, model/, logs/', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'evolab-min-'));
    const collector = new EvidenceCollector(tempDir, 'minimal');
    const bundle = collector.prepare(run, scenario);

    const apiPath = collector.writeApiCapture(bundle, 'login', { status: 200 });
    expect(apiPath).toBe('minimal://api/login');
    const modelPath = collector.writeModelCapture(bundle, 'plan', { steps: [] });
    expect(modelPath).toBe('minimal://model/plan');
    collector.writeLog(bundle, 'run', ['a=1']);

    collector.attachObservation(bundle, { kind: 'api_response', label: 'x', payload: {} });
    collector.finalize(bundle, run, [], 'completed');

    const entries = readdirSync(bundle.runDir).sort();
    expect(entries).toEqual(['evaluation.json', 'metadata.json', 'result.json']);
  });

  it('minimal reduce archivos por run en ≥70% frente a full', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'evolab-cmp-'));

    const countFiles = (dir: string): number =>
      readdirSync(dir, { withFileTypes: true }).reduce(
        (acc, e) => acc + (e.isDirectory() ? countFiles(join(dir, e.name)) : 1),
        0,
      );

    const simulate = (mode: 'full' | 'minimal', runId: string): number => {
      const collector = new EvidenceCollector(tempDir, mode);
      const bundle = collector.prepare({ ...run, id: runId }, scenario);
      for (let i = 0; i < 8; i += 1) {
        collector.writeApiCapture(bundle, `capture-${i}`, { status: 200, body: { i } });
      }
      collector.writeModelCapture(bundle, 'plan', { steps: [] });
      collector.writeLog(bundle, 'run', ['line']);
      collector.finalize(bundle, { ...run, id: runId }, [], 'completed');
      return countFiles(bundle.runDir);
    };

    const fullCount = simulate('full', '00000000-0000-4000-8000-0000000000f1');
    const minimalCount = simulate('minimal', '00000000-0000-4000-8000-0000000000f2');
    expect(minimalCount).toBeLessThanOrEqual(fullCount * 0.3);
  });
});
