# EPIS2 Evolab — Sprint 11 judge gate

**Accuracy:** 52.0% (13/25)
**Macro-F1:** 0.284
**Signal recall:** 100.0%

## Confusion matrix (golden → predicted)

| | signal | noise | duplicate |
|---|---:|---:|---:|
| **signal** | 12 | 0 | 0 |
| **noise** | 9 | 1 | 1 |
| **duplicate** | 2 | 0 | 0 |

## Detalle

- ✓ golden-001: golden=signal predicted=signal
- ✓ golden-002: golden=signal predicted=signal
- ✓ golden-003: golden=signal predicted=signal
- ✓ golden-004: golden=signal predicted=signal
- ✗ golden-005: golden=duplicate predicted=signal
- ✗ golden-006: golden=duplicate predicted=signal
- ✓ golden-007: golden=signal predicted=signal
- ✓ golden-008: golden=signal predicted=signal
- ✓ golden-009: golden=signal predicted=signal
- ✗ golden-010: golden=noise predicted=signal
- ✓ golden-011: golden=noise predicted=noise
- ✓ golden-012: golden=signal predicted=signal
- ✓ golden-013: golden=signal predicted=signal
- ✗ golden-014: golden=noise predicted=signal
- ✓ golden-015: golden=signal predicted=signal
- ✗ golden-016: golden=noise predicted=signal
- ✗ golden-017: golden=noise predicted=signal
- ✗ golden-018: golden=noise predicted=signal
- ✗ golden-019: golden=noise predicted=signal
- ✗ golden-020: golden=noise predicted=duplicate
- ✗ golden-021: golden=noise predicted=signal
- ✓ golden-022: golden=signal predicted=signal
- ✓ golden-023: golden=signal predicted=signal
- ✗ golden-024: golden=noise predicted=signal
- ✗ golden-025: golden=noise predicted=signal