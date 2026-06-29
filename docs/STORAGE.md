# Storage Architecture & Cost Comparison

> Status: **analysis complete — recommendation below; final call is the team's.**
> Pricing is **approximate list price (early 2026)** for the EU region and
> changes often — verify with each provider's calculator before committing.

## TL;DR recommendation

Keep **Supabase Storage** as the hot ingestion + dashboard-playback tier (the
mobile app already writes there; signed URLs + the dashboard are already wired;
marginal cost is negligible). Add a **durable "dataset lake"** for the growing
proprietary corpus + retraining pulls:

- **If retraining compute runs on GCP** (our models already run on Cloud Run in
  `europe-west1`): use **Google Cloud Storage in `europe-west1`**. Same-region
  reads to GCP compute are **free egress**, it co-locates with the model infra,
  and lifecycle rules can age old raw audio into Coldline/Archive cheaply.
- **If training runs anywhere else / multi-cloud / undecided**: use
  **Cloudflare R2** — **zero egress fees**, cheapest at scale, cloud-agnostic.

**The deciding question is: where will retraining run?** GCP → GCS. Else → R2.

Also: store audio as **lossless FLAC** in the lake (~50% smaller than WAV, no
quality loss) to roughly halve storage cost without harming training fidelity.

## Measured parameters (from live data, 2026-06-29)

| Parameter | Value | Source |
|---|---|---|
| Avg audio file size | **~0.34 MB** (median ~0.30, range 0.29–0.52) | 6 real files sampled from the bucket |
| Format | WAV, 44.1 kHz, mono, 16-bit, ~3.5–6 s | schema + measurement |
| Attempts today | **701** (≈689 with audio) | live count |
| Dataset size today | **~0.23 GB** | 689 × 0.34 MB |
| Recent volume | 17→78→338→208→53 over 5 days (ramping) | daily counts |

## Volume scenarios (indefinite retention — the dataset is the asset)

| Scenario | Recordings/day | Per year | Stored at year-end |
|---|---|---|---|
| Pilot (now) | ~200 | ~73k | ~24 GB |
| Growth | ~1,000 | ~365k | ~121 GB |
| Scale | ~10,000 | ~3.65M | ~1.2 TB |

## Unit pricing (approximate list, EU, early 2026 — verify)

| | Storage $/GB-mo | Egress to internet $/GB | Egress to same-cloud compute | Write ops | Read ops | Notes |
|---|---|---|---|---|---|---|
| **Supabase Storage** | ~$0.021 | ~$0.09 (250 GB incl. on Pro) | n/a (S3-backed) | included | included | Already integrated; $25/mo Pro plan shared with DB/Auth |
| **Google Cloud Storage** (Standard, `europe-west1`) | ~$0.020 | ~$0.12 (tiered) | **free (same region/project)** | $0.005/1k | $0.0004/1k | Coldline ~$0.004, Archive ~$0.0012 + retrieval fees |
| **Cloudflare R2** | ~$0.015 | **$0.00** | $0.00 | $4.50/M | $0.36/M | Egress-free everywhere; 10 GB free tier |
| **AWS S3** (Standard, `eu-west-1`) | ~$0.023 | ~$0.09 (100 GB/mo free) | free to same-region EC2 | $0.005/1k | $0.0004/1k | IA ~$0.0125, Glacier Instant ~$0.004 |

## Estimated annual cost by scenario

Assumptions: indefinite retention; **4 full-dataset retraining pulls/year**
plus light dashboard playback (egress ≈ 250 GB/yr at Growth, ≈ 2.5 TB/yr at
Scale). Storage billed on the average stored volume over the year.

| Provider | Growth (~120 GB) | Scale (~1.2 TB) | Comment |
|---|---|---|---|
| Supabase Storage | ~$15/yr* | ~$350/yr* | *marginal, on top of the existing $25/mo plan; egress grows the bill |
| GCS — internet egress | ~$44/yr | ~$440/yr | egress dominates if training pulls leave GCP |
| **GCS — co-located w/ GCP training** | **~$15/yr** | **~$150/yr** | training pulls are free egress; + Coldline lifecycle cuts storage |
| **Cloudflare R2** | **~$11/yr** | **~$108/yr** | zero egress regardless of where you read |
| AWS S3 (Standard) | ~$17/yr | ~$283/yr | 100 GB/mo free egress softens it; IA/Glacier cut storage |

**Read this as architecture guidance, not a budget line:** absolute costs are
small for years. The real lever is **egress on repeated full-dataset retraining
pulls** — which R2 (zero egress) and GCS-same-region (free to GCP compute)
neutralize, while Supabase/S3/GCS-over-internet scale with how often you pull.

## Qualitative comparison

| Dimension | Supabase | GCS | R2 | S3 |
|---|---|---|---|---|
| Integration effort (today) | **none** (done) | medium | medium | medium |
| Co-location with our models (GCP `europe-west1`) | no | **yes** | no | no |
| Egress lock-in risk | medium | medium (low if on-GCP) | **none** | medium |
| Lifecycle tiering (cold archive) | limited | **strong** | basic | **strong** |
| Signed URLs / access control | **built-in + RLS** | yes (IAM/signed) | yes (signed) | yes (IAM/signed) |
| Retrieval latency | good | good | good | good |

## Recommended architecture

```
Mobile app ──writes──▶ Supabase Storage (hot tier)
                          │  • ingestion + dashboard signed-URL playback
                          │  • near-zero marginal cost, already wired
                          ▼
                 nightly/lifecycle copy (as FLAC)
                          ▼
        Dataset lake:  GCS europe-west1  (if training on GCP)
                   or  Cloudflare R2      (if training elsewhere)
                          • durable corpus for retraining
                          • lifecycle → Coldline/Archive for old raw audio
```

## Open decisions for the team

1. **Where will retraining run?** (GCP → GCS; else → R2.) This is the gate.
2. Convert WAV → **FLAC** in the lake (≈2× storage saving, lossless)? Recommended.
3. Retention policy for raw child audio (governance/compliance — see SECURITY.md).
4. Who owns the copy/lifecycle job (app-side trigger vs. scheduled sync)?

## Caveats

- Prices are **list, early 2026, EU**; tiered/regional pricing and free tiers
  change — confirm on each provider's calculator before committing spend.
- The Supabase $25/mo Pro plan is shared across DB + Auth + Storage, so its
  storage-attributable cost is effectively just the per-GB/egress marginal.
- These estimates assume the dataset is stored once and pulled in bulk for
  retraining; transactional per-clip reads (dashboard playback) are negligible.
