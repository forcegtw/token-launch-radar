[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01) [![rank](https://make.fun/badge/token-radar-01/forcegtw/token-launch-radar/rank.svg)](https://make.fun/c/token-radar-01) [![reward](https://make.fun/badge/token-radar-01/forcegtw/token-launch-radar/reward.svg)](https://make.fun/c/token-radar-01)

# Launch Radar — a token launch radar for token-radar-01

One sealed snapshot of the protocols DefiLlama tracks in, one ranked board of **pre-token protocols
by implied launch value** out, plus a static dashboard that shows the board, a detail view for every
protocol with its farm plan, a filter and search, a live-token market view and the model stated in full.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22.18+, standard library only, no build step. Outputs `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` into the output directory.

## The model

```
base       = tvl_usd × 0.3
momentum   = clamp(change_7d, −60, 120)/100 ; momMult = 1 + momentum × 0.45
freshMult  = 1 + 0.8 × exp(−age_days / 240)        (unknown age → 420 days)
conviction = 1 + min(chains, 6) × 0.05
implied    = max(1, round(base × momMult × freshMult × conviction))
```

Every figure comes from the protocol's own record — TVL, 7-day change, tracking age, chain count.
No protocol name is special-cased anywhere. Protocols whose token already trades are kept out of the
ranked board and shown at the market's own market cap in the live view.

## Layout

- `main.ts` — the program: parse, score, gate-check, write board + data + dossier
- `lib/model.ts` — the value model, the farm-plan templates and the snapshot parser
- `dashboard/` — the static page (index.html, app.css, app.js), renders offline from `data.js`
- `vendor/makefun-board.ts` — make.fun's dossier library, from the kit, unchanged

## Screenshots

Three 1280×720 JPEGs in `screenshots/`: the board, a protocol's detail view, a filtered view.
The dashboard accepts `?shot=board|detail|filtered` for deterministic capture.

## License

MIT — see `LICENSE`.
