# Model endpoint evaluation harness

Self-contained scripts that send **real labeled audio** through the live Cloud Run
verify endpoints and score predicted-vs-expected. Purpose: establish the model +
endpoint accuracy ceiling on **clean** audio, as a controlled contrast to the
~12–19% pass rate on **app-uploaded** audio.

No npm dependencies — native `fetch`/`FormData`/`Blob` (Node 18+). Run from the
repo root.

## Letters — `test-letters.mjs`

Samples clips from the merged letters dataset (folders named in *model*-label
space) and POSTs each to `/verify_letter` (which speaks *frontend* labels — the
script maps between them).

```bash
node eval/test-letters.mjs [N=100] [datasetDir] [endpoint]
# default datasetDir: arabic-letters-realtime/Dataset_merged
# default endpoint:   https://arabic-letters-api-d26k2plh4q-ew.a.run.app/verify_letter
```

Reports top-1 accuracy, pass rate (gate@0.6), per-letter accuracy, top
misclassifications, and latency; writes a per-clip CSV to `eval/results/`
(git-ignored).

### Result (2026-07-01, N=100, balanced across 28 letters)

- **Top-1 accuracy: ~95%**, **pass rate: ~93%**, 0 errors, ~1.4 s median latency.
- Misses are normal acoustic confusions (Faa↔Thaa, Taa→Saad, …).
- **Caveat:** the dataset overlaps the training set, so this is an *upper bound*.
  The point is the **contrast**: clean audio ≈ 93% pass vs. app audio ≈ 12% pass
  → the production failures are the app's truncated/near-empty uploads, **not**
  the model or the endpoint.

## Words — `test-words.mjs` (pending)

Same shape, targeting `/verify_word` (fields: `audio`, `target_word`,
`threshold`, `fuzzy_match`, `fuzzy_threshold`). Awaiting a labeled word-audio set
(manifest: `file → target_word`). A complementary **differential replay** —
re-sending real stored attempts and confirming the endpoint reproduces the logged
result byte-for-byte — already proved the word endpoint is faithful.
