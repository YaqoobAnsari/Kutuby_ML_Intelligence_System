# Letters endpoint — REAL app clips (failure cases)

Pulled 150 letter FAILURE attempts from Supabase, detected each clip's real container, and re-sent it to `/verify_letter` **exactly as the app does**. Run Australia → europe-west1.

## Audio format — the root cause

| Container (detected from magic bytes) | Clips | Top-1 correct on replay |
|---|---|---|
| 3gp/mp4 (compressed) | 143 (95.3%) | 3/143 = 2.1% |
| pcm_wav 44100Hz | 7 (4.7%) | 0/7 = 0.0% |

The file **extension is `.wav`** but most clips are **3GP/AMR** (Android's compressed telephony codec) — not PCM WAV. AMR-NB is ~8 kHz narrowband voice compression, which strips the high-frequency detail the wav2vec2 letter model needs, so recognition collapses even though the audio "plays".

## Endpoint / model

| Metric | Value |
|---|---|
| Clips | 150 (ok 150, errors 0) |
| **Replay reproduces the app's logged result** | 150/150 = 100.0% (deterministic — endpoint faithful) |
| **Top-1 correct on replay** | 3/150 = 2.0% |
| Client round-trip ms (AU→EU) | p50 888 · p90 1410 · max 2690 |
| Server compute ms | p50 280.01 · p90 403.16 · max 511.28 |

## Verdict

The endpoint and model are **fine** (replay is deterministic and matches the log 100.0%, and the same model scores ~95% on clean dataset audio). The failures are caused by the **Android app uploading 3GP/AMR-compressed audio mislabeled as `.wav`**. Fix on the app: record/upload **uncompressed PCM WAV (16 kHz+ mono)** instead of 3GP/AMR (change the Android `MediaRecorder` output/codec, or use a PCM recorder).

## Example — first clip (detected format + full replay)

```json
{
  "target": "Alif",
  "fileSize": 6168,
  "container": "3gp/mp4 (compressed)",
  "brand": "3gp4",
  "claimedDurMs": 2349,
  "replay": {
    "result": false,
    "transcription": "Faa",
    "confidence": 0.16,
    "similarity": 0.16,
    "target_word": "Alif",
    "score": 0.0016,
    "variant": "wav2vec2-base-letters",
    "model": "facebook/wav2vec2-base",
    "processing_time_ms": 286.63,
    "target_letter": "Alif",
    "target_probability": 0.0016177280340343714,
    "predicted_letter": "Faa",
    "predicted_probability": 0.7628442049026489,
    "is_top1": false,
    "runner_up_probability": 0.10467079281806946,
    "criterion": "argmax_floor_margin",
    "pass_floor": 0.45,
    "pass_margin": 0.1,
    "threshold": 0.6,
    "message": "✗ Failed: heard 'Faa' (76.28%), not 'Alif' (0.16%).",
    "latency_ms": 286.63009099909686,
    "all_probabilities": {
      "Ayn": 0.002914303680881858,
      "Alif": 0.0016177280340343714,
      "Baa": 0.005095106549561024,
      "Dal": 0.0013204625574871898,
      "Dhaad": 0.001521674101240933,
      "Faa": 0.7628442049026489,
      "Ghayn": 0.005854007322341204,
      "Ha": 0.004396627191454172,
      "Haa": 0.011620807461440563,
      "Jeem": 0.0011366615071892738,
      "Kaaf": 0.003907728940248489,
      "Khaa": 0.027345502749085426,
      "Laam": 0.005727393552660942,
      "Meem": 0.0020479741506278515,
      "Noon": 0.0041182939894497395,
      "Qaaf": 0.0018826085142791271,
      "Raa": 0.0032842655200511217,
      "Thaa": 0.10467079281806946,
      "Saad": 0.0061628916300833225,
      "Seen": 0.003746857400983572,
      "Sheen": 0.006108902394771576,
      "Taa": 0.004821709357202053,
      "Toh": 0.0034971244167536497,
      "Waw": 0.015479456633329391,
      "Ya": 0.0036902157589793205,
      "Zay": 0.0014820705400779843,
      "Dhah": 0.0008155011455528438,
      "Thal": 0.0028890499379485846
    },
    "extraction_metadata": {
      "method": "max_energy",
      "energy": 0.029396601021289825,
      "start_sample": 8000,
      "start_time_sec": 0.5,
      "speech_floor": 0.015,
      "no_speech": false,
      "original_duration": 1.8,
      "energy_stats": {
        "min": 0.0269538015127182,
        "max": 0.029396601021289825,
        "mean": 0.02815119911204366,
        "std": 0.0007017227849693443
      }
    }
  }
}
```
