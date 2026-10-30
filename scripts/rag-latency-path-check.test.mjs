import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./rag-latency-path-check.mjs', import.meta.url));

function exec(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CLARA_DEBUG_TOKEN: 'secret-fixture-token', ...env },
    });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', part => { stdout += part; });
    child.stderr.setEncoding('utf8').on('data', part => { stderr += part; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}
function fixture(status = 200) {
  const calls = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const part of request) body += part;
    calls.push({
      url: request.url, method: request.method,
      authorization: request.headers.authorization,
      query: JSON.parse(body).query,
    });
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      grounded: true, latencyMs: 17, timings: { retrievalMs: 11, embeddingMs: 0 },
      sources: [{ id: 'SENSITIVE-ID', snippet: 'PRIVATE DOCUMENT CONTENT' }],
    }));
  });
  return { server, calls };
}
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = server => new Promise(resolve => server.close(resolve));

test('comparative latency results exclude credentials and private evidence', async () => {
  const publicServer = fixture(), localServer = fixture();
  try {
    await listen(publicServer.server);
    await listen(localServer.server);
    const result = await exec([
      '--kb-id', 'PRIVATE-KB-ID', '--question', 'PRIVATE QUESTION',
      '--public-url', 'http://127.0.0.1:' + publicServer.server.address().port,
      '--local-url', 'http://127.0.0.1:' + localServer.server.address().port,
      '--warmup', '1', '--repeat', '2',
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(publicServer.calls.length, 3);
    assert.equal(localServer.calls.length, 3);
    for (const call of [...publicServer.calls, ...localServer.calls]) {
      assert.equal(call.url, '/api/rag/search');
      assert.equal(call.method, 'POST');
      assert.equal(call.authorization, 'Bearer secret-fixture-token');
      assert.equal(call.query, 'PRIVATE QUESTION');
    }
    assert.match(result.stdout, /public warmup\s+1: HTTP 200/);
    assert.match(result.stdout, /local\s+measure 2: HTTP 200/);
    assert.match(result.stdout, /backend p50 17ms p95 17ms/);
    assert.match(result.stdout, /client p50 \d+ms p95 \d+ms/);
    assert.doesNotMatch(result.stdout + result.stderr,
      /secret-fixture-token|PRIVATE QUESTION|PRIVATE-KB-ID|PRIVATE DOCUMENT CONTENT|SENSITIVE-ID/);
  } finally {
    await close(publicServer.server);
    await close(localServer.server);
  }
});

test('missing environment token fails safely without an interactive terminal', async () => {
  const r = await exec(['--kb-id', 'test-kb', '--question', 'q'], { CLARA_DEBUG_TOKEN: '' });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /CLARA_DEBUG_TOKEN is missing/);
  assert.doesNotMatch(r.stdout + r.stderr, /secret-fixture-token/);
});

test('rejects tokens on CLI and insecure remote endpoints', async () => {
  for (const flags of [
    ['--token', 'SHOULD-NOT-APPEAR'],
    ['--public-url', 'http://example.com'],
    ['--local-url', 'https://username:password@example.com'],
  ]) {
    const r = await exec(['--kb-id', 'test-kb', '--question', 'q', ...flags]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /Unknown option|bare HTTPS origin/);
    assert.doesNotMatch(r.stdout + r.stderr, /SHOULD-NOT-APPEAR|secret-fixture-token/);
  }
});

test('stops further quota use immediately on auth failure', async () => {
  const publicServer = fixture(401), localServer = fixture();
  try {
    await listen(publicServer.server);
    await listen(localServer.server);
    const r = await exec([
      '--kb-id', 'test-kb', '--question', 'q',
      '--public-url', 'http://127.0.0.1:' + publicServer.server.address().port,
      '--local-url', 'http://127.0.0.1:' + localServer.server.address().port,
      '--warmup', '1', '--repeat', '1',
    ]);
    assert.equal(r.code, 2);
    assert.equal(publicServer.calls.length, 1);
    assert.equal(localServer.calls.length, 0);
    assert.match(r.stderr, /Authorization denied/);
  } finally {
    await close(publicServer.server);
    await close(localServer.server);
  }
});
