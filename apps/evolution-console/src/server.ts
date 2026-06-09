import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getConsoleHealth,
  getDashboard,
  getFindings,
  getQueue,
  getRunDetail,
  getRuns,
} from '../../evolution-lab/src/console/read-model.js';
import { loadConsoleConfig } from './config.js';

const PUBLIC_DIR = join(fileURLToPath(new URL('..', import.meta.url)), 'public');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendText(res: ServerResponse, status: number, body: string, type = 'text/plain') {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
  res.end(body);
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  config: ReturnType<typeof loadConsoleConfig>,
) {
  if (!config.databaseUrl) {
    sendJson(res, 503, { error: 'EPIS2_EVOLAB_DATABASE_URL no configurada' });
    return;
  }

  const url = new URL(req.url ?? '/', `http://${config.host}`);
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '20', 10) || 20;
  const status = url.searchParams.get('status') ?? undefined;

  if (pathname === '/api/health') {
    sendJson(res, 200, await getConsoleHealth(config.databaseUrl));
    return;
  }

  if (pathname === '/api/dashboard') {
    sendJson(res, 200, await getDashboard(config.databaseUrl));
    return;
  }

  if (pathname === '/api/runs') {
    sendJson(res, 200, { runs: await getRuns(config.databaseUrl, limit) });
    return;
  }

  if (pathname.startsWith('/api/runs/')) {
    const runId = pathname.slice('/api/runs/'.length);
    const detail = await getRunDetail(config.databaseUrl, runId);
    if (!detail) {
      sendJson(res, 404, { error: 'Run no encontrado' });
      return;
    }
    sendJson(res, 200, detail);
    return;
  }

  if (pathname === '/api/findings') {
    sendJson(res, 200, {
      findings: await getFindings(config.databaseUrl, {
        limit,
        ...(status ? { reviewStatus: status } : {}),
      }),
    });
    return;
  }

  if (pathname === '/api/queue') {
    sendJson(res, 200, { queue: await getQueue(config.databaseUrl, limit) });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

function serveStatic(res: ServerResponse, pathname: string) {
  const safe = pathname === '/' ? '/index.html' : pathname;
  const filePath = join(PUBLIC_DIR, safe);
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    sendText(res, 404, 'Not found');
    return;
  }
  const ext = extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  res.end(readFileSync(filePath));
}

async function main() {
  const config = loadConsoleConfig();

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${config.host}`);
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url.pathname, config);
        return;
      }
      serveStatic(res, url.pathname);
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  server.listen(config.port, config.host, () => {
    console.log(`EPIS2 Evolution Console — http://${config.host}:${config.port}`);
    if (!config.databaseUrl) {
      console.warn('  ⚠ EPIS2_EVOLAB_DATABASE_URL no definida — API en 503');
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
