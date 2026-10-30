#!/usr/bin/env node
/**
 * Compare Clara's authenticated RAG public HTTPS and localhost HTTP paths.
 * Nothing writes credentials, questions, source IDs, or response bodies to disk.
 * Every request uses retrieval quota and records a search audit event.
 * Requires Node.js >=20.
 */
const HELP = [
  'Usage: node scripts/rag-latency-path-check.mjs --kb-id ID --question TEXT [options]',
  '  --public-url URL   HTTPS origin, default https://clara.ai.amazetechclans.com',
  '  --local-url URL    Loopback origin, default http://127.0.0.1:4000',
  '  --scope S         draft (default) or live',
  '  --mode M          agentic (default), classic or hybrid',
  '  --top-k N         1..20, default 6',
  '  --warmup N        0..3, default 1 per origin',
  '  --repeat N        1..10, default 3 per origin',
  '  --timeout-ms N    1000..300000, default 90000',
  '  --help            Print usage',
  '',
  'Authentication: CLARA_DEBUG_TOKEN environment variable, or secure hidden',
  'terminal prompt. Never pass the token on the command line.',
  'HTTP round trip includes network/proxy/auth and JSON download; backend',
  'latency is Clara grounding only. No snippets or credentials are printed.',
].join('\n');

const defaults = {
  publicUrl: 'https://clara.ai.amazetechclans.com',
  localUrl: 'http://127.0.0.1:4000',
  scope: 'draft', mode: 'agentic', topK: 6,
  warmup: 1, repeat: 3, timeoutMs: 90000,
};
function argsOf(argv) {
  const opts = { ...defaults };
  const fields = {
    '--public-url': 'publicUrl', '--local-url': 'localUrl',
    '--kb-id': 'kbId', '--question': 'question',
    '--scope': 'scope', '--mode': 'mode', '--top-k': 'topK',
    '--warmup': 'warmup', '--repeat': 'repeat', '--timeout-ms': 'timeoutMs',
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (!Object.hasOwn(fields, flag)) throw new Error('Unknown option: ' + flag);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('Missing value for ' + flag);
    opts[fields[flag]] = value;
  }
  if (!opts.kbId?.trim()) throw new Error('--kb-id is required');
  if (!opts.question?.trim()) throw new Error('--question is required');
  if (!['draft', 'live'].includes(opts.scope)) throw new Error('Invalid --scope');
  if (!['agentic', 'classic', 'hybrid'].includes(opts.mode)) throw new Error('Invalid --mode');
  for (const [key, min, max] of [
    ['topK', 1, 20], ['warmup', 0, 3], ['repeat', 1, 10], ['timeoutMs', 1000, 300000],
  ]) {
    const num = Number(opts[key]);
    if (!Number.isSafeInteger(num) || num < min || num > max)
      throw new Error('Invalid numeric option ' + key + ' (expected ' + min + '..' + max + ')');
    opts[key] = num;
  }
  for (const key of ['publicUrl', 'localUrl']) {
    let u;
    try { u = new URL(opts[key]); }
    catch { throw new Error(key + ' must be a valid origin'); }
    const isLocal = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
    if (u.username || u.password || u.search || u.hash || u.pathname !== '/' ||
        (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLocal)))
      throw new Error(key + ' must be a bare HTTPS origin (HTTP only on loopback)');
    opts[key] = u.origin;
  }
  return opts;
}

function hiddenToken() {
  const stdin = process.stdin;
  if (!stdin.isTTY || !process.stdout.isTTY || typeof stdin.setRawMode !== 'function')
    throw new Error('CLARA_DEBUG_TOKEN is missing: use an interactive terminal for hidden token entry, or export it in this shell.');
  return new Promise((resolve, reject) => {
    const originalRaw = Boolean(stdin.isRaw);
    let token = '';
    let finished = false;
    function cleanup() {
      stdin.off('data', onData);
      stdin.setRawMode(originalRaw);
      stdin.pause();
      process.stdout.write('\n');
    }
    function finish(err) {
      if (finished) return;
      finished = true;
      cleanup();
      if (err) reject(err);
      else if (!token.trim()) reject(new Error('Token cannot be empty'));
      else resolve(token.trim());
    }
    function onData(chunk) {
      for (const c of chunk.toString('utf8')) {
        if (c === '\n' || c === '\r') { finish(); return; }
        if (c === '\u0003' || c === '\u0004') { finish(new Error('Token entry cancelled')); return; }
        if (c === '\u007f' || c === '\b') { token = token.slice(0, -1); continue; }
        if (c >= ' ' && c <= '~') token += c;
        if (token.length > 8192) { finish(new Error('Token is too long')); return; }
      }
    }
    try {
      // Prevent fast-paste echo by enabling hidden input BEFORE the prompt.
      stdin.setRawMode(true);
      stdin.on('data', onData);
      stdin.resume();
      process.stdout.write('Clara access token (hidden input): ');
    } catch (error) { finish(error); }
  });
}

const showMs = n => Number.isFinite(n) ? String(Math.round(n)) + 'ms' : 'n/a';
function summary(values) {
  const numbers = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const at = fraction => {
    const p = (numbers.length - 1) * fraction;
    const lo = Math.floor(p), hi = Math.ceil(p);
    return Math.round(numbers[lo] + (numbers[hi] - numbers[lo]) * (p - lo));
  };
  return { p50: at(.5), p95: at(.95) };
}
async function probe(origin, token, body, timeoutMs) {
  const start = performance.now();
  try {
    const response = await fetch(origin + '/api/rag/search', {
      method: 'POST', redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: /^Bearer\s/i.test(token) ? token : 'Bearer ' + token,
      },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    // No raw server messages (they may contain sensitive document text).
    const data = response.headers.get('content-type')?.includes('application/json')
      ? await response.json().catch(() => null) : null;
    const sources = Array.isArray(data?.sources) ? data.sources.length : 0;
    return {
      status: response.status, clientMs: Math.round(performance.now() - start),
      backendMs: typeof data?.latencyMs === 'number' ? data.latencyMs : null,
      retrievalMs: typeof data?.timings?.retrievalMs === 'number' ? data.timings.retrievalMs : null,
      embeddingMs: typeof data?.timings?.embeddingMs === 'number' ? data.timings.embeddingMs : null,
      sources, grounded: data?.grounded === true,
      ok: response.ok && data?.grounded === true && Array.isArray(data?.sources),
    };
  } catch (err) {
    return {
      status: 'network-error', clientMs: Math.round(performance.now() - start),
      backendMs: null, retrievalMs: null, embeddingMs: null,
      sources: 0, grounded: false, ok: false,
      reason: err?.name === 'TimeoutError' ? 'timeout' : 'network',
    };
  }
}
async function run(opts, token) {
  const body = {
    kbId: opts.kbId, query: opts.question, scope: opts.scope,
    ragMode: opts.mode, topK: opts.topK, channel: 'chat',
  };
  const targets = [
    { label: 'public', origin: opts.publicUrl },
    { label: 'local', origin: opts.localUrl },
  ];
  const measurements = { public: [], local: [] };
  let failures = 0;
  const total = opts.warmup + opts.repeat;
  console.log('Comparing public HTTPS and loopback: ' + opts.warmup + ' warmup + ' + opts.repeat +
    ' measured per origin (' + 2 * total + ' requests total). Each request consumes quota and an audit event.');
  for (let pass = 0; pass < total; pass++) {
    const warm = pass < opts.warmup;
    // Alternate the first target to limit order-related bias on warm runs.
    const ordered = pass % 2 ? [...targets].reverse() : targets;
    for (const target of ordered) {
      const result = await probe(target.origin, token, body, opts.timeoutMs);
      console.log(target.label.padEnd(6) + ' ' + (warm ? 'warmup ' : 'measure') + ' ' +
        String(warm ? pass + 1 : pass - opts.warmup + 1) +
        ': HTTP ' + result.status +
        ' | client ' + showMs(result.clientMs) +
        ' | backend ' + showMs(result.backendMs) +
        ' | retrieval ' + showMs(result.retrievalMs) +
        ' | embedding ' + showMs(result.embeddingMs) +
        ' | hits ' + result.sources + ' | grounded ' + result.grounded +
        (result.reason ? ' | ' + result.reason : ''));
      if (!result.ok) failures++;
      if (!warm && result.ok) measurements[target.label].push(result);
      if (result.status === 401 || result.status === 403) {
        console.error('Authorization denied: stopping further requests.');
        process.exitCode = 2;
        return;
      }
    }
  }
  console.log('\nMeasured results (warmups excluded):');
  for (const target of targets) {
    const entries = measurements[target.label];
    const client = summary(entries.map(e => e.clientMs));
    const backend = summary(entries.map(e => e.backendMs));
    console.log(target.label + ' ' + entries.length + '/' + opts.repeat + ' passed | client p50 ' +
      showMs(client?.p50) + ' p95 ' + showMs(client?.p95) +
      ' | backend p50 ' + showMs(backend?.p50) + ' p95 ' + showMs(backend?.p95));
  }
  if (failures) process.exitCode = 2;
}
async function main() {
  const opts = argsOf(process.argv.slice(2));
  if (opts.help) { console.log(HELP); return; }
  const token = process.env.CLARA_DEBUG_TOKEN?.trim() || await hiddenToken();
  await run(opts, token);
}
main().catch(error => {
  // Only our own validation message; never print request/response content.
  console.error('Latency diagnostic failed: ' + error.message);
  process.exitCode = 1;
});
