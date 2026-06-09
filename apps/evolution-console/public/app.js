const main = document.getElementById('main');
const dbStatus = document.getElementById('db-status');

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
    <tbody>${runs.map((r) => `<tr>
      <td><a class="link" href="${linkPrefix}${esc(r.id)}">${esc(r.id.slice(0, 8))}…</a></td>
      <td>${esc(r.scenarioId)}</td>
      <td>${badge(r.finalStatus)}</td>
      <td>${fmtDate(r.startedAt)}</td>
      <td>${r.findingCount ?? 0}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function findingsTable(findings) {
  if (!findings?.length) return '<p class="empty">Sin hallazgos abiertos.</p>';
  return `<table>
    <thead><tr><th>Severidad</th><th>Título</th><th>Escenario</th><th>Run</th><th>Estado</th></tr></thead>
    <tbody>${findings.map((f) => `<tr>
      <td class="sev-${esc(f.severity)}">${esc(f.severity)}</td>
      <td>${esc(f.title)}</td>
      <td>${esc(f.scenarioId)}</td>
      <td><a class="link" href="#/run/${esc(f.runId)}">${esc(f.runId.slice(0, 8))}…</a></td>
      <td>${badge(f.reviewStatus)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

async function pageDashboard() {
  const data = await api('/api/dashboard');
  main.innerHTML = `
    <h1>Dashboard</h1>
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
  const { findings } = await api('/api/findings?limit=50');
  main.innerHTML = `<h1>Hallazgos</h1>${findingsTable(findings)}`;
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
    else if (hash === '/runs') await pageRuns();
    else if (hash === '/findings') await pageFindings();
    else if (hash === '/queue') await pageQueue();
    else if (hash.startsWith('/run/')) await pageRunDetail(hash.slice('/run/'.length));
    else main.innerHTML = '<p class="empty">Ruta desconocida</p>';
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
