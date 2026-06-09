# EPIS2 Evolab — Auditoría inicial (FASE 0)

**Fecha:** 2026-06-08  
**Commit:** `ae41c81` · rama `master`  
**Auditor:** Cursor (arquitecto Evolab)

---

## 1. Resumen ejecutivo

EPIS2 es un monorepo npm workspaces maduro con frontend React (`apps/web`), backend Fastify (`apps/api`), IA local (`services/local-ai`), paquetes clínicos compartidos y una batería extensa de gates de calidad. **No existe aún `apps/evolution-lab` ni scripts `evolab:*`.** La auditoría confirma que el repositorio es apto para alojar Evolab como aplicación externa sin acoplamiento clínico.

---

## 2. Package manager y workspaces

| Aspecto | Valor |
|---------|-------|
| Package manager | **npm** (workspaces) |
| Node mínimo | `>=20` |
| Tipo de módulo | ESM (`"type": "module"`) |
| TypeScript | 5.8.x, strict |
| Test runner | Vitest 3.x (unit/integration) |
| E2E | Playwright 1.60 (`e2e/`) |

**Workspaces actuales:**

```text
apps/*     → web, api
packages/* → contracts, clinical-domain, design-system, epis2-ui, …
services/* → local-ai
```

**Ausentes (a crear):** `apps/evolution-lab`, `apps/evolution-console`.

---

## 3. Aplicaciones clínicas

### 3.1 Frontend — `apps/web`

- React 19 + Vite 6 + TanStack Router/Query
- Sistema visual: MUI vía `@epis2/epis2-ui` (MD3, tres modos)
- Puerto dev: **5173** (`WEB_ORIGIN=http://127.0.0.1:5173`)
- **No importa** paquetes de laboratorio (verificado: sin referencias `evolution`)

### 3.2 Backend — `apps/api`

- Fastify 5 + Drizzle ORM + postgres
- Puerto: **3001** (`API_PORT=3001`)
- Health: `GET /health`
- Auth demo: `POST /api/auth/login` con `demoAuthKey`
- **No contiene** orquestador ni rutas Evolab

### 3.3 IA local — `services/local-ai`

- Proxy hacia Ollama nativo (`OLLAMA_BASE_URL=http://127.0.0.1:11434`)
- Modelo clínico por defecto: `qwen3:8b`
- Puerto: **3002**
- **Separado de Evolab:** Evolab tendrá su propio Ollama Gateway; no reutilizar el runtime de `local-ai` como orquestador

---

## 4. PostgreSQL

| Parámetro | Valor |
|-----------|-------|
| Imagen | `pgvector/pgvector:pg16` |
| Contenedor | `epis2-postgres` |
| Host | `127.0.0.1:5433` |
| DB clínica | `epis2` |
| Usuario app | `epis2_app` / `epis2` |
| Migraciones | `database/migrations/*.sql` (33+ archivos) |

**Decisión Evolab:** base de datos separada `epis2_evolab`, esquema `evolution`, misma instancia Docker Postgres (puerto 5433). No mezclar con tablas clínicas.

**Sandbox clínico:** datos demo sintéticos en migraciones `004_seed_synthetic.sql`, `006_demo_five_cases.sql`. Paquete `@epis2/test-fixtures` expone `DEMO_CLINICAL_CASES`, `SYNTHETIC_LABEL`.

---

## 5. Playwright

- Config: `playwright.config.ts` (raíz)
- Directorio: `e2e/` (~20 specs)
- Helpers: `e2e/helpers/demoPatient.ts` (login médico demo, pin paciente)
- Workers: 1 (alineado con Evolab `BROWSER_CONCURRENCY=1`)
- webServer auto-levanta API + Web en tests E2E clínicos
- **Evolab:** usar Playwright desde proceso propio; no modificar specs clínicos existentes

---

## 6. Ollama

Instalación **nativa** en Windows. Ver `reports/evolution/ollama-model-inventory.md`.

| Modelo preferido Evolab | Disponible |
|-------------------------|------------|
| `qwen3:8b` | ✓ (5.2 GB) |
| Embeddings `bge-m3` | ✓ |
| Embeddings `nomic-embed-text` | ✓ |

Scripts existentes reutilizables como referencia (no dependencia):
- `scripts/ollama/probe.mjs`, `route.mjs`, `native-client.mjs`
- `npm run ollama:probe`, `ollama:route`

---

## 7. Scripts clínicos relevantes (Evolab NO debe engancharse)

| Script | Propósito |
|--------|-----------|
| `npm run dev:web` | Frontend clínico |
| `npm run dev:api` | API clínica |
| `npm run stack:dev` | Postgres + migrate + Ollama smoke |
| `npm run stack:up` | Stack producción-like |
| `npm run test:e2e` | Golden journeys clínicos |
| `npm run dev:agent:*` | Orquestación **desarrollo** (distinto de Evolab QA) |

**Evolab tendrá:** `npm run evolab:*` independientes. `evolab:stack` levantará sandbox + DB Evolab bajo demanda.

---

## 8. Arquitectura y gates existentes

- `npm run architecture:validate` — 17 validadores (MUI, registries, AI boundary, etc.)
- `scripts/architecture/ai-write-boundary.mjs` — patrón útil para Evolab boundary
- RBAC: `packages/clinical-domain/src/rbac.ts` — roles `physician`, `nurse`, `admin`, etc.
- Reglas clínicas: `packages/clinical-domain/src/clinicalDecisionRules/` — bloqueo alta con labs críticos

---

## 9. Capacidades para escenarios MVP

| Escenario | Capacidad EPIS2 | Estado |
|-----------|-----------------|--------|
| Alta con pendiente crítico | `discharge_summary` + reglas CDR `critical_lab_without_ack` | ✓ reglas + E2E golden V2 |
| Medicamento suspendido MAR | MAR enfermería (`e2e/tramo-c-mar.spec.ts`) | ⚠ verificar regla suspendido (gap posible) |
| Acción fuera del rol | RBAC `draft.approve` solo physician | ✓ matriz explícita |

---

## 10. Riesgos de acoplamiento detectados

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Import directo `apps/api/src/*` desde Evolab | Alta | Prohibido; usar HTTP + fixtures |
| Compartir `DATABASE_URL` clínica para escritura | Alta | DB `epis2_evolab` separada; sandbox read-only para observación |
| Arrancar Evolab en `stack:dev` | Media | No modificar; comando `evolab:stack` dedicado |
| Confundir `dev:agent:*` con Evolab | Baja | Documentar; namespaces distintos |
| Playwright en mismo proceso que API | Baja | Proceso Node separado para orquestador |

**Imports prohibidos verificados:** ningún `evolution-lab` existe aún; web/api no referencian Evolab.

---

## 11. Hardware detectado

```text
OS: Windows 10.0.26200
CPU: AMD Ryzen 7 (declarado)
RAM: 64 GB (declarado)
GPU: NVIDIA RTX 5070 · 12 GB VRAM (declarado)
Ollama: nativo, 8 modelos instalados, 0 cargados en idle
```

---

## 12. Árbol de archivos propuesto (FASE 1+)

```text
apps/
  evolution-lab/
    src/
      cli/              doctor, models, run, replay, …
      config/           env, limits
      contracts/        Zod schemas
      state-machine/    transiciones explícitas
      security/         guards, allowlist
      ollama/           registry, queue, structured client
      orchestrator/     loop maestro
      browser/          Playwright controller (FASE 4)
      evidence/         collector (FASE 5)
      evaluators/       deterministas (FASE 6)
      findings/         registry + fingerprint (FASE 6)
      replay/           engine (FASE 7)
      persistence/      repos + migrations (FASE 2)
      scenarios/        loader YAML
      human-gates/      CLI decisions (FASE 6+)
      reporting/        report generator
    scenarios/          YAML declarativos
    tests/
    package.json
  evolution-console/
    README.md           placeholder FASE 10

database/
  evolution/            migraciones epis2_evolab (FASE 2)

scripts/evolution/
  boundary-validate.mjs

reports/evolution/      evidencia y auditorías
docs/evolution/         arquitectura operativa
```

---

## 13. Bloqueos

**Ninguno bloqueante** para iniciar FASE 1. FASE 2 requerirá crear DB `epis2_evolab` en Postgres Docker (script de init).

---

## 14. Comandos ejecutados en auditoría

```bash
ollama list
ollama ps
Invoke-RestMethod http://127.0.0.1:11434/api/tags
git rev-parse --abbrev-ref HEAD
git rev-parse --short HEAD
```

---

## 15. Próximo paso

**FASE 1:** crear `apps/evolution-lab` con CLI, contratos Zod, máquina de estados, guards de seguridad, comando `evolab:doctor` y tests unitarios.
