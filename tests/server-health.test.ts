import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { describe, expect, it } from 'vitest';
import { createRoomServer, listenOptionsFromEnv } from '../server/index';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('production HTTP and process lifecycle', () => {
  it('validates PORT and HOST before listening', () => {
    expect(listenOptionsFromEnv({})).toEqual({ port: 8787, host: '0.0.0.0' });
    expect(listenOptionsFromEnv({ PORT: '0', HOST: '127.0.0.1' })).toEqual({ port: 0, host: '127.0.0.1' });
    expect(listenOptionsFromEnv({ PORT: '65535', HOST: 'localhost' }).port).toBe(65535);
    for (const value of ['', '-1', '1.5', '65536', 'Infinity', ' 80']) {
      expect(() => listenOptionsFromEnv({ PORT: value }), value).toThrow('PORT');
    }
    expect(() => listenOptionsFromEnv({ HOST: ' ' })).toThrow('HOST');
  });

  it('reports build readiness, serves HEAD without a body, and keeps static paths inside dist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'prism-health-'));
    const outside = join(tmpdir(), `prism-secret-${Date.now()}.txt`);
    const server = await createRoomServer({ port: 0, host: '127.0.0.1', distDir: dir });
    const base = `http://127.0.0.1:${server.port}`;
    try {
      const unready = await fetch(`${base}/healthz`);
      expect(unready.status).toBe(503);
      expect(await unready.json()).toEqual({ status: 'unavailable' });
      await writeFile(join(dir, 'index.html'), '<!doctype html><title>Ready</title>');
      const ready = await fetch(`${base}/healthz`);
      expect(ready.status).toBe(200);
      expect(ready.headers.get('cache-control')).toBe('no-store');
      expect(await ready.json()).toEqual({ status: 'ok' });
      const head = await fetch(`${base}/healthz`, { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe('');
      const page = await fetch(base);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('<title>Ready</title>');
      await writeFile(outside, 'secret');
      await symlink(outside, join(dir, 'leak.txt'));
      expect((await fetch(`${base}/leak.txt`)).status).toBe(404);
      expect((await fetch(`${base}/ws`)).status).toBe(426);
    } finally {
      await server.close();
      await rm(dir, { recursive: true, force: true });
      await rm(outside, { force: true });
    }
  });

  it('contains a socket error and closes active connections cleanly', async () => {
    const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
    const client = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    try {
      await once(client, 'open');
      const peer = [...server.wss.clients][0];
      expect(peer).toBeDefined();
      const closed = once(client, 'close');
      peer.emit('error', new Error('synthetic peer failure'));
      await closed;
      expect(server.httpServer.listening).toBe(true);
      await Promise.all([server.close(), server.close()]);
      expect(server.httpServer.listening).toBe(false);
    } finally {
      client.terminate();
      await server.close();
    }
  });

  it('notifies room members before the server closes their WebSocket connections', async () => {
    const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
    const client = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    try {
      await once(client, 'open');
      client.send(JSON.stringify({ type: 'hello', clientId: '12345678-1234-4234-8234-123456789abc' }));
      expect(JSON.parse(String((await once(client, 'message'))[0])).type).toBe('hello');
      client.send(JSON.stringify({ type: 'create', profile: { name: '测试', color: '#D55B48', shape: 'circle', personality: 'balanced' },
        config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed: 1 } }));
      expect(JSON.parse(String((await once(client, 'message'))[0])).type).toBe('room');
      const left = once(client, 'message');
      const closed = once(client, 'close');
      await server.close();
      expect(JSON.parse(String((await left)[0]))).toEqual({ type: 'left' });
      await closed;
      expect(server.httpServer.listening).toBe(false);
    } finally {
      client.terminate();
      await server.close();
    }
  });

  it('honors environment port binding and exits after SIGTERM', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', join(ROOT, 'server/index.ts')], {
      cwd: ROOT, env: { ...process.env, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    try {
      const started = await new Promise<number>((done, fail) => {
        const timeout = setTimeout(() => { cleanup(); fail(new Error(`server did not start: ${stderr}`)); }, 5000);
        const cleanup = () => { clearTimeout(timeout); child.stdout.off('data', check); child.off('exit', exited); };
        const check = () => {
          const match = stdout.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
          if (match) { cleanup(); done(Number(match[1])); }
        };
        const exited = (code: number | null) => { cleanup(); fail(new Error(stderr || `exit ${code}`)); };
        child.stdout.on('data', check);
        child.once('exit', exited);
        check();
      });
      const health = await fetch(`http://127.0.0.1:${started}/healthz`);
      expect([200, 503]).toContain(health.status);
      child.kill('SIGTERM');
      const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((done, fail) => {
        const timeout = setTimeout(() => { child.off('exit', exited); fail(new Error('SIGTERM shutdown timed out')); }, 5000);
        const exited = (code: number | null, signal: NodeJS.Signals | null) => { clearTimeout(timeout); done([code, signal]); };
        child.once('exit', exited);
      });
      expect({ code, signal }).toEqual({ code: 0, signal: null });
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }, 12_000);
});
