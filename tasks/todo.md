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

## Priority 3: Transmission line model expansion

The current TL model is minimal (uniform stuffing, driver at closed end, linear taper). Real TL design has 10+ continuous parameters that interact nonlinearly — this is where AI optimization will have the most impact.

### 3a. Extended TL parameters (solver)
- [ ] **Driver position** — offset from closed end as % of line length (0% = at wall, 33% = classic 1/3 offset). Changes which standing wave harmonics the driver excites.
- [ ] **Dead-end section** — closed stub behind the driver. Ratio of total line length (0–50%). Creates bandpass behavior, shifts tuning.
- [ ] **Stuffing zones** — replace single uniform density with N zones, each with:
  - `start_pct`, `end_pct` (% of line length)
  - `density_kg_m3`, `flow_resistivity_pa_s_m2`
  - Typical: heavy near driver (10–20 kg/m³), medium in middle (5–10), light/empty near mouth (0–5)
- [ ] **Taper profiles** — beyond linear: exponential, conical, hyperbolic. Each has different impedance matching and low-frequency cutoff. Implement as `taper_type` enum with per-type parameters.
- [ ] **Mouth termination types** — flush (current), slot (narrow rectangular), flared (horn-like end correction). Affects radiation impedance and effective length.
- [ ] **Fold/bend losses** — folded line geometry adds acoustic mass at each bend. Input as number of folds; each adds a small impedance discontinuity.

### 3b. Extended TL parameters (UI)
- [ ] **Stuffing zone editor** — visual representation of the line showing driver position, zones, and density per zone. Drag to adjust zone boundaries.
- [ ] **Taper visualization** — show cross-section profile alongside the FR plot
- [ ] **Dead-end ratio slider** — with real-time plot update

### 3c. Other solver enhancements
- [ ] **Passive radiator model** — common alternative to ported box, similar math to vented but with a second driver instead of port
- [ ] **Bandpass enclosures** — 4th and 6th order bandpass (two-chamber designs)
- [ ] **Room gain simulation** — simple half-space to room boundary model
- [ ] **FRD/ZMA import + overlay** — import measured data and overlay on simulated plots for comparison

## Priority 4: Multi-way crossover design (v0.2 major feature)

**Target use case:** 3-way speaker with woofer in TL + midrange in sealed/vented + tweeter, each with passive crossover filters, showing combined system response.

### 4a. Multi-driver project model
- [ ] **Project-level data model** — a "Speaker Project" contains N driver+enclosure "ways", each producing its own SimulationResult. Currently the app handles only one driver at a time. Need:
  - `SpeakerProject { ways: Vec<Way> }` where `Way = { driver, enclosure, crossover, position }`
  - UI to add/remove ways (tabs or accordion)
  - Each way runs its own simulation independently

### 4b. Crossover engine (Rust solver)
- [ ] **Modified Nodal Analysis (MNA) engine** — Rust solver for passive crossover networks
  - R, L, C components in series/parallel
  - Driver impedance as load (from ZMA or simulated)
  - Solve for voltage transfer function at each frequency
  - Common topologies: 1st–4th order LP/HP/BP (Butterworth, Linkwitz-Riley, Bessel)
  - Zobel network (impedance equalization)
  - L-pad (level matching between drivers)
- [ ] **Crossover-filtered response** — multiply each driver's SPL by its crossover transfer function to get the filtered per-way response

### 4c. System summation
- [ ] **Acoustic summation** — sum all ways' complex pressure (magnitude + phase) at each frequency to get total system SPL. Phase matters — this is what makes crossover design hard.
- [ ] **Time alignment / driver offset** — account for physical distance differences between drivers (e.g., tweeter recessed vs. woofer flush)
- [ ] **System impedance** — parallel combination of all ways' impedance through their crossover networks

### 4d. UI
- [ ] **Crossover UI** — per-way filter component list (topology selector + component values)
- [ ] **System view** — overlay all per-way filtered responses + total system response on one plot
- [ ] **Crossover optimizer** — target response curve, optimize component values

## Priority 5: Claude-as-Optimizer (AI-driven design)

**Goal:** Let Claude directly call the simulator to iteratively optimize enclosure dimensions, port tuning, and crossover component values for a target frequency response.

### 5a. Native solver CLI (no browser needed)
- [ ] **CLI binary target** — add `solver/src/main.rs` that reads JSON from stdin, writes result to stdout. `cargo run -- < input.json > output.json`. This lets Claude call the solver directly without a browser or WASM.
- [ ] **Batch mode** — accept multiple inputs (parameter sweeps) in one call for efficiency

### 5b. MCP server for Claude Code
- [ ] **MCP tool: `simulate`** — wraps the CLI binary. Input: SimulationInput JSON. Output: SimulationResult JSON + computed metrics (flatness, -3dB point, impedance min, Xmax exceedance).
- [ ] **MCP tool: `evaluate_flatness`** — given a SimulationResult and target band (e.g., 40Hz–20kHz), returns: max deviation from mean, ±dB ripple, -3dB and -6dB corner frequencies, impedance minimum. This is what Claude uses to judge "how good" a design is.
- [ ] **MCP tool: `suggest_enclosure`** — given driver T/S params and target alignment (e.g., Butterworth B2, Bessel), compute optimal sealed Vb or vented Vb+Fb using classical alignment tables (Small, Thiele).
- [ ] **MCP tool: `sweep_parameter`** — vary one parameter (e.g., box volume 10L–50L in 20 steps) and return all results. Claude can then pick the best.
- [ ] **MCP tool: `sweep_multivariate`** — vary multiple parameters simultaneously (grid search or Latin hypercube sampling). Essential for TL optimization where parameters interact nonlinearly.

### 5c. Optimization loop (Claude-driven)
- [ ] **Optimization prompt template** — structured prompt that tells Claude how to use the tools:
  1. Evaluate current design with `simulate` + `evaluate_flatness`
  2. Identify the worst problem (bass rolloff? crossover dip? impedance dip?)
  3. Adjust the relevant parameter (box volume, port tuning, crossover component)
  4. Re-simulate and compare
  5. Repeat until target met or improvement < 0.1 dB
  6. Report final design with rationale for each choice
- [ ] **Constraint specification** — user defines: target band, max ripple (±dB), min impedance, max Xmax at rated power, max box volume, max port velocity
- [ ] **Multi-objective scoring** — weighted score combining flatness, extension, impedance safety, displacement headroom

### 5d. TL-specific optimization variables
All of these should be exposable as optimization targets in the MCP tools:
- Line length (m)
- Driver position (% of line)
- Dead-end ratio (% of line behind driver)
- Taper profile (straight/exponential/conical) + expansion ratio
- Mouth-to-driver area ratio
- Per-zone stuffing density (N zones × density + flow resistivity)
- Number of zones and zone boundaries

**Example TL optimization call:**
```json
{
  "driver": { "fs_hz": 40, "qes": 0.38, ... },
  "optimize": {
    "target_band_hz": [35, 500],
    "max_ripple_db": 2.0,
    "variables": {
      "line_length_m": { "min": 1.5, "max": 3.5 },
      "driver_position_pct": { "min": 0, "max": 40 },
      "dead_end_pct": { "min": 0, "max": 30 },
      "taper_ratio": { "min": 0.5, "max": 3.0 },
      "stuffing_zones": [
        { "density_range": [5, 20], "flow_res_range": [3000, 15000] },
        { "density_range": [0, 10], "flow_res_range": [0, 8000] },
        { "density_range": [0, 5], "flow_res_range": [0, 5000] }
      ]
    },
    "constraints": {
      "max_line_length_m": 3.0,
      "min_impedance_ohm": 5.0,
      "max_displacement_mm": 5.0
    }
  }
}
```

### 5d. Integration with UI
- [ ] **"Optimize with AI" button** in the web UI — sends current design to Claude via API, streams back parameter adjustments in real-time, plots update live as Claude iterates
- [ ] **Optimization history** — show each iteration's parameters and score so user can understand Claude's reasoning

## Priority 7: Polish

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
