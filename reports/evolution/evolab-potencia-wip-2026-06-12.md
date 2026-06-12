# EPIS2 Evolab — recuperación crash (potencia WIP)

**Fecha:** 2026-06-12  
**Contexto:** crash durante implementación «potencia» (bandit evolve, fitness MO, archive promote)  
**Remote:** `fb34c85` (F5 report) — **WIP local sin commit**

---

## Estado tras recuperación

| Gate | Resultado |
|------|-----------|
| `npm run test` | **544/544** ✓ |
| `npm run typecheck` | ✓ (fix `fingerprint` en schema judge) |
| Git | 12 archivos modificados + 2 nuevos (sin commit) |

---

## WIP incluido (potencia)

1. **Bandit en evolve** — `mutation/ensemble.ts`; `evolve.ts` usa UCB + registra recompensas por generación
2. **Fitness multiobjetivo** — `highFindingsCount` (high/critical) pesa 4× vs hallazgos rutinarios 1.25×
3. **`evolab archive promote`** — top N élites → `scenarios/` + status `promoted` en Postgres
4. **Judge dedup** — `deterministic-dedup` exige match de fingerprint en historial

---

## Comandos nuevos

```powershell
npm run evolab:archive:promote -- --dry-run
npm run evolab:archive:promote -- --top 3
npm run evolab:archive:promote -- --candidate-id admission-double-booking-001-m8cx-004
```

---

## Próximo paso

Commit + push WIP potencia → `review --judge` cola → F5 nocturno 15×5×150.
