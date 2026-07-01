/**
 * Letters endpoint evaluation harness — FULL-TRANSPARENCY edition.
 *
 * Sends real labeled clips from the merged letters dataset through the live
 * /verify_letter endpoint and records EVERYTHING: the exact request, the full
 * raw JSON response (incl. the 28-class probability distribution), the scoring,
 * and both server-compute and client round-trip latency.
 *
 * Usage:  node eval/test-letters.mjs [N=140] [datasetDir] [endpoint]
 *
 * Writes three artifacts to eval/reports/ (committed):
 *   - letters-report.md    human-readable full breakdown
 *   - letters-detail.csv    one row per clip (flattened, incl. top-3 classes)
 *   - letters-raw.jsonl     one line per clip: request + FULL raw response
 *
 * No npm deps — native fetch/FormData/Blob (Node 18+). Run from the repo root.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const N = Number(process.argv[2] || 140);
const DATASET_DIR =
  process.argv[3] ||
  'C:/Users/ansar/Desktop/Workstation/Kutuby/arabic-letters-realtime/Dataset_merged';
const ENDPOINT =
  process.argv[4] || 'https://arabic-letters-api-d26k2plh4q-ew.a.run.app/verify_letter';
const THRESHOLD = '0.6';
const FIXED_SECONDS = '1.0';
const CONCURRENCY = 5;

/** model-label (dataset folder) -> frontend label (what the API expects/returns). */
const MODEL_TO_FRONTEND = {
  Aain: 'Ayn', Alif: 'Alif', Ba: 'Baa', Dal: 'Dal', Daud: 'Dhaad', Faa: 'Faa',
  Ghain: 'Ghayn', Haa: 'Ha', Hha: 'Haa', Jeem: 'Jeem', Kaaf: 'Kaaf', Kha: 'Khaa',
  Laam: 'Laam', Meem: 'Meem', Noon: 'Noon', Qauf: 'Qaaf', Raa: 'Raa', Saa: 'Thaa',
  Saud: 'Saad', Seen: 'Seen', Sheen: 'Sheen', Ta: 'Taa', Tua: 'Toh', Wao: 'Waw',
  Yaa: 'Ya', Zaa: 'Zay', Zhal: 'Dhah', Zua: 'Thal',
};

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

async function runPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let idx = 0;
  const next = async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return out;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const topk = (probs, k = 3) =>
  probs && typeof probs === 'object'
    ? Object.entries(probs).filter(([, p]) => typeof p === 'number').sort((a, b) => b[1] - a[1]).slice(0, k)
    : [];
function statOf(arr) {
  if (!arr.length) return { min: 0, mean: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return {
    min: s[0], mean: Math.round(s.reduce((a, b) => a + b, 0) / s.length),
    p50: q(0.5), p90: q(0.9), p95: q(0.95), p99: q(0.99), max: s[s.length - 1],
  };
}
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : '0.0') + '%';

// --- Build a balanced sample across the 28 letters --------------------------
const folders = fs.readdirSync(DATASET_DIR).filter((d) => fs.statSync(path.join(DATASET_DIR, d)).isDirectory());
const perLetter = Math.max(1, Math.round(N / folders.length));
let sample = [];
for (const folder of folders) {
  const expected = MODEL_TO_FRONTEND[folder];
  if (!expected) { console.warn(`! no label mapping for folder ${folder}`); continue; }
  const files = shuffle(fs.readdirSync(path.join(DATASET_DIR, folder)).filter((f) => f.toLowerCase().endsWith('.wav'))).slice(0, perLetter);
  for (const f of files) sample.push({ file: path.join(DATASET_DIR, folder, f), folder, expected });
}
sample = shuffle(sample).slice(0, N);
console.log(`Testing ${sample.length} clips across ${folders.length} letters against\n  ${ENDPOINT}\n`);

// --- Send each clip, capture EVERYTHING -------------------------------------
let done = 0;
const rows = await runPool(sample, async (item, i) => {
  const bytes = fs.readFileSync(item.file);
  const fd = new FormData();
  fd.append('audio', new Blob([bytes], { type: 'audio/wav' }), path.basename(item.file));
  fd.append('target_letter', item.expected);
  fd.append('threshold', THRESHOLD);
  fd.append('fixed_seconds', FIXED_SECONDS);
  const t0 = Date.now();
  let response = null, http = 0, error = null;
  try {
    const resp = await fetch(ENDPOINT, { method: 'POST', body: fd });
    http = resp.status;
    response = await resp.json();
  } catch (e) { error = String(e); }
  const clientMs = Date.now() - t0;
  done++;
  if (done % 20 === 0) console.log(`  …${done}/${sample.length}`);
  const r = response || {};
  const t3 = topk(r.all_probabilities, 3);
  return {
    idx: i,
    file: item.file,
    basename: path.basename(item.file),
    fileSizeBytes: bytes.length,
    expected: item.expected,
    request: { target_letter: item.expected, threshold: THRESHOLD, fixed_seconds: FIXED_SECONDS, audio_field: 'audio' },
    http,
    error: error ?? r.error ?? null,
    clientRoundTripMs: clientMs,
    serverProcessingMs: num(r.processing_time_ms) ?? num(r.latency_ms),
    predicted: r.predicted_letter ?? null,
    correct: r.predicted_letter === item.expected,
    result: r.result === true,
    targetProbability: num(r.target_probability),
    predictedProbability: num(r.predicted_probability),
    runnerUpProbability: num(r.runner_up_probability),
    confidence: num(r.confidence),
    noSpeech: r?.extraction_metadata?.no_speech ?? null,
    top3: t3,
    message: r.message ?? null,
    rawResponse: response,
  };
}, CONCURRENCY);

// --- Aggregate --------------------------------------------------------------
const valid = rows.filter((r) => r.error === null && r.predicted !== null);
const correct = valid.filter((r) => r.correct);
const passed = valid.filter((r) => r.result);
const failed = valid.filter((r) => !r.correct);
const errored = rows.filter((r) => r.error !== null || r.predicted === null);
const clientLat = statOf(valid.map((r) => r.clientRoundTripMs));
const serverLat = statOf(valid.map((r) => r.serverProcessingMs).filter((v) => v !== null));

const perLetterStat = {};
for (const r of valid) {
  const s = (perLetterStat[r.expected] ??= { n: 0, ok: 0, lat: [] });
  s.n++; if (r.correct) s.ok++; s.lat.push(r.clientRoundTripMs);
}

// --- Write artifacts --------------------------------------------------------
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'reports');
fs.mkdirSync(outDir, { recursive: true });

// raw JSONL (request + full raw response per clip)
fs.writeFileSync(
  path.join(outDir, 'letters-raw.jsonl'),
  rows.map((r) => JSON.stringify({ idx: r.idx, file: r.file, expected: r.expected, request: r.request, http: r.http, clientRoundTripMs: r.clientRoundTripMs, response: r.rawResponse })).join('\n') + '\n',
);

// detail CSV
const csvHeader = 'idx,basename,expected,predicted,correct,result,target_probability,predicted_probability,runner_up_probability,confidence,top1,top1_p,top2,top2_p,top3,top3_p,server_ms,client_ms,http,file_bytes';
const csvRows = rows.map((r) => [
  r.idx, r.basename, r.expected, r.predicted ?? '', r.correct, r.result,
  r.targetProbability ?? '', r.predictedProbability ?? '', r.runnerUpProbability ?? '', r.confidence ?? '',
  r.top3[0]?.[0] ?? '', r.top3[0]?.[1]?.toFixed(4) ?? '', r.top3[1]?.[0] ?? '', r.top3[1]?.[1]?.toFixed(4) ?? '',
  r.top3[2]?.[0] ?? '', r.top3[2]?.[1]?.toFixed(4) ?? '', r.serverProcessingMs ?? '', r.clientRoundTripMs, r.http, r.fileSizeBytes,
].join(','));
fs.writeFileSync(path.join(outDir, 'letters-detail.csv'), [csvHeader, ...csvRows].join('\n'));

// human report
const fmtTop3 = (t3) => t3.map(([l, p]) => `${l} ${(p * 100).toFixed(1)}%`).join(', ');
let md = '';
md += `# Letters endpoint — evaluation report\n\n`;
md += `Generated by \`eval/test-letters.mjs\` (run from Australia → europe-west1).\n\n`;
md += `## Request contract (exactly what we sent)\n\n`;
md += `- **Endpoint:** \`POST ${ENDPOINT}\`\n`;
md += `- **Body:** \`multipart/form-data\` with fields: \`audio\` (the .wav file), \`target_letter\` (expected frontend label), \`threshold=${THRESHOLD}\`, \`fixed_seconds=${FIXED_SECONDS}\`\n`;
md += `- **Dataset:** \`${DATASET_DIR}\` — folders are *model* labels; sent as *frontend* labels via the serve mapping.\n`;
md += `- **Sampling:** ${sample.length} clips, ~${perLetter} per letter, random within each of ${folders.length} folders.\n`;
md += `- **Scoring:** top-1 correct = \`response.predicted_letter === expected\`; pass = \`response.result === true\` (gate@${THRESHOLD}).\n\n`;
md += `## Summary\n\n`;
md += `| Metric | Value |\n|---|---|\n`;
md += `| Clips tested | ${rows.length} (valid ${valid.length}, errored ${errored.length}) |\n`;
md += `| **Top-1 accuracy** | **${correct.length}/${valid.length} = ${pct(correct.length, valid.length)}** |\n`;
md += `| **Pass rate** (result=true) | **${passed.length}/${valid.length} = ${pct(passed.length, valid.length)}** |\n`;
md += `| Misclassified | ${failed.length} |\n`;
md += `| **Client round-trip ms** (AU→EU) | min ${clientLat.min} · p50 ${clientLat.p50} · p90 ${clientLat.p90} · p95 ${clientLat.p95} · max ${clientLat.max} · mean ${clientLat.mean} |\n`;
md += `| **Server compute ms** (model only) | min ${serverLat.min} · p50 ${serverLat.p50} · p90 ${serverLat.p90} · p95 ${serverLat.p95} · max ${serverLat.max} · mean ${serverLat.mean} |\n\n`;
md += `> Network overhead ≈ client − server ≈ **${clientLat.p50 - serverLat.p50} ms** at the median (the Australia→Europe hop).\n\n`;
md += `## Per-letter accuracy\n\n| Letter | Correct | Accuracy | Mean client ms |\n|---|---|---|---|\n`;
for (const [lab, s] of Object.entries(perLetterStat).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n || a[0].localeCompare(b[0]))) {
  md += `| ${lab} | ${s.ok}/${s.n} | ${pct(s.ok, s.n)} | ${Math.round(s.lat.reduce((x, y) => x + y, 0) / s.lat.length)} |\n`;
}
md += `\n## Every misclassification (full detail)\n\n`;
if (!failed.length) md += `_None._\n`;
else {
  md += `| file | expected | predicted | target prob | top-3 (class: prob) | server ms |\n|---|---|---|---|---|---|\n`;
  for (const r of failed) md += `| ${r.basename} | ${r.expected} | ${r.predicted} | ${r.targetProbability != null ? (r.targetProbability * 100).toFixed(1) + '%' : '?'} | ${fmtTop3(r.top3)} | ${r.serverProcessingMs ?? '?'} |\n`;
}
md += `\n## Errors\n\n`;
md += errored.length ? errored.map((r) => `- ${r.basename}: http=${r.http} ${r.error}`).join('\n') + '\n' : `_None._\n`;
md += `\n## Example — one FULL raw response\n\nExactly what the endpoint returned for the first clip (all fields, incl. the 28-class distribution):\n\n\`\`\`json\n${JSON.stringify(rows[0]?.rawResponse, null, 2)}\n\`\`\`\n`;
fs.writeFileSync(path.join(outDir, 'letters-report.md'), md);

// --- Console echo -----------------------------------------------------------
console.log('\n========== SUMMARY ==========');
console.log(`Endpoint:        ${ENDPOINT}`);
console.log(`Clips:           ${rows.length} (valid ${valid.length}, errors ${errored.length})`);
console.log(`Top-1 accuracy:  ${correct.length}/${valid.length} = ${pct(correct.length, valid.length)}`);
console.log(`Pass rate:       ${passed.length}/${valid.length} = ${pct(passed.length, valid.length)}`);
console.log(`Client ms (AU→EU): p50=${clientLat.p50} p90=${clientLat.p90} p95=${clientLat.p95} max=${clientLat.max} mean=${clientLat.mean}`);
console.log(`Server ms (model): p50=${serverLat.p50} p90=${serverLat.p90} max=${serverLat.max} mean=${serverLat.mean}`);
console.log(`Network overhead ≈ ${clientLat.p50 - serverLat.p50}ms (median)`);
console.log(`Misclassified:   ${failed.length}`);
for (const r of failed) console.log(`   ${r.basename}: ${r.expected} -> ${r.predicted} (target ${r.targetProbability != null ? (r.targetProbability * 100).toFixed(1) + '%' : '?'}; top3: ${fmtTop3(r.top3)})`);
console.log(`\nArtifacts written to eval/reports/:`);
console.log(`  letters-report.md   (full breakdown)`);
console.log(`  letters-detail.csv  (${rows.length} rows, top-3 per clip)`);
console.log(`  letters-raw.jsonl   (${rows.length} full raw responses)`);
