import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const externalUrl = process.argv[2] ?? process.env.SMOKE_BASE_URL;
const timeoutMs = 15_000;

async function availablePort() {
  const server = createServer();
  await new Promise((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveReady);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolveClosed, reject) => server.close(error => error ? reject(error) : resolveClosed()));
  if (port === null) throw new Error('Could not allocate a local test port.');
  return port;
}

function startServer(port) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: root,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const capture = chunk => { output = (output + chunk.toString()).slice(-16_000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  return { child, getOutput: () => output };
}

async function waitForHealth(base, processInfo) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (processInfo && (processInfo.child.exitCode !== null || processInfo.child.signalCode !== null)) {
      throw new Error(`Production server exited before becoming healthy.\n${processInfo.getOutput()}`);
    }
    try {
      const response = await fetch(new URL('/healthz', base), { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch { /* A fresh process may not have started listening yet. */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 150));
  }
  throw new Error(`Production server did not become healthy within ${timeoutMs} ms.\n${processInfo?.getOutput() ?? ''}`);
}

async function inspectHttp(base) {
  const health = await fetch(new URL('/healthz', base), { signal: AbortSignal.timeout(3_000) });
  const report = await health.json();
  if (health.status !== 200 || report.status !== 'ok') {
    throw new Error(`Unexpected /healthz response: ${health.status} ${JSON.stringify(report)}`);
  }

  const home = await fetch(new URL('/', base), { signal: AbortSignal.timeout(3_000) });
  const html = await home.text();
  if (home.status !== 200 || !home.headers.get('content-type')?.includes('text/html') || !html.includes('<html')) {
    throw new Error(`Homepage is not a valid HTML response (${home.status}).`);
  }

  const assetPaths = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g)].map(match => match[1]);
  if (!assetPaths.some(path => path.endsWith('.js')) || !assetPaths.some(path => path.endsWith('.css'))) {
    throw new Error('Homepage does not reference both built JavaScript and CSS assets.');
  }
  for (const path of new Set(assetPaths)) {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(5_000) });
    const body = await response.arrayBuffer();
    const expectedType = path.endsWith('.js') ? 'javascript' : 'text/css';
    if (response.status !== 200 || body.byteLength === 0 || !response.headers.get('content-type')?.includes(expectedType)) {
      throw new Error(`Built asset ${path} failed: ${response.status}, ${body.byteLength} bytes.`);
    }
  }
  return assetPaths.length;
}

async function inspectWebSocket(base) {
  const url = new URL('/ws', base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url);
  try {
    await new Promise((resolveHello, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket hello timed out.')), 5_000);
      const finish = error => {
        clearTimeout(timeout);
        socket.off('error', onError);
        socket.off('close', onClose);
        socket.off('message', onMessage);
        if (error) reject(error); else resolveHello();
      };
      const onError = error => finish(error);
      const onClose = () => finish(new Error('WebSocket closed before hello.'));
      const onMessage = bytes => {
        let message;
        try { message = JSON.parse(bytes.toString()); }
        catch { finish(new Error('WebSocket returned invalid JSON.')); return; }
        if (message.type !== 'hello') { finish(new Error(`Unexpected WebSocket reply: ${JSON.stringify(message)}`)); return; }
        finish();
      };
      socket.on('error', onError);
      socket.on('close', onClose);
      socket.on('message', onMessage);
      socket.once('open', () => socket.send(JSON.stringify({ type: 'hello', clientId: randomUUID() })));
    });
  } finally {
    socket.close();
  }
}

async function stopServer(processInfo) {
  const { child, getOutput } = processInfo;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const stopped = new Promise((resolveStopped, reject) => {
    child.once('exit', (code, signal) => code === 0 && signal === null
      ? resolveStopped()
      : reject(new Error(`Production server exited with ${code ?? signal}.\n${getOutput()}`)));
  });
  child.kill('SIGTERM');
  const forced = setTimeout(() => child.kill('SIGKILL'), 5_000);
  try { await stopped; }
  finally { clearTimeout(forced); }
}

async function main() {
  let processInfo = null;
  let base;
  if (externalUrl) {
    base = new URL(externalUrl);
  } else {
    const port = await availablePort();
    base = new URL(`http://127.0.0.1:${port}`);
    processInfo = startServer(port);
  }
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Smoke base URL must use HTTP or HTTPS.');
  try {
    await waitForHealth(base, processInfo);
    const assets = await inspectHttp(base);
    await inspectWebSocket(base);
    console.log(`Production smoke passed: ${base.origin} (/healthz, homepage, ${assets} assets, /ws hello).`);
  } finally {
    if (processInfo) await stopServer(processInfo);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
