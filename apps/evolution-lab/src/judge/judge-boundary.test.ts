import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const JUDGE_DIR = join(fileURLToPath(new URL('.', import.meta.url)));

describe('judge boundary G1', () => {
  it('src/judge/* no importa reviewFinding ni escribe review_status', () => {
    const files = readdirSync(JUDGE_DIR).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    );
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(join(JUDGE_DIR, file), 'utf8');
      if (/reviewFinding/.test(content)) {
        violations.push(`${file}: importa o referencia reviewFinding`);
      }
      if (/review_status\s*=/.test(content) || /SET\s+review_status/i.test(content)) {
        violations.push(`${file}: posible escritura review_status`);
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});
