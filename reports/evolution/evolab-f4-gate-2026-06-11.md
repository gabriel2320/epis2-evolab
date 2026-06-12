# EPIS2 Evolab — F4 ops gate

**Fecha:** 2026-06-11  
**Alcance:** F4.2–F4.5 (ops, docs, housekeeping, few-shot élites) + smoke vivo F1.5  
**Veredicto:** ✓ cerrado salvo F4.1 (secret GHA — acción manual en GitHub)

---

## Resumen F4

| ID | Tarea | Resultado |
|----|-------|-----------|
| F4.1 | Secret `EPIS2_CHECKOUT_TOKEN` | Documentado en README · configuración manual en GitHub |
| F4.2 | Nota Windows `npm run quality` | ✓ README |
| F4.3 | Script housekeeping | ✓ `npm run evolab:housekeeping` |
| F4.4 | Sync audit 2026-06-11 | ✓ `evolab-audit-2026-06-11.md` actualizado |
| F4.5 | Few-shot élites mutación | ✓ `mutation-elite-examples.json` + pipeline |

---

## Smoke vivo (F1.5)

Comando: `npm run evolab:metamorphic -- run --tag smoke` (API `:3001`)

| Resultado | Detalle |
|-----------|---------|
| **7/7** ✓ | Tras fix `auditEventCreated` en escenarios critical-ack + `audit_delta` por conteo |

Fixes incluidos:
- `compareAuditDelta` usa conteo (no set) para tolerar historial duplicado
- Escenarios `critical-ack-*` con `expected.auditEventCreated: true` para captura post-run

---

## CI

- Job `smoke`: timeout 12 min + paso metamórfico `--tag smoke`
- Sigue `continue-on-error: true` hasta 3× verde con token configurado

---

## Próximo paso

**F5** — evolve nocturno calibrado (`evolab evolve --generations 15 …`) cuando cola judge estable.
