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


test('auth-only preflight checks both origins without RAG quota or leaking identity', async () => {
  const calls = [];
  const createAuthServer = (status, error) => createServer((req, res) => {
    calls.push({ url: req.url, method: req.method, auth: req.headers.authorization, status });
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(status === 200
      ? { user: { email: 'PRIVATE-EMAIL', id: 'PRIVATE-USER' }, session: { id: 'PRIVATE-SESSION' } }
      : { error, privateDetail: 'PRIVATE-ERROR-DETAIL' }));
  });
  const publicServer = createAuthServer(403, 'Account is suspended');
  const localServer = createAuthServer(200);
  try {
    await listen(publicServer);
    await listen(localServer);
    const r = await exec([
      '--auth-only',
      '--public-url', 'http://127.0.0.1:' + publicServer.address().port,
      '--local-url', 'http://127.0.0.1:' + localServer.address().port,
    ]);
    assert.equal(r.code, 2);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(c => c.url === '/api/auth/me' && c.method === 'GET'));
    assert.ok(calls.every(c => c.auth === 'Bearer secret-fixture-token'));
    assert.match(r.stdout, /public auth: HTTP 403/);
    assert.match(r.stdout, /reason: account suspended/);
    assert.match(r.stdout, /local\s+auth: HTTP 200/);
    assert.match(r.stdout, /session valid/);
    assert.doesNotMatch(r.stdout + r.stderr,
      /secret-fixture-token|PRIVATE-EMAIL|PRIVATE-USER|PRIVATE-SESSION|PRIVATE-ERROR-DETAIL/);
  } finally {
    await close(publicServer);
    await close(localServer);
  }
});

test('auth-only success performs only GET /api/auth/me on each origin', async () => {
  const seen = [];
  const authServer = createServer((req, res) => {
    seen.push(req.url + ':' + req.method);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ user: { id: 'private' } }));
  });
  try {
    await listen(authServer);
    const origin = 'http://127.0.0.1:' + authServer.address().port;
    const r = await exec(['--auth-only', '--public-url', origin, '--local-url', origin]);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(seen, ['/api/auth/me:GET', '/api/auth/me:GET']);
    assert.match(r.stdout, /public auth: HTTP 200/);
    assert.match(r.stdout, /local\s+auth: HTTP 200/);
    assert.doesNotMatch(r.stdout, /private/);
  } finally {
    await close(authServer);
  }
});

test('RAG 403 diagnoses a missing draft permission without echoing response bodies', async () => {
  const seen = [];
  const publicServer = createServer((req, res) => {
    seen.push(req.url);
    req.resume();
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Forbidden — requires permission: kb:update',
      privatePayload: 'PRIVATE DOCUMENT CONTENT',
    }));
  });
  const localServer = fixture();
  try {
    await listen(publicServer);
    await listen(localServer.server);
    const r = await exec([
      '--kb-id', 'private-kb', '--question', 'private-question',
      '--public-url', 'http://127.0.0.1:' + publicServer.address().port,
      '--local-url', 'http://127.0.0.1:' + localServer.server.address().port,
      '--warmup', '0', '--repeat', '2',
    ]);
    assert.equal(r.code, 2);
    assert.deepEqual(seen, ['/api/rag/search']);
    assert.equal(localServer.calls.length, 0);
    assert.match(r.stdout, /reason: KB draft edit permission missing/);
    assert.match(r.stderr, /Use --auth-only/);
    assert.doesNotMatch(r.stdout + r.stderr, /PRIVATE DOCUMENT CONTENT|private-question|private-kb/);
  } finally {
    await close(publicServer);
    await close(localServer.server);
  }
});


test('auth-only explicit warmup and repeats measure both origins without RAG calls', async () => {
  const calls = [];
  const serverA = createServer((req, res) => {
    calls.push({ origin: 'A', method: req.method, path: req.url });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ user: { id: 'private-a' } }));
  });
  const serverB = createServer((req, res) => {
    calls.push({ origin: 'B', method: req.method, path: req.url });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ user: { id: 'private-b' } }));
  });
  try {
    await listen(serverA);
    await listen(serverB);
    const r = await exec([
      '--auth-only', '--warmup', '1', '--repeat', '3',
      '--public-url', 'http://127.0.0.1:' + serverA.address().port,
      '--local-url', 'http://127.0.0.1:' + serverB.address().port,
    ]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(calls.length, 8);
    assert.equal(calls.filter(c => c.origin === 'A').length, 4);
    assert.equal(calls.filter(c => c.origin === 'B').length, 4);
    assert.ok(calls.every(c => c.method === 'GET' && c.path === '/api/auth/me'));
    assert.match(r.stdout, /Authentication samples: 1 warmup \+ 3 measured per origin/);
    assert.match(r.stdout, /public auth warmup 1: HTTP 200/);
    assert.match(r.stdout, /local\s+auth measure 3: HTTP 200/);
    assert.match(r.stdout, /public 3\/3 passed \| p50 \d+ms p95 \d+ms/);
    assert.match(r.stdout, /local 3\/3 passed \| p50 \d+ms p95 \d+ms/);
    assert.doesNotMatch(r.stdout, /private-a|private-b|secret-fixture-token/);
  } finally {
    await close(serverA);
    await close(serverB);
  }
});
