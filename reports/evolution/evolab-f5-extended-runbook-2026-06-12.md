# EPIS2 Evolab — F5 extendido (6 h)

**Fecha:** 2026-06-12  
**Alcance:** corrida MAP-Elites prolongada + modos visuales paper/classic + watchdog  
**Repo:** `epis2-evolab` · sandbox EPIS2 externo

---

## Parámetros calibrados

| Parámetro | Valor | Notas |
|-----------|------:|-------|
| `--budget-minutes` | **360** | 6 h presupuesto duro |
| `--generations` | **36** | ~2× F5 nocturno estándar |
| `--population` | **6** | más exploración por gen |
| Reintentos watchdog | **8** | presupuesto restante entre intentos |
| Heartbeat | **5 min** | `heartbeat.jsonl` |

Gate objetivo (sin cambio S9): **≥5 élites nuevos en nichos previamente vacíos**.

---

## Extensión visual (paper + clásico)

| Artefacto | Descripción |
|-----------|-------------|
| `visual-paper-chart-001.yaml` | `chartMode=paper` · evaluador `visual_shell` |
| `visual-classic-traditional-001.yaml` | `chartMode=traditional` (Classic EMR dual) |
| `NICHE_MODULES` +`paper` +`classic` | MAP-Elites **84 celdas** (3×7×4) |
| Mutación S8 | Prompts incluyen URLs y testIds visuales |

Smoke visual previo:

```bash
npm run evolab:smoke:visual
```

Requiere EPIS2 web + Playwright (`EPIS2_EVOLAB_BROWSER=1`).

---

## Pre-vuelo (obligatorio)

```powershell
# Terminal 1 — EPIS2 sandbox
cd $env:EPIS2_ROOT  # ej. ...\EPIS2
npm run stack:dev
npm run dev:api
# Opcional web para escenarios visuales:
npm run dev:web

# Terminal 2 — Evolab
cd ...\epis2-evolab
$env:EPIS2_ROOT = "...\EPIS2"
npm run evolab:db:migrate
npm run evolab:doctor
npm run test
npm run evolab:smoke:visual
```

Verificar Ollama (`qwen2.5-coder:7b` / bandit) y Postgres `:5433`.

---

## Lanzar corrida con watchdog

```powershell
cd ...\epis2-evolab
npm run evolab:f5:extended
```

Dry-run (sin sandbox, validar pipeline):

```powershell
npm run evolab:f5:extended -- --dry-run
```

Override parcial:

```powershell
npm run evolab:f5:extended -- --budget-minutes 360 --generations 36 --population 6
```

---

## Vigilancia y logs

| Archivo | Contenido |
|---------|-----------|
| `reports/evolution/f5-extended/progress.json` | barras de progreso + **recursos** (RAM/VRAM evolab+ollama) |
| `reports/evolution/f5-extended/resources.jsonl` | muestreos cada 45 s durante evolve |
| `reports/evolution/f5-extended/run-state.json` | estado vivo, intentos, minutos consumidos |
| `reports/evolution/f5-extended/incidents.jsonl` | fallos con motivo y stderr |
| `reports/evolution/f5-extended/evolve-run.log` | stdout evolve acumulado |
| `reports/evolution/evolve/evolve-*.json` | telemetría por intento |
| `reports/evolution/f5-extended/subagent-watchdog-prompt.md` | prompt Cursor tras crash |

### Subagente anti-crash

Tras un incidente, el watchdog genera prompt actualizado. En Cursor:

1. Adjuntar `@reports/evolution/f5-extended/subagent-watchdog-prompt.md`
2. Adjuntar `@reports/evolution/f5-extended/run-state.json`
3. Pedir recuperación según checklist del prompt
4. Relanzar `npm run evolab:f5:extended` (retoma presupuesto)

**Alcance recursos:** solo procesos **evolab** (node/tsx) + **ollama** · modelos vía `Ollama /api/ps` · GPU opcional (`nvidia-smi`). No monitoriza EPIS2 web/api ni otros procesos.

**Protección:** si RAM/VRAM supera umbral crítico → pausa 120 s antes de evolve · detiene evolve en curso si persiste · log en `resources.jsonl`.

Umbrales default: RAM sistema ≥92%, libre <2 GB, RSS evolab+ollama ≥14 GB, VRAM ≥92%.

---

## Cronograma sugerido (6 h)

```text
T+0    preflight + smoke visual
T+15m  inicio watchdog / evolve
T+1h   checkpoint: run-state + 1ª telemetría JSON
T+3h   checkpoint: cola findings (opcional review --judge)
T+6h   fin presupuesto · gate report
T+6h+  revisión humana candidatos · NO promote automático
```

---

## Post-corrida

```bash
npm run evolab:review -- --judge
npm run evolab:archive:promote -- --dry-run
npm run evolab:housekeeping
```

Reporte gate: `reports/evolution/evolab-f5-gate-extended-2026-06-12.md` (completar tras corrida).

---

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| API EPIS2 caída | watchdog reintenta + incidents.jsonl |
| Ollama OOM | bandit cae a modelo default; documentar en recovery |
| Escenarios visuales flake | tag `smoke-visual` aislado; browser timeout 25s |
| Una sola corrida | no lanzar `evolab evolve` manual en paralelo |

---

## Invariantes

- Judge no cierra `review_status`
- Élites `promoted` intocables
- IA no promueve al corpus sin humano
