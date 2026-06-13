# Evolab ↔ EPIS2 — Registro de desarrollos y capacidades faltantes

**Canon operativo** para convertir runs Evolab en trabajo accionable del plan EPIS2 (PROG-EXPERIENCIA-CORE).

Relacionado: [`EVOLAB_EPIS2_TRACEABILITY.md`](./EVOLAB_EPIS2_TRACEABILITY.md) · [`F5_DEV_PLAN_RUNBOOK.md`](./F5_DEV_PLAN_RUNBOOK.md)

---

## Tres capas (no mezclar)

| Capa | Qué registra | Artefacto | Quién cierra |
|------|----------------|-----------|--------------|
| **A · Producto** | Bug o gap en sandbox EPIS2 | Finding DB + `hypotheses.jsonl` | Dev EPIS2 + replay |
| **B · Cobertura** | EPIS2 existe, falta escenario/prueba | `epis2-dev-registration.jsonl` + fitness `--gaps` | Evolab (YAML) → luego A si falla |
| **C · Lab** | Evolab no puede ejecutar aún | `epis2-dev-registration.jsonl` (`lab-capability`) | Código evolab |

```text
Run → Finding ──► Hipótesis (A) ──► Brief dev-plan ──► Sesión EPIS2
                      ▲
Fitness --gaps ──► Registro (B/C) ──► Nuevo escenario / executor
```

---

## Registro vivo

```bash
# Regenerar ledger desde hipótesis + gaps (idempotente)
npm run evolab:dev-register:export

# Brief accionable para tablero EPIS2
npm run evolab:dev-plan:brief
```

**Archivo:** `reports/evolution/epis2-dev-registration.jsonl` (una línea JSON por ítem).

**Campos principales:**

| Campo | Uso |
|-------|-----|
| `kind` | `product-hypothesis` · `coverage-gap` · `process-tree-gap` · `lab-capability` |
| `status` | `open` · `fixed` · `wontfix` · `deferred` |
| `hypothesisId` | Enlace a `hyp-*` si aplica |
| `fingerprint` | Finding estable (vacío si placeholder) |
| `epis2Front` | `A-paper` · `B-electronic` · `C-command` · `core-clinical` · `infra` |
| `epis2Microphase` | MF del tablero EPIS2 |
| `epis2Gate` | Gate de cierre |
| `evolabAction` | Próximo paso concreto en evolab o EPIS2 |

---

## A — Bug / regresión EPIS2

### 1. Detección

El run crea un **finding** (`evolution.findings`) con fingerprint estable.

```bash
npm run evolab:findings -- --status open
npm run evolab:findings:report
```

### 2. Hipótesis

```bash
npx tsx apps/evolution-lab/src/cli.ts hypothesis add \
  --fingerprint <fp> \
  --title "Descripción del gap" \
  --theme E \
  --priority P1 \
  --notes "[dev-plan:A-paper|MF-PA-01|quality:paper-mode-next|packages/command-registry/|Acción sesión]"
```

**Formato `[dev-plan:…]` en `notes`:**

```text
[dev-plan:<frente>|<MF>|<gate>|<paths csv>|<acción sesión>]
```

| Frente | Valor |
|--------|--------|
| Papel | `A-paper` |
| Ficha electrónica | `B-electronic` |
| Comando + IA | `C-command` |
| Clínica base | `core-clinical` |
| Infra evolab | `infra` |

### 3. Trazabilidad y cierre

```bash
npx tsx apps/evolution-lab/src/cli.ts hypothesis trace --fingerprint <fp>
npm run evolab:replay-fingerprint -- <fp>
# Fix EPIS2 → PR con etiqueta evolab-fp-<hash12>
npx tsx apps/evolution-lab/src/cli.ts hypothesis update --id hyp-xxx --status fixed
npm run evolab:dev-register:export
```

**PR EPIS2:** etiqueta `evolab-fp-*` · enlace `hyp-*` · gate del frente.

---

## B — Cobertura faltante (pruebas)

### Radar

```bash
npm run evolab:process-tree:export    # snapshot árbol EPIS2 (opcional, mejora navigation_reachable)
npm run evolab:fitness -- report --gaps
```

Salida útil:

- Endpoints sin cubrir (`coverage-catalog.ts`)
- Eventos audit sin cubrir
- Nodos del árbol no visitados (S15.3)
- Workspace gaps (rol × workspace × outcome)

### Registrar hueco

Tras `dev-register:export`, los gaps top quedan en `epis2-dev-registration.jsonl` con `kind: coverage-gap` o `process-tree-gap`.

**Cerrar un hueco B:**

1. Añadir escenario YAML en `apps/evolution-lab/scenarios/`
2. `target.capabilities` + `flow` declarativo o `processNodeId` / `commandIntent`
3. `npm run evolab:run -- <scenario-id>`
4. Si finding de producto → promover a hipótesis (capa A)
5. `dev-register:export` → marcar manualmente `fixed` en jsonl si procede (o script futuro)

### Plantilla escenario mínima

```yaml
id: paper-command-rbac-001
version: 1
name: Papel — comando NL respeta RBAC
target:
  capabilities:
    - paper
    - command_center
processNodeId: cmd-paper-example   # si aplica
persona:
  role: physician
fixture:
  demoCaseCode: DEMO-001
flow:
  - api:
      method: POST
      path: /api/commands/resolve
      # …
expected:
  functional:
    status: 403
evaluators:
  - functional
  - audit_completeness
tags:
  - paper
  - smoke
```

---

## C — Capacidad faltante en Evolab (lab)

**Síntoma:** `blocked_by_missing_capability` · `requiere EPIS2_EVOLAB_LLM_SIM=execute` · browser off en escenario visual.

| Caso | Acción |
|------|--------|
| Escenario con `flow:` | Step-engine declarativo — suele bastar |
| `execution: plan` / tag `llm_driven` | `EPIS2_EVOLAB_LLM_SIM=execute` o escenario API equivalente |
| `visual-*` | Perfil `visual-smoke` + browser on |
| Executor dedicado (`role-evolution-sign-001`, …) | Case en `scenarios/executor.ts` |

**No** abrir hipótesis de producto para deuda del lab — usar `kind: lab-capability` en el registro.

---

## Review de findings

```bash
# Confirmar señal
npm run evolab:review -- --finding <uuid> --decision approved --comment "confirmado"

# Ruido / histórico / mutante stale
npm run evolab:review -- --finding <uuid> --decision rejected --comment "mutante histórico"

# Duplicado judge
npm run evolab:review:close-duplicates
```

---

## Ciclo de sesión recomendado

```bash
npm run evolab:dev-register:export
npm run evolab:dev-plan:brief
npm run evolab:fitness -- report --gaps
# Opcional evolve
npm run evolab:f5:dev-plan:dry-run
```

**Regla EPIS2:** un frente · un MF · allowlist · gate del frente · cierre con `hypothesis fixed`.

---

## Hipótesis activas (referencia)

| ID | Tipo | Frente | Gate |
|----|------|--------|------|
| hyp-c-audit-trail | Producto | core-clinical | `npm run check` |
| hyp-e-paper-command | Producto (placeholder fp) | A-paper | `quality:paper-mode-next` |
| hyp-f-dual-chart-nav | Producto (placeholder fp) | B-electronic | `quality:dual-chart-gate` |
| hyp-g-command-assist | Producto (placeholder fp) | C-command | `test:e2e:ux-g02` |

P0 cerrados (hyp-a/b/d) → regresión `evolab:pre-evolve-smoke`.

---

## Promoción corpus

`archive:promote` exige hipótesis vinculada o `--signoff "motivo"` — ver S16.5 en traceability doc.
