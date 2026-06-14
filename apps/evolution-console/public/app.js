const main = document.getElementById('main');
const dbStatus = document.getElementById('db-status');
let f5PollTimer;

function stopF5Poll() {
  if (f5PollTimer) {
    globalThis.clearInterval(f5PollTimer);
    f5PollTimer = undefined;
  }
}

function isF5Active(p) {
  return p && (p.status === 'running' || p.status === 'pending' || p.phase === 'evolve' || p.phase === 'preflight');
}

function progressFillClass(kind, percent, status) {
  if (status === 'failed') return 'warn';
  if (kind === 'gate' && percent >= 100) return 'done';
  if (kind === 'gate') return 'gate';
  if (percent >= 100) return 'done';
  return '';
}

function progressBarBlock(label, percent, detail, kind = 'default') {
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  const cls = progressFillClass(kind, p, '');
  return `<div class="progress-block">
    <div class="progress-label"><span>${esc(label)}</span><strong>${p.toFixed(1)}% · ${esc(detail)}</strong></div>
    <div class="progress-track" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-fill ${cls}" style="width:${p}%"></div>
    </div>
  </div>`;
}

function f5StatusBadge(status) {
  const map = {
    running: 'human_review',
    pending: 'pending',
    completed: 'passed',
    completed_under_gate: 'human_review',
    budget_exhausted: 'failed',
    failed: 'failed',
    idle: 'PENDING',
  };
  return badge(map[status] ?? status);
}

function renderF5Panel(p, { compact = false } = {}) {
  if (!p) {
    return `<div class="f5-panel"><p class="empty">Sin corrida F5 activa. Lanza <code>npm run evolab:f5:extended</code>.</p></div>`;
  }
  const live = isF5Active(p);
  const title = compact ? 'F5 en curso' : 'Corrida F5 extendida';
  return `<div class="f5-panel">
    <div class="f5-panel-head">
      <h2 style="margin:0;font-size:${compact ? '1rem' : '1.25rem'}">${live ? '<span class="f5-live-dot"></span>' : ''}${title}</h2>
      ${f5StatusBadge(p.status)}
    </div>
    ${progressBarBlock('Presupuesto tiempo', p.budgetPercent, `${p.elapsedMinutes.toFixed(1)} / ${p.budgetMinutes} min`)}
    ${progressBarBlock('Generaciones MAP-Elites', p.generationsPercent, `${p.generationsCompleted} / ${p.generationsTotal}${p.currentGeneration != null ? ` · gen ${p.currentGeneration}` : ''}`)}
    ${progressBarBlock('Gate élites (nichos vacíos)', p.gatePercent, `${p.newElitesInEmpty} / ${p.gateTarget}`, 'gate')}
    <div class="f5-meta">
      <span>Run <code>${esc(p.runId ?? '—')}</code></span>
      <span>Fase ${esc(p.phase)}</span>
      <span>Intento ${p.attempt}/${p.maxAttempts}</span>
      <span>Población ${p.population}</span>
      ${p.dryRun ? '<span>DRY-RUN</span>' : ''}
      <span>Actualizado ${fmtDate(p.updatedAt)}</span>
    </div>
    ${p.message ? `<p class="hint" style="margin-top:1rem;margin-bottom:0">${esc(p.message)}</p>` : ''}
    ${p.resources ? `<div class="f5-meta" style="margin-top:1rem">
      <span>Recursos: <strong class="sev-${esc(p.resources.level === 'critical' ? 'critical' : p.resources.level === 'warn' ? 'high' : 'low')}">${esc(p.resources.level)}</strong></span>
      <span>RAM ${p.resources.systemUsedPercent.toFixed(1)}%</span>
      <span>Libre ${p.resources.freeMemMb.toFixed(0)} MB</span>
      <span>evolab ${p.resources.evolabRssMb.toFixed(0)} MB</span>
      <span>ollama ${p.resources.ollamaRssMb.toFixed(0)} MB</span>
      ${p.resources.gpuUsedPercent != null ? `<span>VRAM ${p.resources.gpuUsedPercent.toFixed(1)}%</span>` : ''}
      ${p.resources.ollamaModelCount != null ? `<span>modelos ${p.resources.ollamaModelCount}</span>` : ''}
    </div>
    ${p.resources.reasons?.length ? `<p class="hint" style="margin-top:0.5rem">${esc(p.resources.reasons.join(' · '))}</p>` : ''}` : ''}
    ${compact ? '<p style="margin:0.75rem 0 0"><a class="link" href="#/f5">Ver detalle F5 →</a></p>' : ''}
  </div>`;
}

async function fetchF5Progress() {
  const { progress } = await api('/api/f5-progress');
  return progress;
}

async function pageF5Progress() {
  stopF5Poll();
  const paint = async () => {
    try {
      const p = await fetchF5Progress();
      main.innerHTML = `<h1>F5 Evolve</h1>
        <p class="hint">Indicador en vivo de <code>npm run evolab:f5:extended</code> · refresco cada 5 s</p>
        ${renderF5Panel(p)}
        <p class="hint">Consola: <code>npm run evolab:console</code> · logs en <code>reports/evolution/f5-extended/</code></p>`;
      if (isF5Active(p)) {
        stopF5Poll();
        f5PollTimer = globalThis.setInterval(paint, 5000);
      }
    } catch (err) {
      main.innerHTML = `<p class="empty">Error: ${esc(err.message)}</p>`;
    }
  };
  await paint();
}

async function api(path) {
  const res = await fetch(path);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function badge(status) {
  const cls = `badge badge-${String(status).replace(/\s/g, '_')}`;
  return `<span class="${cls}">${esc(status)}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

function runsTable(runs, linkPrefix = '#/run/') {
  if (!runs?.length) return '<p class="empty">Sin runs.</p>';
  return `<table>
    <thead><tr><th>Run</th><th>Escenario</th><th>Estado</th><th>Inicio</th><th>Findings</th></tr></thead>
    <tbody>${runs
      .map(
        (r) => `<tr>
      <td><a class="link" href="${linkPrefix}${esc(r.id)}">${esc(r.id.slice(0, 8))}…</a></td>
      <td>${esc(r.scenarioId)}</td>
      <td>${badge(r.finalStatus)}</td>
      <td>${fmtDate(r.startedAt)}</td>
      <td>${r.findingCount ?? 0}</td>
    </tr>`,
      )
      .join('')}</tbody>
  </table>`;
}

function judgeBadge(verdict) {
  if (!verdict) return '<span class="badge badge-PENDING">sin judge</span>';
  return `<span class="badge badge-judge-${esc(verdict)}">${esc(verdict)}</span>`;
}

function findingsTable(findings, opts = {}) {
  const showJudge = opts.judgeQueue ?? false;
  if (!findings?.length) return '<p class="empty">Sin hallazgos abiertos.</p>';
  const judgeCols = showJudge ? '<th>Judge</th><th>Prio</th>' : '<th>Judge</th><th>Prio</th>';
  return `<table>
    <thead><tr><th>Severidad</th><th>Título</th><th>Escenario</th><th>Run</th>${judgeCols}<th>Estado</th></tr></thead>
    <tbody>${findings
      .map(
        (f) => `<tr>
      <td class="sev-${esc(f.severity)}">${esc(f.severity)}</td>
      <td>${esc(f.title)}</td>
      <td>${esc(f.scenarioId)}</td>
      <td><a class="link" href="#/run/${esc(f.runId)}">${esc(f.runId.slice(0, 8))}…</a></td>
      <td>${judgeBadge(f.judgeVerdict)}</td>
      <td>${f.judgePriority ?? '—'}</td>
      <td>${badge(f.reviewStatus)}</td>
    </tr>`,
      )
      .join('')}</tbody>
  </table>`;
}

async function pageDashboard() {
  stopF5Poll();
  const [data, f5] = await Promise.all([api('/api/dashboard'), fetchF5Progress().catch(() => null)]);
  const f5Block = isF5Active(f5) ? renderF5Panel(f5, { compact: true }) : '';
  main.innerHTML = `
    <h1>Dashboard</h1>
    ${f5Block}
    <div class="grid-2">
      <div class="card"><div class="stat">${data.runs?.length ?? 0}</div><div class="stat-label">Runs recientes</div></div>
      <div class="card"><div class="stat">${data.openFindings?.length ?? 0}</div><div class="stat-label">Hallazgos abiertos</div></div>
      <div class="card"><div class="stat">${data.queue?.length ?? 0}</div><div class="stat-label">Cola human_review</div></div>
      <div class="card"><div class="stat">${data.scenarioCount ?? 0}</div><div class="stat-label">Escenarios cargados</div></div>
    </div>
    <h2>Runs recientes</h2>
    ${runsTable(data.runs)}
    <h2>Hallazgos abiertos</h2>
    ${findingsTable(data.openFindings)}
    <p class="hint">Revisión humana: <code>npm run evolab:review -- --finding &lt;id&gt; --decision approved</code></p>`;
}

async function pageRuns() {
  const { runs } = await api('/api/runs?limit=50');
  main.innerHTML = `<h1>Runs</h1>${runsTable(runs)}`;
}

async function pageFindings() {
  const { findings } = await api('/api/findings?limit=50&status=open');
  main.innerHTML = `<h1>Hallazgos</h1>${findingsTable(findings)}`;
}

async function pageJudgeQueue() {
  const { findings } = await api('/api/judge-queue?limit=50');
  main.innerHTML = `<h1>Cola judge</h1>
    <p class="hint">Ordenada por verdict (signal → duplicate → noise) y prioridad ascendente.</p>
    ${findingsTable(findings, { judgeQueue: true })}`;
}

async function pageQueue() {
  const { queue } = await api('/api/queue?limit=50');
  main.innerHTML = `<h1>Cola human_review</h1>${runsTable(queue)}`;
}

async function pageRunDetail(runId) {
  const detail = await api(`/api/runs/${encodeURIComponent(runId)}`);
  const run = detail.run;
  main.innerHTML = `
    <h1>Run <span class="link">${esc(runId)}</span></h1>
    <p>${badge(run.final_status ?? run.status ?? '?')} · ${esc(run.scenario_id)} · ${fmtDate(run.started_at)}</p>
    <h2>Evaluaciones (${detail.evaluations?.length ?? 0})</h2>
    <pre class="json">${esc(JSON.stringify(detail.evaluations, null, 2))}</pre>
    <h2>Findings (${detail.findings?.length ?? 0})</h2>
    <pre class="json">${esc(JSON.stringify(detail.findings, null, 2))}</pre>
    ${detail.filesystem ? `<h2>Evidencia filesystem</h2><pre class="json">${esc(JSON.stringify(detail.filesystem, null, 2))}</pre>` : ''}
    <p><a class="link" href="#/runs">← Volver a runs</a></p>`;
}

function setActiveNav(route) {
  document.querySelectorAll('#nav a').forEach((a) => {
    const r = a.getAttribute('data-route');
    a.classList.toggle('active', route === r || (r === '/runs' && route.startsWith('/run/')));
  });
}

async function router() {
  const hash = location.hash.slice(1) || '/';
  setActiveNav(hash.startsWith('/run/') ? '/runs' : hash);

  try {
    if (hash === '/' || hash === '') await pageDashboard();
    else if (hash === '/runs') {
      stopF5Poll();
      await pageRuns();
    } else if (hash === '/findings') {
      stopF5Poll();
      await pageFindings();
    } else if (hash === '/judge-queue') {
      stopF5Poll();
      await pageJudgeQueue();
    } else if (hash === '/queue') {
      stopF5Poll();
      await pageQueue();
    } else if (hash === '/f5') await pageF5Progress();
    else if (hash.startsWith('/run/')) {
      stopF5Poll();
      await pageRunDetail(hash.slice('/run/'.length));
    } else {
      stopF5Poll();
      main.innerHTML = '<p class="empty">Ruta desconocida</p>';
    }
  } catch (err) {
    main.innerHTML = `<p class="empty">Error: ${esc(err.message)}</p>`;
  }
}

async function initHealth() {
  try {
    const h = await api('/api/health');
    dbStatus.textContent = h.database ? 'DB OK' : 'DB off';
    dbStatus.className = `pill ${h.database ? 'pill-ok' : 'pill-bad'}`;
  } catch {
    dbStatus.textContent = 'DB error';
    dbStatus.className = 'pill pill-bad';
  }
}

window.addEventListener('hashchange', router);
initHealth();
router();
