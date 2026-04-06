# Loudspeaker Simulator — v0.2 Development Plan

> **Context for next session:**
> - v0.1 is deployed at https://ls.graf.me.uk — sealed/vented/TL enclosure models
> - GitHub: https://github.com/flaviograf-AG/loudspeaker-sim (branch: master)
> - Solver: 8 Rust modules, 45 tests, WASM 66KB gzipped
> - Frontend: React 19 + ECharts + GDS, deployed on OVH VPS (Nginx + Cloudflare)
> - Rust toolchain: `stable-x86_64-pc-windows-gnu` (not msvc). Run `eval "$(fnm env)"` before npm.
> - Build: `cd solver && wasm-pack build --target web --release` then `cd web && npm run build`
> - Deploy: `scp -i ~/.ssh/id_ed25519 -r web/dist/* deploy@57.129.6.118:/var/www/ls/`
> - Test: `cd solver && cargo test` (45 tests) + `cd web && npx tsc --noEmit`

---

## Session 2: Validation + Quick UI Wins

### S2.1: Oracle validation against Hornresp v60

**Why first:** We have no proof our numbers are correct. Every subsequent feature builds on this math.

**Steps:**
1. Install Hornresp v60 (`Setup (3).exe` in project root)
2. Create a Hornresp project with our reference driver:
   - Fs=37Hz, Re=6.5Ω, Le=0.5mH, Qes=0.42, Qms=3.5, Vas=18L, Sd=132cm²
3. Simulate in Hornresp:
   - **Sealed:** Vb=18L, Ql=7 → Export FRD + ZMA (20Hz–20kHz)
   - **Vented:** Vb=25L, port 20cm² × 15cm, flanged → Export FRD + ZMA
4. Place reference files in `solver/tests/validation/`:
   - `sealed_ref.frd`, `sealed_ref.zma`
   - `vented_ref.frd`, `vented_ref.zma`
5. Write `solver/tests/oracle_tests.rs`:
   ```rust
   // Parse FRD/ZMA reference data
   // Run our solver with identical params
   // Compare SPL at each frequency: assert within ±1.0 dB
   // Compare impedance: assert within ±5%
   // Report max deviation and frequency of worst match
   ```
6. Fix any solver bugs revealed by comparison

**Acceptance:** All oracle tests pass within stated tolerances.

### S2.2: Quick UI wins

**Files to modify:** `web/src/components/FrequencyPlot.tsx`, `PlotArea.tsx`

- [ ] **Impedance phase on dual Y-axis**
  - Add `yAxis` array with two axes in FrequencyPlot
  - Pass impedance phase as second series with `yAxisIndex: 1`
  - Left axis: |Z| (Ohms), Right axis: Phase (degrees, -90 to +90)

- [ ] **Group delay plot**
  - Add 4th FrequencyPlot in PlotArea for `result.group_delay_ms`
  - Color: `--graf-warning` orange

- [ ] **ECharts cross-chart linking**
  - Each FrequencyPlot gets a `group` prop
  - In component: `echarts.connect(group)` after chart init
  - All plots use `group="freq-response"` — hovering any plot shows crosshair on all

- [ ] **Port length calculator (vented)**
  - Add to EnclosureInputs: "Target Fb" input
  - When set, auto-calculate `port_length_m` using inverse of `port_resonance_hz()`
  - Formula: `L_port = Sp / (Vb × (2πFb/c₀)²) - end_corrections`

---

## Session 3: Transmission Line Model Expansion

### S3.1: Extended TL Rust types

**Files:** `solver/src/types.rs`, `solver/src/transmission_line.rs`

New `TransmissionLineParams` struct (replaces current):
```rust
pub struct TransmissionLineParams {
    pub length_m: f64,
    pub area_driver_m2: f64,
    pub area_mouth_m2: f64,

    // Driver position (new)
    /// Driver offset from closed end as fraction of line length (0.0 = at wall, 0.33 = 1/3 offset)
    pub driver_position: f64,

    // Taper (expanded)
    pub taper_profile: TaperProfile,

    // Stuffing (expanded from single density to zones)
    pub stuffing_zones: Vec<StuffingZone>,

    // Termination
    pub open_end: bool,
    pub mouth_termination: MouthTermination,

    // Geometry
    pub num_segments: u32,
    pub num_folds: u32,  // each fold adds acoustic mass
}

pub enum TaperProfile {
    Straight,                           // linear in radius (current)
    Exponential { flare_constant: f64 }, // S(x) = S0 × e^(m×x)
    Conical,                            // linear in area
    Hyperbolic { throat_param: f64 },    // Webster horn equation
}

pub struct StuffingZone {
    pub start_pct: f64,  // 0.0–1.0
    pub end_pct: f64,
    pub density_kg_m3: f64,
    pub flow_resistivity_pa_s_m2: f64,
}

pub enum MouthTermination {
    Flush,           // current: simple radiation impedance
    Slot { ratio: f64 },  // narrow rectangular opening
    Flared { flare_radius: f64 }, // horn-like with larger end correction
}
```

### S3.2: Solver implementation

**Key changes to `transmission_line.rs`:**

1. **Driver position:** The TMM chain splits into two sub-chains:
   - Dead-end section: from closed wall to driver position (length = `driver_position × total_length`)
   - Open section: from driver to mouth (length = `(1 - driver_position) × total_length`)
   - Driver sees: dead-end impedance in parallel with open-section impedance

2. **Stuffing zones:** In the segment loop, look up which zone each segment falls in and use that zone's flow resistivity for `complex_wave_number()`. No zone = lossless.

3. **Taper profiles:** Replace `area_at_position()` with profile-dependent function:
   - Straight: current linear-in-radius
   - Exponential: `S(x) = S_driver × exp(m × x)` where `m = ln(S_mouth/S_driver) / L`
   - Conical: `S(x) = S_driver + (S_mouth - S_driver) × x/L` (linear in area)
   - Hyperbolic: Webster horn equation

4. **Fold losses:** Each fold adds a lumped acoustic mass = `ρ₀ × δ / S` where δ ≈ pipe diameter. Insert as a 2×2 series impedance matrix between segments at fold positions.

5. **Mouth termination:** Different radiation impedance models for each type.

### S3.3: Tests

**File:** `solver/tests/tl_extended_tests.rs`

- [ ] Driver at 33% position suppresses 3rd harmonic
- [ ] Dead-end creates impedance minimum shift vs. no dead-end
- [ ] Stuffing zones: heavy-near-driver vs. uniform — different high-frequency behavior
- [ ] Exponential taper vs. straight — different low-frequency cutoff
- [ ] Fold losses reduce Q of standing wave peaks

### S3.4: UI for new TL parameters

**Files:** `web/src/components/EnclosureInputs.tsx` (expand TL section)

- Driver position slider (0%–50%)
- Taper profile selector (radio buttons)
- Stuffing zone editor: 3 zones by default, each with density + flow resistivity inputs
- Mouth termination selector
- Number of folds input

---

## Session 4: Multi-Way Project Model

### S4.1: Data model

**Files:** `solver/src/types.rs`, `web/src/types/index.ts`

```rust
pub struct SpeakerProject {
    pub name: String,
    pub ways: Vec<Way>,
    pub freq_start_hz: f64,
    pub freq_end_hz: f64,
    pub freq_points: usize,
    pub drive_voltage_rms: f64,
}

pub struct Way {
    pub name: String,       // e.g., "Woofer", "Midrange", "Tweeter"
    pub driver: DriverParams,
    pub enclosure: EnclosureConfig,
    pub crossover: Option<CrossoverNetwork>,
    pub acoustic_offset_m: f64,  // physical distance offset for time alignment
    pub inverted_polarity: bool,
}
```

### S4.2: UI

- Tab bar at top of sidebar: one tab per way + "+" button to add
- Each tab shows that way's driver + enclosure inputs
- PlotArea shows per-way SPL traces (different colors) + system total (black, thick)
- Way management: add, remove, rename, reorder

---

## Session 5: Crossover Engine (MNA)

### S5.1: Circuit types

**File:** `solver/src/crossover.rs`

```rust
pub struct CrossoverNetwork {
    pub components: Vec<CrossoverComponent>,
}

pub enum CrossoverComponent {
    SeriesResistor { r_ohm: f64 },
    SeriesInductor { l_h: f64, dcr_ohm: f64 },  // DCR = DC resistance of real inductor
    SeriesCapacitor { c_f: f64 },
    ShuntResistor { r_ohm: f64 },
    ShuntInductor { l_h: f64, dcr_ohm: f64 },
    ShuntCapacitor { c_f: f64 },
}
```

### S5.2: MNA solver

Build the nodal admittance matrix at each frequency:
- Input node (amplifier voltage source)
- N internal nodes (one per component junction)
- Output node (driver impedance as load)
- Solve `Y × V = I` for node voltages
- Transfer function = V_output / V_input

**Key reference:** XSim's approach — ladder network with series and shunt elements. Can start with simple ladder topology before full arbitrary netlist.

### S5.3: Common topologies (presets)

- 2nd-order Linkwitz-Riley LP/HP (most common for 2-way)
- 4th-order Linkwitz-Riley LP/HP (most common for 3-way)
- Butterworth 1st–4th order
- Zobel impedance equalization
- L-pad attenuation
- Notch filter (series or parallel)

### S5.4: System summation

**File:** `solver/src/system.rs`

```rust
/// Sum complex pressures from all ways at each frequency.
/// Accounts for crossover transfer function, polarity, and acoustic offset.
pub fn system_response(
    ways: &[WayResult],  // each has: frequencies, complex_pressure, complex_impedance
    freq_hz: &[f64],
) -> SystemResult {
    // For each frequency:
    //   p_total(f) = Σ way_i.pressure(f) × crossover_i.H(f) × polarity_i × exp(-j×ω×offset_i/c)
    // SPL = 20×log10(|p_total| / p_ref)
}
```

---

## Session 6: Claude-as-Optimizer

### S6.1: CLI binary

**File:** `solver/src/main.rs`

```rust
fn main() {
    let input: SimulationInput = serde_json::from_reader(std::io::stdin()).unwrap();
    let result = solve_simulation(&input);
    serde_json::to_writer(std::io::stdout(), &result).unwrap();
}
```

Add to `Cargo.toml`:
```toml
[[bin]]
name = "loudspeaker-solver"
path = "src/main.rs"
```

Build: `cargo build --release` → `target/release/loudspeaker-solver.exe`

### S6.2: MCP server

**File:** `mcp/` directory — Node.js or Python MCP server wrapping the CLI binary.

Tools:
1. `simulate` — run solver, return result + metrics
2. `evaluate` — compute flatness, extension, impedance stats from a result
3. `sweep` — run N simulations varying one or more parameters
4. `suggest_alignment` — classical alignment tables for sealed/vented

### S6.3: Optimization skill

**File:** `.claude/commands/optimize-speaker.md` or a cc-polymath skill

The skill teaches Claude:
- How to interpret FR curves (what a dip at crossover means, what bass rolloff slope indicates)
- When to adjust which parameter (box volume for extension, stuffing for smoothness, crossover slope for integration)
- How to balance competing objectives (flat response vs. bass extension vs. box size)
- When to stop iterating (diminishing returns below 0.1 dB improvement)

### S6.4: Web UI integration

- "Optimize" button → calls Claude API with current design + constraints
- Streams parameter changes back → plots update in real-time
- Shows iteration log: "Iteration 3: increased line length 2.0→2.3m, reduced ripple from ±3.1dB to ±1.8dB"

---

## Priority 6: Polish (any session)

- [ ] **ECharts tree-shaking** — import only LineChart, LogAxis, Tooltip from `echarts/core`
- [ ] **Mobile responsive** — sidebar collapses to bottom drawer on narrow screens
- [ ] **Dark mode** — GDS dark section variants
- [ ] **Driver database** — VituixCAD-format TSV import, searchable dropdown
- [ ] **URL state** — encode params in URL hash for sharing
- [ ] **GitHub Actions CI** — build WASM + frontend on push, deploy to VPS
- [ ] **Keyboard shortcuts** — Ctrl+S save, Ctrl+Z undo parameter change
- [ ] **Undo/redo** — parameter history stack

---

## Lessons Learned (from v0.1 session)

- `stable-x86_64-pc-windows-gnu` toolchain required (no VS linker for msvc)
- Nginx `types {}` block REPLACES global MIME types — never use it, WASM type is already in `/etc/nginx/mime.types`
- `useSolver` hook must gate on `ready` flag — WASM init is async, hook runs on first render before init completes
- Vented box asymptotic rolloff is ~12 dB/oct at extreme low frequencies (port mass shorts out), not 24 dB/oct — the 4th-order slope appears in the transition band near tuning
- Cloudflare caches incorrect MIME types aggressively — purge cache after nginx config changes
- `serde(tag = "type")` for enum serialization means TS types use `{ type: 'Sealed', ...fields }` not `{ Sealed: {...} }`
- ECharts `echarts-for-react` requires `tslib` as peer dependency
- `vite-plugin-top-level-await` not needed with Vite 8 + `target: 'esnext'`
- GDS is CSS-only — use `graf-*` classes directly, no React components
- For Puppeteer in fnm: use `NODE_PATH=$(npm root -g)` to find global modules
