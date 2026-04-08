# Master Plan: Loudspeaker Simulator — 4 Phases

> **For Claude:** Each phase is a session boundary. Start each session by reading this plan, checking what's done, and picking up from the next incomplete task. Commit after each task. Run `cargo test` and `npx playwright test` before claiming any task is done.

**Goal:** Bring the simulator to professional parity with VituixCAD for passive crossover design, fix known bugs, and add the most impactful missing features.

**Reference materials** (read these, don't theorize):
- `docs/references/vituixcad-extracted.txt` — 44-page VituixCAD manual (text-extracted)
- `docs/references/vituixcad-help.pdf` — original PDF
- `docs/references/xsim-step-by-step.pdf` — XSim workflow guide
- `docs/references/hornresp-manual.pdf` — Hornresp manual
- `docs/plans/2026-04-08-vituixcad-gap-analysis.md` — 11 confirmed gaps vs VituixCAD

**Tech Stack:** Rust/WASM (solver, 16 modules, 101 tests), React 19 + Vite + TypeScript (frontend), Playwright (E2E, 45 tests), ECharts 6 (plots)

---

## Phase 1: Tests with Domain Understanding

**Purpose:** Write tests that prove the simulator works correctly for real loudspeaker scenarios — not just "did pixels change" but "does the physics make sense." Tests must cover the full chain: UI → state → WASM → charts → numerical output.

**Status: DONE** (completed 2026-04-08)

### Task 1.1: Playwright setup ✅
Installed Playwright, configured for Vite dev server, fixed WASM serving (`server.fs.allow`), created test helpers.

### Task 1.2: Orchestration smoke tests (20 tests) ✅
Driver params, enclosure, passive/active crossover, per-way controls, system controls, FRD mode — all verify chart changes on input.

### Task 1.3: Real scenario tests with numerical assertions (6 tests) ✅
- 2-way sealed with real drivers (AUDAX HM210C0 + DAYTON DC28F), LR4 crossover, per-way rolloff validation
- 1-way vented box (HM170Z0) — bass rolloff + impedance dual-hump
- 3-way system (vented woofer + sealed mid + sealed tweeter) — 3 real drivers
- FRD+ZMA measured data (WF223BD02) — impedance variation from ZMA
- Mixed mode: T/S woofer + FRD tweeter
- Same driver sealed vs vented — different bass response

### Task 1.4: Passive component coverage tests (19 tests) ✅
Every component type (19 total) verified to affect SPL by >0.3 dB. Caught the shunt component bug.

---

## Phase 2: Fix Known Bugs + Already-Planned Features

**Purpose:** Fix confirmed bugs and implement features already designed in the optimizer v2/v3 plans. Each task has a clear specification — no research needed, just implementation.

### Task 2.1: Source impedance as user parameter
**Bug:** Hardcoded 0.35Ω in `crossover.rs:113`. Users can't model tube amps (high output R) or bench setups.
**Fix:**
- Add `source_impedance_ohm: f64` to `passive_transfer_function()` signature
- Add `source_impedance_ohm` to `Way` struct in `system.rs` (default 0.35)
- Add `source_impedance_ohm` to `WayInput` in `types/index.ts`
- Add NumericInput "Source R" in SystemPanel or CrossoverPanel (label: "Amp + cable R", default 0.35, unit "Ω")
- Update existing test `no_filter_near_unity_transfer` to use the parameter
- Write test: different source R produces different shunt component effect
- Write E2E test: changing source R changes chart
- **Commit, rebuild WASM, run all tests**

**Ref:** VituixCAD manual p.27 line 908

### Task 2.2: Filter bypass toggle
**Bug:** Users can't temporarily disable a passive or active filter block without deleting it.
**Fix:**
- Add `bypassed: bool` field to each variant in `PassiveBlock` — or better, wrap: use a new struct `PassiveFilterEntry { block: PassiveBlock, bypassed: bool }`
- Add `bypassed: bool` to `ActiveFilter` (similar wrapper or field)
- In `passive_transfer_function()`, skip blocks where `bypassed = true`
- In `active_filter_response()`, return unity for bypassed filters
- Add bypass checkbox per component in PassiveWizard.tsx
- Add bypass checkbox per active filter in PerWayEqEditor.tsx
- Write Rust test: bypassed inductor = no attenuation
- Write E2E test: bypass toggle changes chart, un-bypass restores
- **Commit**

**Ref:** VituixCAD manual p.9 line 325

### Task 2.3: Optimizer v2 — target curves + constraints
Implement the 6 tasks from `docs/plans/2026-04-07-optimizer-v2.md`:
1. Target curve (flat / slope / custom array)
2. Frequency-weighted error (presence boost)
3. Minimum impedance constraint
4. Excursion/displacement constraint
5. DE + NM hybrid algorithm
6. E-series snapping for passive components

Each sub-task is fully specified in the v2 plan with code snippets. Implement one at a time, test, commit.

### Task 2.4: Optimizer v3 — parameter locks + crossover mode
Implement the 6 tasks from `docs/plans/2026-04-08-optimizer-v3-param-locks.md`:
1. `locked: bool` flag on OptParam (Rust)
2. Source impedance as configurable (done in 2.1 — skip or verify)
3. Per-parameter lock UI with checkboxes
4. `crossover_mode` (active / passive / mixed) in DesignState
5. All passive R/L/C values as optimizable parameters
6. E2E tests for full optimizer workflow

**Ref:** VituixCAD manual p.13 line 473 (Opt checkbox), p.12 line 429 (active vs passive separation)

---

## Phase 3: Architectural Review + Debugging

**Purpose:** Systematic audit of the solver against published acoustic theory and the VituixCAD/Hornresp reference implementations. Find and fix correctness issues.

### Task 3.1: Extended impedance model (Thorborg 2010)
**Gap:** Our driver model has Le and Ke but missing Leb (bound inductance) and Rss (shunt resistance).
**Fix:**
- Add `leb_h: f64` and `rss_ohm: f64` to `DriverParams` in `types.rs` (default 0.0 = not used)
- Update `driver_impedance()` in `driver.rs` to implement the full Thorborg equivalent circuit:
  ```
  Z_motor = Re + s×Le + (s×Leb × Rss) / (s×Leb + Rss)  [when Ke=0]
  Z_motor = Re + Ke×s^0.5                                 [when Ke>0, existing]
  ```
- Add to driver database entries that have this data (some QSpeakers entries may)
- Add optional Leb/Rss inputs to DriverInputs.tsx
- Write Rust test: impedance with Leb+Rss differs from basic Le model above 1 kHz
- **Commit**

**Ref:** VituixCAD manual p.26 line 856; Thorborg et al. "Frequency Dependence of Damping and Compliance in Loudspeaker Suspensions" JAES 2010

### Task 3.2: T/S phase handling in multi-way systems
**Current:** `system.rs:208` uses `Complex::new(p_mag, 0.0)` for T/S-simulated drivers — throws away acoustic phase (minimum-phase approximation).
**Impact:** Multi-way summation of T/S-simulated drivers has incorrect destructive/constructive interference patterns.
**Research needed:** Read how Hornresp and QSpeakers handle this. Check if minimum-phase is standard practice or if we should compute acoustic phase from the transfer function.
**Fix:** If minimum-phase reconstruction is the standard approach (it probably is for T/S models), implement Hilbert-transform-based minimum-phase computation from the magnitude response. Or extract phase directly from the complex transfer functions in `sweep.rs`.

### Task 3.3: Verify all 16 active filter types against Audio EQ Cookbook
Cross-check every active filter's s-domain formula (`active_filter_response()`) and biquad formula (`filter_to_biquad()`) against Robert Bristow-Johnson's Audio EQ Cookbook. Write a Rust test for each filter type that verifies:
- Gain at DC
- Gain at the corner frequency
- Gain at Nyquist/2
- Asymptotic rolloff slope

### Task 3.4: Passive crossover validation against XSim
Set up 3 reference crossover circuits that can be computed by hand or verified in XSim:
1. 2nd-order Butterworth LP (series L + shunt C) — verify -3 dB at Fc
2. 4th-order LR LP — verify -6 dB at Fc
3. Zobel + L-pad + notch filter chain — verify each component's individual effect

Write Rust tests with analytical expected values.

---

## Phase 4: Priority Additional Features

**Purpose:** Implement the highest-impact features from the VituixCAD gap analysis that improve the user experience and enable professional workflows.

### Task 4.1: Power dissipation per passive component
**What:** Show how much power each resistor, inductor, and capacitor dissipates at a given drive level.
**Why:** Users need this to size resistors (1W? 5W? 20W?) and check if inductors will saturate.
**Implementation:**
- In `passive_transfer_function()`, compute current through each block using ABCD intermediate voltages/currents
- Return per-block power dissipation as `Vec<f64>` alongside the transfer function
- Add to `SystemResult.ways[i].component_power_watts`
- Display in PassiveWizard next to each component value
- **Commit**

**Ref:** VituixCAD manual p.20 line 672

### Task 4.2: Multiple drivers per way (series/parallel)
**What:** Support 2-4 drivers per way in series, parallel, or series-parallel configurations.
**Why:** MTM (midrange-tweeter-midrange), d'Appolito arrays, multi-sub systems.
**Implementation:**
- Change `Way.driver: DriverParams` to `Way.drivers: Vec<DriverEntry>` with `DriverEntry { params, connection: Series|Parallel }`
- Compute effective T/S parameters for the driver group (e.g., 2× parallel: Vas×2, Sd×2, Re/2, Qes/2)
- UI: driver count selector in WayEditor, show effective combined params
- **Commit**

**Ref:** VituixCAD manual p.7 line 257, p.27 line 904

### Task 4.3: Baffle step diffraction for sealed/vented enclosures
**What:** Model the baffle step (6 dB rise from 2π to 4π radiation) for direct-radiator enclosures.
**Why:** Below the baffle step frequency (~400 Hz for a typical bookshelf), the driver radiates into full space. Above it, it radiates into half-space. This causes a 6 dB level difference that must be accounted for in crossover design.
**Implementation:**
- Add baffle width/height parameters to enclosure configs (Sealed, Vented, etc.)
- Implement Olson-model diffraction: `H(f) = 1 + exp(-j×k×path_diff)` where path_diff is the average distance from driver to baffle edges
- Apply as a multiplicative factor to the raw SPL in `system.rs`
- **Commit**

**Ref:** VituixCAD manual p.30 line 966; Olson, "Direct-Radiator Loudspeaker Enclosures" JAES 1969

### Task 4.4: Listening distance parameter
**What:** Configurable listening distance (default 1m) that affects level scaling and phase calculations.
**Why:** At close distances (<1m), driver offset differences matter more. At far distances (>3m), room effects dominate.
**Implementation:**
- Add `listening_distance_m: f64` to `SpeakerProject` (default 1.0)
- Apply inverse-distance scaling to SPL: `SPL_ref = SPL_1m - 20×log10(d)`
- Apply additional delay from `z_offset_m` relative to listening distance
- Add to SystemPanel UI
- **Commit**

**Ref:** VituixCAD manual p.22 line 729

---

## Execution Summary

| Phase | Tasks | Purpose | Status |
|-------|-------|---------|--------|
| **1** | 1.1–1.4 | Tests with domain understanding | **DONE** (45 E2E tests) |
| **2** | 2.1–2.4 | Fix bugs + planned features | TODO |
| **3** | 3.1–3.4 | Architectural review + correctness | TODO |
| **4** | 4.1–4.4 | Priority VituixCAD gap features | TODO |

Phase 2 tasks are fully specified — implementation only.
Phase 3 tasks require reading reference code/manuals before implementing.
Phase 4 tasks are new features requiring design decisions.

## Dependency Matrix

Every feature change cascades through multiple subsystems. This matrix tracks what each task affects beyond its primary scope.

| Task | Solver | Optimizer | Charts | Schematics | Types/API | URL State | Save/Load |
|------|--------|-----------|--------|------------|-----------|-----------|-----------|
| **2.1 Source impedance** | `crossover.rs` transfer fn | Cost function changes (different passive response) | SPL curves shift slightly (0.3 dB baseline) | No | New field in Way/WayInput | Encode in URL hash | Must serialize/deserialize |
| **2.2 Filter bypass** | Skip bypassed blocks in transfer fn | Must exclude bypassed blocks from param list | Bypassed filters show as dashed/grey in filter gain plot | Bypassed blocks shown greyed in CrossoverSchematic.tsx | New `bypassed` field per block | Encode bypass state | Must serialize |
| **2.3 Optimizer v2** | New cost fn terms (impedance, displacement) | Core change — new algorithms, constraints | Show target curve overlay on SPL plot; show impedance constraint line | No | New OptimizerInput fields | No | Optimizer settings in save |
| **2.4 Optimizer v3** | `locked` flag skips params in extract/apply | Core change — param list UI, crossover mode | No direct chart change | No | `locked` field, `crossover_mode` | No | crossover_mode in save |
| **3.1 Extended Z model** | `driver.rs` impedance formula | Impedance changes affect passive crossover cost | Impedance plot shows Leb/Rss peaks more accurately | No | New `leb_h`, `rss_ohm` fields in DriverParams | Encode new fields | Must serialize |
| **3.2 T/S phase** | `system.rs` complex pressure reconstruction | Better summation → different system SPL → different optimizer cost | System SPL curve changes at crossover region | No | No type changes | No | No |
| **3.3 Filter verification** | Fix any wrong formulas | Cost changes if filter response was wrong | Any filter curve corrections visible | No | No | No | No |
| **4.1 Power dissipation** | Compute per-block power in crossover | No direct effect (power is display-only) | New plot: power per component | Component power shown next to values in schematic | New `component_power_watts` in result | No | No |
| **4.2 Multi-driver** | Effective T/S from parallel/series combo | Must handle multi-driver ways in param extraction | Per-driver curves in way plots | Show multiple drivers in EnclosureSchematic | Vec\<DriverEntry\> replaces single DriverParams | Major URL change | Major save format change |
| **4.3 Baffle diffraction** | New diffraction factor in system.rs | SPL changes → different optimizer cost | SPL curves show baffle step | Baffle dimensions shown in schematic | Baffle width/height in enclosure config | New fields in URL | Must serialize |
| **4.4 Listening distance** | Level + delay scaling in system.rs | Level scaling → different optimizer cost | All SPL values shift by distance factor | No | New field in SpeakerProject | Encode in URL | Must serialize |

### Critical Dependency Chains

```
Source impedance (2.1)
  → Optimizer cost function changes (passive response shifts)
  → All scenario E2E test thresholds may need re-calibration
  → URL state and save/load must include new field

Filter bypass (2.2)
  → Optimizer must not optimize bypassed blocks
  → Schematic must show bypass state visually
  → Filter gain plot should dim/dash bypassed filter curves

Extended Z model (3.1)
  → Passive crossover transfer function gets different Z_load
  → Optimizer cost changes (different passive filter effect)
  → Impedance plot shows different curve shape
  → Biquad export unaffected (active filters independent of Z)

Multi-driver per way (4.2) — HIGHEST COMPLEXITY
  → DriverInputs.tsx must show multiple driver panels
  → PresetSelector must work per-driver, not per-way
  → EnclosureInputs needs combined Vas/Fs/Qts readouts
  → CrossoverPanel sees effective combined impedance
  → SystemPlotArea shows per-driver curves within a way
  → Save/load format breaks backward compat (needs migration)
  → URL hash format changes
  → All E2E tests that select drivers need updating
```

## Rules for Execution

1. **Read the reference materials.** Every task that touches acoustic theory must cite the source. Don't theorize about how loudspeakers work — read Dickason, Thorborg, Olson, or the VituixCAD manual.
2. **Run ALL tests before claiming done.** `cargo test` (101+ Rust tests) AND `npx playwright test` (45+ E2E tests). No exceptions.
3. **Commit after each task.** Don't batch.
4. **Build and deploy after each phase.** `wasm-pack build --release`, `npm run build`, deploy to ls.graf.me.uk.
5. **If a component has zero effect, it's a bug.** Every user-facing control must produce a visible change.
