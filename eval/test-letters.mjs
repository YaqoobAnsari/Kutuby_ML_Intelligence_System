/**
 * Letters endpoint evaluation harness.
 *
 * Sends real labeled clips from the merged letters dataset through the live
 * /verify_letter endpoint and scores predicted-vs-expected. This establishes the
 * model+endpoint accuracy ceiling on CLEAN audio — the contrast against the
 * ~12% pass rate on app-uploaded audio is the whole point.
 *
 * Usage:
 *   node eval/test-letters.mjs [N=100] [datasetDir] [endpoint]
 *
 * No npm deps — native fetch/FormData/Blob (Node 18+). Dataset folders are named
 * in MODEL-label space; the endpoint speaks FRONTEND labels, so we translate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const N = Number(process.argv[2] || 100);
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

/** Fisher–Yates shuffle (in place). */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Bounded-concurrency map. */
async function runPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return out;
}

// --- Build a balanced sample across the 28 letters --------------------------
const folders = fs
  .readdirSync(DATASET_DIR)
  .filter((d) => fs.statSync(path.join(DATASET_DIR, d)).isDirectory());
const perLetter = Math.max(1, Math.round(N / folders.length));
let sample = [];
for (const folder of folders) {
  const expected = MODEL_TO_FRONTEND[folder];
  if (!expected) {
    console.warn(`! unknown folder (no label mapping): ${folder} — skipping`);
    continue;
  }
  const files = shuffle(
    fs.readdirSync(path.join(DATASET_DIR, folder)).filter((f) => f.toLowerCase().endsWith('.wav')),
  ).slice(0, perLetter);
  for (const f of files) sample.push({ file: path.join(DATASET_DIR, folder, f), folder, expected });
}
sample = shuffle(sample).slice(0, N);
console.log(`Testing ${sample.length} clips across ${folders.length} letters against ${ENDPOINT}\n`);

// --- Send each clip ---------------------------------------------------------
let done = 0;
const results = await runPool(
  sample,
  async (item) => {
    const bytes = fs.readFileSync(item.file);
    const fd = new FormData();
    fd.append('audio', new Blob([bytes], { type: 'audio/wav' }), path.basename(item.file));
    fd.append('target_letter', item.expected);
    fd.append('threshold', THRESHOLD);
    fd.append('fixed_seconds', FIXED_SECONDS);
    const t0 = Date.now();
    try {
      const resp = await fetch(ENDPOINT, { method: 'POST', body: fd });
      const j = await resp.json();
      done++;
      if (done % 20 === 0) console.log(`  …${done}/${sample.length}`);
      return {
        expected: item.expected,
        predicted: j.predicted_letter ?? null,
        result: j.result === true,
        confidence: j.confidence ?? j.target_probability ?? null,
        latencyMs: Date.now() - t0,
        http: resp.status,
        error: j.error ?? null,
      };
    } catch (e) {
      done++;
      return { expected: item.expected, predicted: null, result: false, confidence: null, latencyMs: Date.now() - t0, http: 0, error: String(e) };
    }
  },
  CONCURRENCY,
);

// --- Score & report ---------------------------------------------------------
const valid = results.filter((r) => r.error === null && r.predicted !== null);
const correct = valid.filter((r) => r.predicted === r.expected);
const passed = valid.filter((r) => r.result);
const errors = results.filter((r) => r.error !== null || r.predicted === null);
const latencies = valid.map((r) => r.latencyMs).sort((a, b) => a - b);
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : '0.0') + '%';
const p = (q) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] : 0);

console.log('\n========== LETTERS ENDPOINT — RESULTS ==========');
console.log(`Tested:            ${results.length}  (valid ${valid.length}, errors ${errors.length})`);
console.log(`Top-1 accuracy:    ${correct.length}/${valid.length}  = ${pct(correct.length, valid.length)}  (predicted == target)`);
console.log(`Pass rate:         ${passed.length}/${valid.length}  = ${pct(passed.length, valid.length)}  (result=true, gate@${THRESHOLD})`);
console.log(`Latency ms:        p50=${p(0.5)}  p90=${p(0.9)}  max=${latencies[latencies.length - 1] ?? 0}`);

const perLetterStat = {};
for (const r of valid) {
  const s = (perLetterStat[r.expected] ??= { n: 0, ok: 0 });
  s.n++; if (r.predicted === r.expected) s.ok++;
}
console.log('\nPer-letter top-1 accuracy:');
for (const [lab, s] of Object.entries(perLetterStat).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)) {
  console.log(`  ${lab.padEnd(6)} ${String(s.ok).padStart(2)}/${String(s.n).padStart(2)}  ${pct(s.ok, s.n)}`);
}

const confusion = {};
for (const r of valid) {
  if (r.predicted !== r.expected) {
    const k = `${r.expected} -> ${r.predicted}`;
    confusion[k] = (confusion[k] || 0) + 1;
  }
}
const topConf = Object.entries(confusion).sort((a, b) => b[1] - a[1]).slice(0, 12);
if (topConf.length) {
  console.log('\nTop misclassifications (expected -> predicted):');
  for (const [k, c] of topConf) console.log(`  ${k}  x${c}`);
}

// --- Persist a CSV ----------------------------------------------------------
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results');
fs.mkdirSync(outDir, { recursive: true });
const csvPath = path.join(outDir, `letters-${results.length}.csv`);
const csv = ['expected,predicted,correct,result,confidence,latency_ms,http,error']
  .concat(results.map((r) => [r.expected, r.predicted ?? '', r.predicted === r.expected, r.result, r.confidence ?? '', r.latencyMs, r.http, (r.error ?? '').replace(/,/g, ';')].join(',')))
  .join('\n');
fs.writeFileSync(csvPath, csv);
console.log(`\nPer-clip CSV written: ${csvPath}`);
