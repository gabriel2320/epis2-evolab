# Evolab → EPIS2 — Brief plan de desarrollo

Generado: 2026-06-13

> Resultados accionables para **PROG-EXPERIENCIA-CORE** · un frente por sesión SDEPIS2.

## Hipótesis abiertas (prioridad)

### hyp-c-audit-trail · Audit trail incompleto en flujos discharge/admission

| Campo | Valor |
|-------|-------|
| Prioridad | P1 |
| Frente EPIS2 | core-clinical |
| Microfase | `MF-CASE-*` |
| Gate cierre | `npm run check` |
| PR label | `evolab-fp-68c457a21613` |

**Archivos EPIS2 sugeridos:**
- `apps/api/src/audit/`

**Sesión:** Completar eventos audit en POST discharge/admit

```bash
npm run evolab:replay-fingerprint -- 68c457a21613e462
```

### hyp-e-paper-command · Comando papel resuelve sin RBAC o fuera de chartMode=paper

| Campo | Valor |
|-------|-------|
| Prioridad | P1 |
| Frente EPIS2 | A-paper |
| Microfase | `MF-PA-01` |
| Gate cierre | `quality:paper-mode-next` |
| PR label | `evolab-fp-edeae01` |

**Archivos EPIS2 sugeridos:**
- `packages/command-registry/src/paper-commands.ts`

**Sesión:** Alinear comando NL con chartMode paper y rol

```bash
npm run evolab:replay-fingerprint -- pendingepaper01
```

### hyp-f-dual-chart-nav · Navegación dual-chart — sección staging vacía o unreachable

| Campo | Valor |
|-------|-------|
| Prioridad | P1 |
| Frente EPIS2 | B-electronic |
| Microfase | `MF-TE-01` |
| Gate cierre | `quality:dual-chart-gate` |
| PR label | `evolab-fp-eddac01` |

**Archivos EPIS2 sugeridos:**
- `apps/web/src/pages/GeneratedClinicalFormPage.tsx`

**Sesión:** Rellenar staging C-4 según finding

```bash
npm run evolab:replay-fingerprint -- pendingdualc01
```

### hyp-g-command-assist · Barra NL — assist escribe SoT o bypassa draft.approve

| Campo | Valor |
|-------|-------|
| Prioridad | P1 |
| Frente EPIS2 | C-command |
| Microfase | `MF-CM-01` |
| Gate cierre | `test:e2e:ux-g02` |
| PR label | `evolab-fp-edcda01` |

**Archivos EPIS2 sugeridos:**
- `apps/api/src/ai/routes.ts`

**Sesión:** Verificar borrador≠aprobado en assist discharge/admit

```bash
npm run evolab:replay-fingerprint -- pendingcmdas01
```

## Reglas sesión (canon EPIS2)

1. Elegir **un frente** (A papel · B electrónica · C comando+IA · core clínico).
2. Declarar alcance MF + archivos allowlist.
3. Fix sandbox → replay fingerprint verde → `npm run check` + gate del frente.
4. PR EPIS2 con etiqueta `evolab-fp-*` + `hypothesis update --status fixed`.

Ver: `docs/product/EPIS2_TABLERO.md` · `docs/evolution/F5_DEV_PLAN_RUNBOOK.md`