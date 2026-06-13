# F5 extendido — preflight OK · listo para lanzar

**Generado:** 2026-06-12T10:50Z

## Servicios

| Servicio | URL | Estado |
|----------|-----|--------|
| Postgres EPIS2 | `:5433` | ✓ docker `epis2-postgres` |
| EPIS2 API | http://127.0.0.1:3001 | ✓ health + ready |
| EPIS2 Web | http://127.0.0.1:5173 | ✓ Vite |
| Ollama | http://127.0.0.1:11434 | ✓ 8 modelos · qwen3:8b |
| Evolab DB | epis2_evolab@5433 | ✓ migrada |
| Evolab console | http://127.0.0.1:5190/#/f5 | en marcha |

## Checks

- `evolab:doctor` — OK (API + DB + Ollama)
- `evolab:smoke:visual` — 2/2 passed (browser on)
- Run-state — reiniciado (`f5-1781261389000`)

## Parámetros corrida

- Presupuesto: **360 min** (6 h)
- Generaciones: **36** · población **6**
- Browser: **on** (`EPIS2_EVOLAB_BROWSER=1`)
- `EPIS2_ROOT`: `C:\Users\gdela\OneDrive\Documentos Importantes\EPIS2`

## Comando (si relanzas manualmente)

```powershell
cd "C:\Users\gdela\OneDrive\Documentos Importantes\epis2-evolab"
$env:EPIS2_ROOT = "C:\Users\gdela\OneDrive\Documentos Importantes\EPIS2"
$env:EPIS2_EVOLAB_BROWSER = "1"
npm run evolab:console    # monitor
npm run evolab:f5:extended
```

## Logs vivos

- `reports/evolution/f5-extended/progress.json`
- `reports/evolution/f5-extended/run-state.json`
- `reports/evolution/f5-extended/resources.jsonl`
- `reports/evolution/f5-extended/evolve-run.log`
