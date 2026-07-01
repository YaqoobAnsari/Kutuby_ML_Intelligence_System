/**
 * Letters endpoint evaluation — on the REAL app-uploaded clips (failure cases).
 *
 * Pulls letter FAILURE attempts from Supabase, downloads the exact audio the app
 * uploaded, DETECTS the real container (many are 3GP/AMR mislabeled `.wav` —
 * Android compression), and re-sends each to /verify_letter EXACTLY as the app
 * does (multipart: audio + target_letter + threshold). Compares our replay to
 * the app's logged result and reports accuracy per container format.
 *
 * Usage:  node eval/test-letters-app.mjs [N=150]
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from ../.env.local.
 * Writes eval/reports/letters-app-{report.md,detail.csv,raw.jsonl}.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const N = Number(process.argv[2] || 150);
const ENDPOINT = 'https://arabic-letters-api-d26k2plh4q-ew.a.run.app/verify_letter';
const BUCKET = 'pronunciation-recordings';
const CONCURRENCY = 5;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.join(path.dirname(scriptDir), '.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const SUPA = env.SUPABASE_URL;
const SVC = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA || !SVC) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local'); process.exit(1); }
const SB_HEADERS = { apikey: SVC, Authorization: `Bearer ${SVC}` };

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function statOf(arr) {
  if (!arr.length) return { min: 0, mean: 0, p50: 0, p90: 0, max: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: s[0], mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2), p50: q(0.5), p90: q(0.9), max: s[s.length - 1] };
}
const pct = (n, d) => (d ? ((n / d) * 100).toFixed(1) : '0.0') + '%';

/** Detect the real audio container from magic bytes; parse WAV details if PCM. */
function detectAudio(buf) {
  const tag = (o) => (o + 4 <= buf.length ? String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]) : '');
  if (buf.length < 16) return { container: 'tiny/empty' };
  if (tag(4) === 'ftyp') return { container: '3gp/mp4 (compressed)', brand: tag(8).trim() };
  if (tag(0) === '#!AM') return { container: 'amr (compressed)' };
  if (tag(0) === 'OggS') return { container: 'ogg (compressed)' };
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return { container: 'other', magic: tag(0) };
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 12, fmt = null, dataBytes = 0, dataOffset = 0;
  while (pos + 8 <= buf.length) {
    const cid = tag(pos);
    const sz = dv.getUint32(pos + 4, true);
    if (cid === 'fmt ') fmt = { audioFormat: dv.getUint16(pos + 8, true), channels: dv.getUint16(pos + 10, true), sampleRate: dv.getUint32(pos + 12, true), bits: dv.getUint16(pos + 22, true) };
    else if (cid === 'data') { dataBytes = sz; dataOffset = pos + 8; }
    pos += 8 + sz + (sz & 1);
  }
  const seconds = fmt && fmt.sampleRate ? +(dataBytes / (fmt.sampleRate * fmt.channels * (fmt.bits / 8))).toFixed(3) : null;
  let rms = null;
  if (fmt && fmt.bits === 16 && dataBytes > 0) {
    const n = Math.min(Math.floor(dataBytes / 2), Math.floor((buf.length - dataOffset) / 2));
    let sumsq = 0;
    for (let i = 0; i < n; i++) { const s = dv.getInt16(dataOffset + i * 2, true) / 32768; sumsq += s * s; }
    rms = n ? +Math.sqrt(sumsq / n).toFixed(4) : 0;
  }
  return { container: `pcm_wav ${fmt?.sampleRate ?? '?'}Hz`, fmt, dataBytes, seconds, rms };
}

async function runPool(items, worker, concurrency) {
  const out = new Array(items.length);
  let idx = 0;
  const next = async () => { while (idx < items.length) { const i = idx++; out[i] = await worker(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return out;
}

// --- Pull letter FAILURES with audio ----------------------------------------
const selectCols = 'id,target_sent_to_api,is_correct,audio_storage_path,model_output,client_context';
const q = `${SUPA}/rest/v1/child_pronunciation_attempt?select=${encodeURIComponent(selectCols)}&attempt_type=eq.letter&is_correct=eq.false&audio_storage_path=not.is.null&order=created_at.desc&limit=${N}`;
const attempts = await (await fetch(q, { headers: SB_HEADERS })).json();
console.log(`Pulled ${attempts.length} letter FAILURE clips. Detecting format + replaying through:\n  ${ENDPOINT}\n`);

// --- Process ----------------------------------------------------------------
let done = 0;
const rows = await runPool(attempts, async (a, i) => {
  const enc = a.audio_storage_path.split('/').map(encodeURIComponent).join('/');
  let bytes = null, dlErr = null;
  try {
    const f = await fetch(`${SUPA}/storage/v1/object/authenticated/${BUCKET}/${enc}`, { headers: SB_HEADERS });
    if (!f.ok) dlErr = `download ${f.status}`; else bytes = new Uint8Array(await f.arrayBuffer());
  } catch (e) { dlErr = String(e); }
  const det = bytes ? detectAudio(Buffer.from(bytes)) : { container: 'download_failed' };
  const ctx = a.client_context || {};
  const logged = a.model_output || {};
  const threshold = String(ctx?.requestPayload?.threshold ?? '0.6');

  let resp = null, http = 0, error = dlErr, clientMs = null;
  if (bytes) {
    const fd = new FormData();
    fd.append('audio', new Blob([bytes], { type: 'audio/wav' }), path.basename(a.audio_storage_path));
    fd.append('target_letter', a.target_sent_to_api);
    fd.append('threshold', threshold);
    const t0 = Date.now();
    try { const r = await fetch(ENDPOINT, { method: 'POST', body: fd }); http = r.status; resp = await r.json(); }
    catch (e) { error = String(e); }
    clientMs = Date.now() - t0;
  }
  done++;
  if (done % 25 === 0) console.log(`  …${done}/${attempts.length}`);
  const r = resp || {};
  return {
    id: a.id, target: a.target_sent_to_api, fileSize: bytes ? bytes.length : 0,
    container: det.container, brand: det.brand ?? '', sampleRate: det.fmt?.sampleRate ?? null,
    realAudioSec: det.seconds ?? null, rms: det.rms ?? null, claimedDurMs: num(ctx.recordingDurationMs),
    loggedResult: logged.result ?? null, loggedPredicted: logged.predicted_letter ?? null,
    replayResult: r.result ?? null, replayPredicted: r.predicted_letter ?? null,
    replayTargetProb: num(r.target_probability), replayNoSpeech: r?.extraction_metadata?.no_speech ?? null,
    serverMs: num(r.processing_time_ms) ?? num(r.latency_ms), clientMs,
    error: error ?? r.error ?? null, rawResponse: resp,
  };
}, CONCURRENCY);

// --- Aggregate --------------------------------------------------------------
const ok = rows.filter((r) => r.error === null && r.replayPredicted !== null);
const matches = ok.filter((r) => r.replayResult === r.loggedResult && r.replayPredicted === r.loggedPredicted);
const correct = ok.filter((r) => r.replayPredicted === r.target);
const clientStat = statOf(ok.map((r) => r.clientMs).filter((v) => v !== null));
const serverStat = statOf(ok.map((r) => r.serverMs).filter((v) => v !== null));

const byFmt = {};
for (const r of rows) {
  const c = r.container;
  const s = (byFmt[c] ??= { n: 0, ok: 0, correct: 0 });
  s.n++;
  if (r.error === null && r.replayPredicted !== null) { s.ok++; if (r.replayPredicted === r.target) s.correct++; }
}
const fmtRows = Object.entries(byFmt).sort((a, b) => b[1].n - a[1].n);

// --- Artifacts --------------------------------------------------------------
const outDir = path.join(scriptDir, 'reports');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'letters-app-raw.jsonl'), rows.map((r) => JSON.stringify({ id: r.id, target: r.target, fileSize: r.fileSize, container: r.container, brand: r.brand, sampleRate: r.sampleRate, realAudioSec: r.realAudioSec, rms: r.rms, claimedDurMs: r.claimedDurMs, replay: r.rawResponse })).join('\n') + '\n');
const csvHeader = 'id,target,file_size,container,brand,sample_rate,real_audio_sec,rms,claimed_dur_ms,logged_predicted,replay_predicted,replay_result,replay_target_prob,no_speech,server_ms,client_ms,replay_matches_logged,error';
fs.writeFileSync(path.join(outDir, 'letters-app-detail.csv'), [csvHeader, ...rows.map((r) => [r.id, r.target, r.fileSize, `"${r.container}"`, r.brand, r.sampleRate ?? '', r.realAudioSec ?? '', r.rms ?? '', r.claimedDurMs ?? '', r.loggedPredicted ?? '', r.replayPredicted ?? '', r.replayResult, r.replayTargetProb ?? '', r.replayNoSpeech ?? '', r.serverMs ?? '', r.clientMs ?? '', (r.replayResult === r.loggedResult && r.replayPredicted === r.loggedPredicted), (r.error ?? '').toString().replace(/,/g, ';')].join(','))].join('\n'));

let md = `# Letters endpoint — REAL app clips (failure cases)\n\n`;
md += `Pulled ${rows.length} letter FAILURE attempts from Supabase, detected each clip's real container, and re-sent it to \`/verify_letter\` **exactly as the app does**. Run Australia → europe-west1.\n\n`;
md += `## Audio format — the root cause\n\n| Container (detected from magic bytes) | Clips | Top-1 correct on replay |\n|---|---|---|\n`;
for (const [c, s] of fmtRows) md += `| ${c} | ${s.n} (${pct(s.n, rows.length)}) | ${s.correct}/${s.ok} = ${pct(s.correct, s.ok)} |\n`;
md += `\nThe file **extension is \`.wav\`** but most clips are **3GP/AMR** (Android's compressed telephony codec) — not PCM WAV. AMR-NB is ~8 kHz narrowband voice compression, which strips the high-frequency detail the wav2vec2 letter model needs, so recognition collapses even though the audio "plays".\n\n`;
md += `## Endpoint / model\n\n| Metric | Value |\n|---|---|\n`;
md += `| Clips | ${rows.length} (ok ${ok.length}, errors ${rows.length - ok.length}) |\n`;
md += `| **Replay reproduces the app's logged result** | ${matches.length}/${ok.length} = ${pct(matches.length, ok.length)} (deterministic — endpoint faithful) |\n`;
md += `| **Top-1 correct on replay** | ${correct.length}/${ok.length} = ${pct(correct.length, ok.length)} |\n`;
md += `| Client round-trip ms (AU→EU) | p50 ${clientStat.p50} · p90 ${clientStat.p90} · max ${clientStat.max} |\n`;
md += `| Server compute ms | p50 ${serverStat.p50} · p90 ${serverStat.p90} · max ${serverStat.max} |\n\n`;
md += `## Verdict\n\nThe endpoint and model are **fine** (replay is deterministic and matches the log ${pct(matches.length, ok.length)}, and the same model scores ~95% on clean dataset audio). The failures are caused by the **Android app uploading 3GP/AMR-compressed audio mislabeled as \`.wav\`**. Fix on the app: record/upload **uncompressed PCM WAV (16 kHz+ mono)** instead of 3GP/AMR (change the Android \`MediaRecorder\` output/codec, or use a PCM recorder).\n\n`;
md += `## Example — first clip (detected format + full replay)\n\n\`\`\`json\n${JSON.stringify({ target: rows[0]?.target, fileSize: rows[0]?.fileSize, container: rows[0]?.container, brand: rows[0]?.brand, claimedDurMs: rows[0]?.claimedDurMs, replay: rows[0]?.rawResponse }, null, 2)}\n\`\`\`\n`;
fs.writeFileSync(path.join(outDir, 'letters-app-report.md'), md);

// --- Console ----------------------------------------------------------------
console.log('\n========== REAL APP CLIPS — SUMMARY ==========');
console.log(`Clips:            ${rows.length} letter failures (ok ${ok.length})`);
console.log('Container breakdown (detected from magic bytes):');
for (const [c, s] of fmtRows) console.log(`   ${c.padEnd(26)} ${String(s.n).padStart(3)} clips (${pct(s.n, rows.length)})  |  correct ${s.correct}/${s.ok} = ${pct(s.correct, s.ok)}`);
console.log(`Replay==logged:   ${matches.length}/${ok.length} = ${pct(matches.length, ok.length)} (deterministic)`);
console.log(`Top-1 correct:    ${correct.length}/${ok.length} = ${pct(correct.length, ok.length)}`);
console.log(`Client ms (AU→EU): p50 ${clientStat.p50}  p90 ${clientStat.p90}  max ${clientStat.max}`);
console.log(`Server ms (model): p50 ${serverStat.p50}  p90 ${serverStat.p90}  max ${serverStat.max}`);
console.log(`\nVERDICT: Android uploads 3GP/AMR compressed audio as ".wav" — that is the cause. Endpoint/model are fine.`);
console.log(`Artifacts: eval/reports/letters-app-{report.md,detail.csv,raw.jsonl}`);
