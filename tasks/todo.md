# Loudspeaker Simulator — v0.2 Tasks

> Context for next session: v0.1 is deployed at https://ls.graf.me.uk with sealed/vented/TL enclosure models.
> GitHub: https://github.com/flaviograf-AG/loudspeaker-sim
> All 45 Rust tests pass. TypeScript clean. WASM 66KB gzipped.
> Rust toolchain is `stable-x86_64-pc-windows-gnu` (not msvc). Run `eval "$(fnm env)"` before npm.

## Priority 1: Validation (must do before adding features)

- [ ] **Oracle validation against Hornresp v60**
  - Install Hornresp v60 (Setup files in project root)
  - Run our test driver (Fs=37, Re=6.5, Qes=0.42, Qms=3.5, Vas=18L, Sd=132cm²) in:
    - Sealed box: Vb=18L, Ql=7
    - Vented box: Vb=25L, port 20cm² × 15cm, flanged
  - Export FRD + ZMA from Hornresp
  - Create `solver/tests/validation/` with reference data files
  - Write integration tests comparing our output against Hornresp within tolerance
  - Fix any discrepancies found (this is the whole point)

## Priority 2: Quick UI wins (30 min total)

- [ ] **Impedance phase on dual Y-axis** — ECharts supports `yAxisIndex: 1`, show |Z| left + phase (deg) right on impedance plot
- [ ] **Group delay plot** — data already computed in `SimulationResult.group_delay_ms`, just add a FrequencyPlot for it
- [ ] **ECharts cross-chart linking** — `echarts.connect('freq-group')` so hovering on SPL shows crosshair on impedance/displacement simultaneously. This is THE reason we chose ECharts.
- [ ] **Port length calculator** — for vented: given target Fb, auto-calculate port length using `port_resonance_hz()` inverse

## Priority 3: Solver enhancements

- [ ] **Passive radiator model** — common alternative to ported box, similar math to vented but with a second driver instead of port
- [ ] **Bandpass enclosures** — 4th and 6th order bandpass (two-chamber designs)
- [ ] **Room gain simulation** — simple half-space to room boundary model
- [ ] **FRD/ZMA import + overlay** — import measured data and overlay on simulated plots for comparison

## Priority 4: Crossover design (v0.2 major feature)

- [ ] **Modified Nodal Analysis (MNA) engine** — Rust solver for passive crossover networks
  - R, L, C components in series/parallel
  - Driver impedance as load (from ZMA or simulated)
  - Solve for voltage transfer function at each frequency
- [ ] **Crossover UI** — schematic editor or component list for building filter networks
- [ ] **Multi-way system** — combine multiple driver+enclosure+crossover into a single system response
- [ ] **Crossover optimizer** — target response curve, optimize component values

## Priority 5: Polish

- [ ] **ECharts tree-shaking** — current bundle is 1.3MB JS, can reduce to ~500KB by importing only needed chart types
- [ ] **Mobile responsive layout** — sidebar collapses on narrow screens
- [ ] **Dark mode** — GDS has dark section variants
- [ ] **Driver database** — import VituixCAD-format driver database (TSV)
- [ ] **URL state** — encode current params in URL for sharing designs via link
- [ ] **GitHub Actions CI** — auto-build WASM + frontend on push, deploy to VPS

## Lessons Learned (from v0.1 session)

- `stable-x86_64-pc-windows-gnu` toolchain required (no VS linker for msvc)
- Nginx `types {}` block REPLACES global MIME types — never use it, WASM type is already in `/etc/nginx/mime.types`
- `useSolver` hook must gate on `ready` flag — WASM init is async, hook runs on first render before init completes
- Vented box asymptotic rolloff is ~12 dB/oct at extreme low frequencies (port mass shorts out), not 24 dB/oct — the 4th-order slope appears in the transition band near tuning
- Cloudflare caches incorrect MIME types aggressively — purge cache after nginx config changes
- `serde(tag = "type")` for enum serialization means TS types use `{ type: 'Sealed', ...fields }` not `{ Sealed: {...} }`
