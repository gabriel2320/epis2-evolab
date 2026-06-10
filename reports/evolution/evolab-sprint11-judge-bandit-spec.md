# EPIS2 Evolab — Sprint 11: Judge local + bandit UCB de modelos (spec)

**Fecha:** 2026-06-10  
**Alcance:** especificación previa a implementación del judge de triage (S11.1), golden set etiquetado (S11.2) y bandit UCB de modelos Ollama (S11.3).  
**Lectura base (solo lectura):** `docs/evolution/EVOLAB_ROADMAP.md` §Sprint 11 · `src/findings/{creator,fingerprint}.ts` · `src/orchestrator/evaluate-run.ts` · `src/persistence/repository.ts` · `database/evolution/migrations/002_schema.sql` · `reports/evolution/evolab-review-dossier-2026-06-10.md` · `reports/evolution/evolab-sprint8-mutation-spec.md` · `reports/evolution/evolab-sprint8-gate.md` · telemetría `reports/evolution/mutation/mutate-2026-06-10T15-54-54-098Z.json`.  
**Tesis:** el judge **ordena** la cola de revisión humana; **nunca cierra ni aprueba** findings. El bandit elige qué modelo Ollama usar por tarea (mutación amplitud / reparación / triage / autoría futura), aprendiendo de recompensas medibles sin paralelismo en VRAM.

---

## Resumen ejecutivo

| Decisión | Recomendación |
|---|---|
| **Modelo judge** | **`qwen3:8b`** (`think: false`, `/api/chat`, JSON schema) — clasificación/instrucción; no usar coders 7b/14b para triage |
| **Tabla bandit** | `evolution.model_bandit_stats` — PK `(task_type, model_name)`, columnas UCB estándar + warm-start Sprint 8 |
| **Gate S11** | Precisión judge **≥80%** (macro-F1 sobre clases `signal\|noise\|duplicate`) vs golden set de **25 findings** versionado en repo |
| **Guardrail clínico 1** | `requiresHumanReview: true` **siempre** en salida del judge; prohibido escribir `review_status` distinto de `open` vía IA |
| **Guardrail clínico 2** | El judge **no puede** emitir `approved`, `rejected` ni `duplicate` como estado final — solo `judgeVerdict` advisory; cierre exclusivo de `evolab review --decision` humano |

---

## 1. Diseño del judge local

### 1.1 Rol y límites

El judge es un **pre-clasificador advisory** que corre **después** de la fase EVALUATE (`evaluate-run.ts` → `createFindingsFromEvaluations`) y **antes** de que el humano abra la cola. Su única función es reducir tiempo de triage ordenando findings abiertos por prioridad clínica probable.

**Prohibido:**

- Cambiar `review_status` en `evolution.findings` (solo el humano vía `reviewFinding`).
- Auto-aprobar findings de severidad `critical` o `high`.
- Cerrar findings como `rejected` o `duplicate` sin actor humano.
- Derivar fixes a EPIS2 o promover escenarios.

**Permitido (auto-descarte determinista, sin LLM):**

- Marcar **sugerencia** `judge_verdict = duplicate` cuando el **fingerprint es idéntico** a otro finding que ya tiene `review_status IN ('approved', 'rejected', 'duplicate')` **y** el finding actual sigue `open`. Esto es dedup obvio — no requiere inferencia. El finding **permanece `open`** hasta que el humano confirme con `evolab review --decision duplicate`.

### 1.2 Contrato de entrada

Tipo TypeScript propuesto (`JudgeTriageInput`):

```typescript
type JudgeTriageInput = {
  finding: {
    id: string;                    // UUID en DB (vacío en eval offline)
    runId: string;
    scenarioId: string;
    targetEnvironmentId: string;
    category: string;              // clinical_safety | authorization | audit_trail | …
    severity: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;            // confianza del evaluador determinista (0.7–0.95 hoy)
    title: string;
    expectedResult: string;
    actualResult: string;
    fingerprint: string;           // sha256 truncado 16 hex (fingerprint.ts)
    recommendedAction: string;
    affectedComponents: string[];
  };
  scenario: {
    id: string;
    name: string;
    risk: string;
    personaRole: string;
    goalAction: string;
    evaluators: string[];
    tags?: string[];
  };
  evidence: {
    runEvidenceDir?: string;       // reports/evolution/runs/{runId}/
    evaluations: Array<{
      evaluatorId: string;
      passed: boolean;
      severity?: string;
      message: string;
      details?: Record<string, unknown>;
    }>;
    observationsSummary: string;   // ≤2000 chars: observaciones clave del result.json
    apiCaptures?: Array<{          // paths relativos bajo runEvidenceDir/api/
      label: string;
      status?: number;
      excerpt: string;             // primeros 500 chars del JSON de respuesta
    }>;
  };
  fingerprintHistory: Array<{
    findingId: string;
    runId: string;
    scenarioId: string;
    severity: string;
    reviewStatus: string;          // open | approved | rejected | duplicate
    createdAt: string;
    humanDecision?: string;        // de evolution.human_decisions si existe
  }>;                              // todos los findings con mismo fingerprint, ordenados por created_at DESC
};
```

**Construcción de `fingerprintHistory`:** query `SELECT … FROM evolution.findings WHERE fingerprint = $1 ORDER BY created_at DESC LIMIT 10`. Caso real verificado en dossier: fingerprint `e0ff3dbe…` aparece en runs `4d1553d6` y `7f2a0877` — el judge debe ver el primero como contexto al clasificar el segundo.

**Construcción de `evidence`:** reutilizar `getRunFromDb` + lectura de `reports/evolution/runs/{runId}/result.json` y capturas `api/*.json` referenciadas por labels de observaciones (`discharge_approve_attempt`, `discharge_alerts`, etc.). Si el run no tiene evidencia en disco, degradar a `evaluations` + `actualResult` sin fallar.

### 1.3 Contrato de salida (JSON estructurado)

Schema Zod + JSON schema Ollama (`format`):

```typescript
const JudgeTriageOutputSchema = z.object({
  verdict: z.enum(['signal', 'noise', 'duplicate']),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(800),
  requiresHumanReview: z.literal(true),  // invariante — parse falla si false
  suggestedPriority: z.number().int().min(1).max(100).optional(),
  relatedFindingIds: z.array(z.string().uuid()).optional(),
});
```

| Campo | Semántica |
|---|---|
| `verdict: signal` | Hallazgo clínico/regresión probablemente accionable — subir en cola |
| `verdict: noise` | Falso positivo, expected mal calibrado, o evaluador demasiado estricto — bajar en cola |
| `verdict: duplicate` | Misma root cause que finding previo (mismo fingerprint o mensaje equivalente) — agrupar |
| `confidence` | Confianza del judge (independiente de la del evaluador) |
| `rationale` | 2–4 frases citando evaluador + evidencia HTTP/audit |
| `requiresHumanReview` | **Siempre `true`** — campo obligatorio para gate de invariantes |
| `suggestedPriority` | 1 = revisar primero; derivado de `severity` + `verdict` (ver §1.6) |

**Persistencia propuesta** (migración `005_judge_bandit.sql`, columnas nuevas en `evolution.findings`):

```sql
ALTER TABLE evolution.findings ADD COLUMN IF NOT EXISTS judge_verdict TEXT
  CHECK (judge_verdict IS NULL OR judge_verdict IN ('signal', 'noise', 'duplicate'));
ALTER TABLE evolution.findings ADD COLUMN IF NOT EXISTS judge_confidence NUMERIC(4,3);
ALTER TABLE evolution.findings ADD COLUMN IF NOT EXISTS judge_rationale TEXT;
ALTER TABLE evolution.findings ADD COLUMN IF NOT EXISTS judge_model TEXT;
ALTER TABLE evolution.findings ADD COLUMN IF NOT EXISTS judge_prompt_version TEXT;
ALTER TABLE evolution.findings ADD COLUMN IF NOT EXISTS judge_at TIMESTAMPTZ;
ALTER TABLE evolution.findings ADD COLUMN IF NOT EXISTS judge_priority INT;

CREATE INDEX IF NOT EXISTS idx_evolab_findings_judge_queue
  ON evolution.findings (review_status, judge_verdict, severity, judge_priority NULLS LAST);
```

### 1.4 Prompt template

**System prompt (`judge-triage-v1`):**

```text
Eres el judge de triage de EPIS2 Evolab. Clasificas hallazgos de pruebas clínicas sintéticas
en una de tres categorías: signal (señal accionable), noise (ruido/falso positivo), duplicate
(duplicado de un hallazgo ya visto).

REGLAS INVIOLABLES:
1. NUNCA apruebes, rechaces ni cierres un hallazgo. Solo clasificas para ordenar la cola humana.
2. requiresHumanReview debe ser SIEMPRE true en tu respuesta JSON.
3. Un finding de severidad critical casi nunca es noise — solo si la evidencia demuestra
   claramente un expected mal escrito (p. ej. el escenario esperaba bloqueo pero el producto
   corrigió el bug).
4. Si fingerprintHistory muestra el mismo fingerprint con review_status approved/rejected/duplicate,
   clasifica duplicate salvo que actualResult difiera sustancialmente.
5. Findings del mismo escenario y run que describen el mismo bug desde evaluadores distintos
   (clinical_safety + cdr_consistency + audit_completeness) son signal independientes pero
   relatedFindingIds debe listarlos — NO marques duplicate entre evaluadores complementarios
   del mismo incidente a menos que el humano ya cerró uno como canonical.
6. Solo datos sintéticos demo — no infieras PHI ni recomiendes tratamiento clínico real.

CONTEXTO EPIS2 (resumen):
- discharge-critical-pending-001: alta aprobada con PCR crítico sin acuse es bug real confirmado.
- RBAC: nurse no puede draft.approve (403 esperado).
- audit_completeness: eventos prohibidos (p. ej. clinical.draft.approved cuando debió bloquearse).
```

**User prompt (plantilla):**

```text
Clasifica este finding de Evolab.

## Finding
- ID: {{finding.id}}
- Escenario: {{scenario.id}} ({{scenario.name}}, riesgo {{scenario.risk}})
- Evaluador implícito: {{finding.title}}
- Categoría: {{finding.category}} | Severidad: {{finding.severity}} | Conf evaluador: {{finding.confidence}}
- Expected: {{finding.expectedResult}}
- Actual: {{finding.actualResult}}
- Fingerprint: {{finding.fingerprint}}
- Componentes: {{finding.affectedComponents.join(', ')}}

## Evaluaciones del run
{{#each evidence.evaluations}}
- [{{evaluatorId}}] passed={{passed}} severity={{severity}} — {{message}}
{{/each}}

## Evidencia HTTP/observaciones
{{evidence.observationsSummary}}
{{#each evidence.apiCaptures}}
- {{label}} HTTP {{status}}: {{excerpt}}
{{/each}}

## Historial mismo fingerprint ({{fingerprintHistory.length}} previos)
{{#each fingerprintHistory}}
- {{findingId}} run={{runId}} status={{reviewStatus}} severity={{severity}} — {{createdAt}}
{{/each}}

Responde SOLO JSON con: verdict, confidence, rationale, requiresHumanReview (true), suggestedPriority, relatedFindingIds.
```

**Parámetros Ollama:**

| Parámetro | Valor | Nota |
|---|---|---|
| Modelo | `qwen3:8b` | Clasificación/instrucción; Sprint 8 descartó qwen3 para mutación pero lo reserva para tareas no-code |
| Endpoint | `/api/chat` | Mismo patrón que `mutation/ollama-mutator.ts` |
| `think` | `false` | Obligatorio en qwen3 |
| `temperature` | `0.1` | Baja variabilidad en triage |
| `num_ctx` | `8192` | Suficiente para finding + evidencia truncada |
| `format` | JSON schema del output | Validación post-parse con Zod |

### 1.5 Modelo recomendado vs alternativas

| Modelo | Veredicto | Justificación |
|---|---|---|
| **`qwen3:8b`** | **Elegido** | Roadmap S11; buen seguidor de instrucciones JSON; no compite con coders en mutación; ~8 s/inferencia aceptable para cola de ≤50 findings |
| `qwen2.5-coder:7b` | Reserva | Sesgado a código; peor en rationale clínico; usar solo si qwen3 no está instalado (`evolab doctor --models`) |
| `qwen2.5-coder:14b` | Descartado | Lento (~13 s) sin ventaja en clasificación; reservado a `mutate_repair` |
| `llama3.2` | Descartado | Sin benchmark de triage; peor adherencia JSON en experiencia Sprint 8 |
| `deepseek-coder-v2:16b` | Descartado | Política Evolab: no usar |

### 1.6 Umbrales de auto-descarte y priorización

**Auto-descarte determinista (sin LLM):**

```text
SI fingerprint idéntico a finding F_prev
   Y F_prev.review_status IN ('approved', 'rejected', 'duplicate')
   Y finding.review_status = 'open'
ENTONCES
   prefill judge_verdict = 'duplicate'
   judge_rationale = 'Dedup determinista: fingerprint coincide con {F_prev.id} ({F_prev.review_status})'
   judge_model = 'deterministic'
   NO cambiar review_status
```

**Nunca auto-descartar** por: similitud semántica, mismo escenario, mismo run con evaluadores distintos, o `verdict: noise` del LLM.

**Fórmula de `suggestedPriority` (determinista post-LLM):**

```text
base = { critical: 10, high: 30, medium: 50, low: 70 }[severity]
verdict_delta = { signal: -20, duplicate: +15, noise: +40 }[verdict]
priority = clamp(base + verdict_delta - round(confidence * 10), 1, 100)
```

Ejemplo dossier: 4 findings `discharge-critical-pending-001` → todos `signal`, priority ~0–15 (revisar primero). El duplicado cross-run del mismo fingerprint → `duplicate`, priority ~25 pero agrupado bajo el canonical.

---

## 2. Integración con `evolab review`

### 2.1 Flujo propuesto

```text
Run sandbox → EVALUATE → createFindingsFromEvaluations → PERSIST (findings open)
   │
   ▼
[Judge batch]  ← evolab review --judge  OR  hook post-persist opcional
   │
   ├─ dedup determinista por fingerprint (§1.6)
   ├─ LLM qwen3:8b por finding open sin judge_at reciente
   └─ UPDATE evolution.findings SET judge_* (review_status permanece 'open')
   │
   ▼
Cola humana priorizada:
   ORDER BY
     CASE judge_verdict WHEN 'signal' THEN 0 WHEN 'duplicate' THEN 1 ELSE 2 END,
     judge_priority ASC NULLS LAST,
     severity DESC,
     created_at ASC
   │
   ▼
Humano: evolab review --finding <uuid> --decision approved|rejected|duplicate [--comment]
   └─ única vía que escribe review_status + evolution.human_decisions
```

### 2.2 Comandos CLI

| Comando | Comportamiento |
|---|---|
| `evolab review --judge` | Clasifica todos los findings `review_status=open` sin `judge_at` (o `--refresh` para re-juzgar) |
| `evolab review --judge --finding <uuid>` | Un solo finding |
| `evolab review --judge --dry-run` | Imprime JSON sin persistir |
| `evolab review --judge --json` | Salida machine-readable para CI gate |
| `evolab findings --status open` | **Sin cambio** — lista findings; añadir columnas judge en output |
| `evolab review --finding <uuid> --decision …` | **Sin cambio** — decisión humana obligatoria para cierre |

**Flag `--refresh`:** re-ejecuta judge solo si `judge_prompt_version` < actual o `--force`.

### 2.3 Vista humana (cola priorizada)

Salida propuesta de `evolab review --judge` (modo list, tras clasificar):

```text
EPIS2 Evolab — cola de revisión (judge pre-clasificado)

  [SIGNAL]  P=5   ceac9c2a…  critical  discharge-critical-pending-001  clinical_safety
            Alta aprobada con crítico sin acuse — regla clínica no aplicada
            judge: 0.92 — Bug real: approve 200 con PCR pendiente; ver discharge_approve_attempt

  [SIGNAL]  P=8   3ad7cd9e…  high      discharge-critical-pending-001  authorization
            …

  [DUPLICATE] P=28  9ee6d8dd…  critical  discharge-critical-pending-001
            Mismo fingerprint e0ff3dbe… que run 7f2a0877 (open) — agrupar con ceac9c2a…

  [NOISE]   P=85  c8a26389…  high      llm-command-evolution-001  regression
            plan_fidelity: escenario LLM experimental sin plan registrado — expected dudoso

Total open: 13 | signal: 6 | duplicate: 2 | noise: 5 | sin judge: 0
⚠ Todos requieren revisión humana. El judge solo ordena — no cierra.
```

### 2.4 Punto de enganche en código (referencia para implementador)

- **Nuevo módulo:** `src/judge/triage-judge.ts` — puro, testeable sin Ollama (mock).
- **CLI:** extender `runReviewFinding` / nuevo `runJudgeTriage` en `cli/commands.ts`.
- **No tocar** `reviewFinding()` — la firma y semántica humana permanecen.
- **Opcional post-persist:** flag de config `judgeOnPersist: false` por defecto (evitar latencia en CI smoke).

---

## 3. Bandit UCB de modelos

### 3.1 Tipos de tarea (brazos = modelos Ollama)

| `task_type` | Descripción | Modelos candidatos (brazos) | Fuente de recompensa |
|---|---|---|---|
| `mutate_amplitude` | Generación K variantes (role_swap, step_injection) | `qwen2.5-coder:7b`, `qwen3:8b` | `validFinal / generated` por operador |
| `mutate_repair` | Reparación post-Zod/semántica | `qwen2.5-coder:14b`, `deepseek-coder-v2:16b`* | `repaired_success / repair_attempts` |
| `mutate_depth` | Operadores estructurales (payload_perturbation, crossover) | `qwen2.5-coder:14b`, `qwen2.5-coder:7b` | `validFinal / generated` |
| `judge_triage` | Clasificación findings | `qwen3:8b`, `qwen2.5-coder:7b`, `llama3.2` | Precisión vs golden / acierto binario |
| `scenario_authoring` | **Futuro S12** — borradores custom step/evaluador | `qwen2.5-coder:14b`, `qwen3:8b` | Validez Zod + dry-run |

\* `deepseek-coder-v2:16b` permanece como brazo con prior bajo; el bandit debería converger a 14b solo.

### 3.2 Esquema Postgres

```sql
CREATE TABLE IF NOT EXISTS evolution.model_bandit_stats (
  task_type TEXT NOT NULL CHECK (task_type IN (
    'mutate_amplitude', 'mutate_repair', 'mutate_depth',
    'judge_triage', 'scenario_authoring'
  )),
  model_name TEXT NOT NULL,
  pulls INT NOT NULL DEFAULT 0,
  total_reward NUMERIC(12, 6) NOT NULL DEFAULT 0,
  last_reward NUMERIC(6, 4),
  last_selected_at TIMESTAMPTZ,
  warm_start_source TEXT,          -- p. ej. 'sprint8-gate', 'judge-golden-v1'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_type, model_name)
);

CREATE INDEX IF NOT EXISTS idx_bandit_task_pulls
  ON evolution.model_bandit_stats (task_type, pulls);

-- Log append-only para auditoría y recomputo
CREATE TABLE IF NOT EXISTS evolution.model_bandit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL,
  model_name TEXT NOT NULL,
  reward NUMERIC(6, 4) NOT NULL CHECK (reward >= 0 AND reward <= 1),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,  -- operator, findingId, promptVersion, …
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.3 Algoritmo UCB1

```text
mean_reward(a) = total_reward(a) / max(pulls(a), 1)
ucb(a) = mean_reward(a) + c * sqrt( ln(sum_pulls_task) / pulls(a) )
elegir argmax ucb(a)  ;  c = 1.414 (√2) por defecto, configurable
```

- **Cold start:** brazos con `pulls = 0` reciben `ucb = +∞` (explorar primero cada brazo al menos una vez).
- **Warm-start:** inicializar `pulls` y `total_reward` desde telemetría Sprint 8 (§3.4) para no repetir exploración costosa.
- **Actualización:** tras cada inferencia, `pulls += 1`, `total_reward += reward`, insert en `model_bandit_events`.
- **Selección:** `selectModel(task_type)` llamado desde `mutation/pipeline.ts` (amplitud/reparación) y `judge/triage-judge.ts`.

### 3.4 Warm-start desde telemetría Sprint 8

Fuente: `reports/evolution/mutation/mutate-2026-06-10T15-54-54-098Z.json` + gate md.

| task_type | model_name | pulls | total_reward | mean | Origen |
|---|---|---|---|---|---|
| `mutate_amplitude` | `qwen2.5-coder:7b` | 25 | 22.5 | 0.90 | role_swap 13/13 + step_injection 9/12 válidos con 7b |
| `mutate_amplitude` | `qwen3:8b` | 1 | 0.5 | 0.50 | prior débil — no usado en gate real |
| `mutate_depth` | `qwen2.5-coder:14b` | 25 | 23.0 | 0.92 | payload 12/13 + crossover 12/12 |
| `mutate_depth` | `qwen2.5-coder:7b` | 1 | 0.3 | 0.30 | prior — no usado en depth |
| `mutate_repair` | `qwen2.5-coder:14b` | 1 | 1.0 | 1.00 | 1/1 reparación exitosa en gate |
| `mutate_repair` | `deepseek-coder-v2:16b` | 1 | 0.0 | 0.00 | benchmark 0/3 reparaciones |
| `judge_triage` | `qwen3:8b` | 1 | 0.5 | 0.50 | prior uniforme hasta gate S11 |

Script de seed: `npm run evolab:bandit:seed -- --from reports/evolution/mutation/mutate-2026-06-10T15-54-54-098Z.json` (idempotente, marca `warm_start_source`).

### 3.5 CLI `evolab models --bandit`

Extender `runModels()` existente:

```text
EPIS2 Evolab — bandit UCB

Task                 Model                    Pulls  Mean    Last UCB
mutate_amplitude     qwen2.5-coder:7b         25     0.900   0.932  ← selected
mutate_amplitude     qwen3:8b                  1     0.500   1.832
mutate_repair        qwen2.5-coder:14b         1     1.000   1.414  ← selected
mutate_depth         qwen2.5-coder:14b        25     0.920   0.928  ← selected
judge_triage         qwen3:8b                  1     0.500   1.832  ← selected (prior)
```

---

## 4. Gate Sprint 11

### 4.1 Criterio

**Precisión del judge ≥ 80%** sobre golden set etiquetado, medida como:

```text
accuracy = correct / N
correct = (predicted_verdict === golden_verdict) por finding
```

**Métrica secundaria (informe, no bloqueante):** macro-F1 por clase; confusion matrix `signal|noise|duplicate`.

**Umbral mínimo por clase (warning, no fail):** recall `signal` ≥ 0.85 — no perder bugs reales en cola.

### 4.2 Construcción del golden set (25 findings)

Archivo versionado: `apps/evolution-lab/fixtures/judge-golden-v1.json`

| Bucket | N | Fuente | golden_verdict |
|---|---|---|---|
| Bug clínico confirmado (discharge-critical) | 4 | runs `4d1553d6` — 4 evaluadores | `signal` |
| Duplicado cross-run mismo fingerprint | 2 | run `7f2a0877` vs `4d1553d6`, fingerprint `e0ff3dbe…` | `duplicate` |
| RBAC esperado (nurse approve bloqueado) | 3 | `role-nurse-approve-001` runs | `signal` |
| RBAC trivial / ya conocido | 2 | runs verdes que generaron finding por expected viejo | `noise` |
| Censo / journey | 2 | `admission-discharge-001` findings | `signal` o `noise` según evidencia |
| MAR seguridad | 2 | `suspended-medication-mar-001` | `signal` |
| Mutación Sprint 8 — expected incoherente | 4 | dossier §2.3 sospechosos (m8pp-010, m8cx-044, …) | `noise` |
| Regresión plan/command LLM | 2 | `llm-command-evolution-001` (findings.json) | `noise` |
| Audit trail complementario mismo incidente | 2 | audit_completeness del discharge-critical | `signal` (no duplicate entre evaluadores) |
| Falso positivo dom_state | 2 | escenarios UI sin sandbox completo | `noise` |

**Total: 25.** Expandible a 30 añadiendo 5 findings de Sprint 9 (candidatos mutados con resultado sandbox).

Cada entrada:

```json
{
  "id": "golden-001",
  "sourceRunId": "4d1553d6-9eab-4458-9c62-825d683049e8",
  "findingSnapshot": { "...": "copia de evolution.findings o findings.json" },
  "goldenVerdict": "signal",
  "goldenRationale": "Bug real EPIS2: approve 200 con PCR sin acuse",
  "labeledBy": "human-reviewer",
  "labeledAt": "2026-06-10"
}
```

### 4.3 Script de evaluación offline

```bash
npm run evolab:judge:eval -- --golden fixtures/judge-golden-v1.json [--model qwen3:8b] [--json]
```

**Comportamiento:**

1. Carga golden set (sin DB obligatoria).
2. Enriquece cada entrada con evidencia desde `reports/evolution/runs/{runId}/` si existe.
3. Ejecuta judge (Ollama live) o `--mock` para CI sin GPU.
4. Compara `verdict` vs `goldenVerdict`.
5. Exit code 0 si `accuracy >= 0.80` y todos los outputs tienen `requiresHumanReview: true`.
6. Escribe `reports/evolution/evolab-sprint11-judge-gate.md` con confusion matrix.

**CI:** job `evolab:judge:eval --mock` con respuestas grabadas (`fixtures/judge-golden-v1-expected.json`) para regresión de prompt; job nightly opcional con Ollama live.

---

## 5. Plan de implementación

| ID | Tarea | Entregable | Depende | Est. relativa |
|---|---|---|---|---|
| **T1** | Migración `005_judge_bandit.sql` + tipos Zod judge/bandit | Schema DB + `JudgeTriageOutputSchema` | — | **S** |
| **T2** | Módulo `judge/triage-judge.ts` + dedup determinista + tests unitarios (mock LLM) | Clasificador puro, ≥90% cobertura ramas dedup | T1 | **M** |
| **T3** | Golden set `judge-golden-v1.json` (25 entradas) + script `evolab:judge:eval` | Gate reproducible | T2 | **M** |
| **T4** | CLI `evolab review --judge` + extensión listado findings con columnas judge | UX cola priorizada | T2 | **S** |
| **T5** | Bandit: `model_bandit_stats`, seed Sprint 8, integración en `mutation/pipeline.ts` + `evolab models --bandit` | Selección automática de modelo | T1, mutación existente | **L** |

**Orden recomendado:** T1 → T2 → T3 (gate temprano) → T4 → T5.

### 5.1 Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Judge “aprueba” findings** — LLM emite lenguaje de cierre o `requiresHumanReview: false` | Violación invariante EPIS2 | Zod `z.literal(true)`; test de contrato; judge **nunca** llama `reviewFinding`; code review gate |
| **Colapso a `noise` en critical** — judge descarta bugs reales | Bug clínico no revisado a tiempo | Regla prompt §1.4; recall signal ≥85% en gate; severidad critical nunca auto-ordenada después de noise |
| **Deriva de prompt** | Caída de precisión | `judge_prompt_version`; `evolab:judge:eval` en CI; golden set versionado |
| **Costo latency** — 25 findings × 8 s ≈ 3 min | UX lenta en `--judge` | Batch secuencial; cache por `(finding_id, prompt_version)`; dedup determinista sin LLM primero |
| **Bandit explora modelos malos** | GPU quemada en mutaciones inválidas | Warm-start Sprint 8; `pulls` mínimos antes de confiar; cap de exploración 10% tras warm-start |
| **Confundir duplicate evaluadores vs duplicate fingerprint** | Agrupación incorrecta del incidente discharge | Golden set incluye caso audit+clinical mismo run como `signal`; prompt regla 5 |

### 5.2 Estimación global

**~1.5–2 sesiones dev** (T1–T4) + **0.5–1 sesión** (T5 bandit + integración mutación), asumiendo Ollama local disponible y golden etiquetado en la misma sesión que el dossier 2026-06-10.

---

## 6. Guardrails clínicos obligatorios

### G1 — IA nunca cierra findings

Todo output del judge incluye `requiresHumanReview: true`. Ningún código path del módulo judge invoca `UPDATE evolution.findings SET review_status`. La única excepción de escritura en findings es `judge_*` advisory. Tests de regresión deben fallar si se añade una llamada a `reviewFinding` desde `src/judge/*`.

### G2 — IA nunca aprueba ni rechaza clínicamente

El judge clasifica en `{signal, noise, duplicate}` — vocabulario distinto de `{approved, rejected, duplicate}` humano. Mapeo prohibido: `signal → approved`, `noise → rejected`. El humano que revisa el dossier (p. ej. discharge-critical) decide si derivar fix a EPIS2; el judge solo sugiere prioridad. En UI/CLI, mostrar siempre el disclaimer: *«Clasificación automática — no sustituye revisión clínica»*.

---

## 7. Verificación de aceptación (checklist Sprint 11)

- [ ] `evolab review --judge` clasifica findings open y persiste `judge_*` sin tocar `review_status`
- [ ] Dedup determinista por fingerprint idéntico con histórico cerrado
- [ ] `evolab:judge:eval` ≥ 80% accuracy vs `judge-golden-v1.json` con `qwen3:8b`
- [ ] 100% outputs con `requiresHumanReview: true`
- [ ] `evolab models --bandit` muestra stats warm-started desde Sprint 8
- [ ] Mutación usa bandit para elegir 7b vs 14b en amplitud/depth/repair
- [ ] Gate documentado en `reports/evolution/evolab-sprint11-judge-gate.md`

---

## 8. Referencias cruzadas

- Dossier humano con 4+1 findings discharge-critical: [`evolab-review-dossier-2026-06-10.md`](evolab-review-dossier-2026-06-10.md)
- Telemetría mutación (seed bandit): [`mutation/mutate-2026-06-10T15-54-54-098Z.json`](mutation/mutate-2026-06-10T15-54-54-098Z.json)
- Benchmark modelos: [`evolab-sprint8-mutation-spec.md`](evolab-sprint8-mutation-spec.md) §1
- Creación de findings: `apps/evolution-lab/src/findings/creator.ts`
- Persistencia: `apps/evolution-lab/src/persistence/repository.ts` · `database/evolution/migrations/002_schema.sql`
