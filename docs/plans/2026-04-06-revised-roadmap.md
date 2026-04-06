# Revised Development Roadmap — Post-Architectural Review

> **Date:** 2026-04-06
> **Context:** After deep analysis of Hornresp v60 (148-page manual, data format, strings dump), VituixCAD v1.1 (44-page manual, full text extraction), and XSim workflow — this plan replaces the original Sessions 4-6 with a feature-parity-driven approach.

---

## Current State (after S2 + S3 + bug fixes)

**Solver:** 8 modules, 60 tests. Sealed + Vented + TL with driver offset, 3 taper profiles, per-zone stuffing (full Bradbury), fold losses, Ql box losses, proper group delay, input validation.

**Frontend:** React 19 + ECharts + GDS. 5 plots (SPL, impedance+phase, displacement+Xmax, port velocity, group delay). Cross-chart tooltip linking. Driver presets. Save/load/export.

**What's missing** (informed by Hornresp + VituixCAD analysis):

### Solver gaps vs Hornresp
- Horn profiles (exponential, hyperbolic, catenoidal, tractrix, Le Cléac'h — the T-parameter system)
- Multi-segment horn geometry (S1→S5, up to 4 segments with independent profiles)
- Nd multi-driver configs (series/parallel, offset driver OD, compound horn CH)
- Passive radiator model
- Bandpass enclosures (4th/6th/8th order)
- Open baffle (flat, H, U)
- Throat chamber (Vtc/Atc)
- Filter wizard (Linkwitz transform, parametric EQ, shelving, HP/LP)
- Rear chamber distributed resonances (Lrc interaction with Vrc)
- Semi-inductance / lossy Le driver model
- Temperature/humidity correction on constants
- Maximum SPL calculator (power compression, excursion limits)

### Solver gaps vs VituixCAD
- Crossover network MNA solver (passive RLC with driver impedance as load)
- Active filter blocks (IIR biquads: LP/HP/AP/PEQ/shelf, all standard alignments)
- FIR linear-phase filters
- Multi-way system model (up to 6 ways, 4 drivers/way)
- Complex acoustic summation with driver position offsets (X/Y/Z → phase delay)
- Polarity inversion per way
- Optimizer (cost function: sum-of-squared-error vs target curve)
- FRD/ZMA import for measured driver data
- Baffle diffraction model
- Power response / directivity index
- Biquad coefficient export (miniDSP compatible)

### Frontend gaps
- **No tooltips** on any input — GDS requires tooltips for every field
- **Per-segment stuffing** not exposed (solver supports zones, UI doesn't)
- **No horn parameter UI** (S1-S5, L12-L45, Con/T-parameter, F12-F45)
- **No Nd multi-driver selector**
- **No chamber type switcher** (rear lined / rear vented / passive radiator / throat adapter)
- **No filter wizard UI**
- **No schematic diagram** (cross-section visualization)
- **No Vtc/Atc (throat chamber) inputs**
- **No computed readouts** (Fb, Fc, Qtc, sensitivity, efficiency)
- **No comparison overlay** (multiple designs on same plot)
- **Drive voltage / sweep range not user-configurable**
- **FRD/ZMA import** exists in io/ but no UI to load and overlay measured data

---

## Revised Sessions

### Session 4: Full Enclosure Parameter Parity

**Goal:** Match Hornresp's input flexibility. Every parameter that Hornresp exposes must be settable in our UI.

#### 4.1 Solver: Multi-segment horn geometry
- Extend `EnclosureConfig` with `Horn` variant
- Types: `HornParams { segments: Vec<HornSegment>, throat_chamber: Option<ThroatChamber>, rear_chamber: RearChamber }`
- `HornSegment { area_start_m2, area_end_m2, length_m, profile: HornProfile, cutoff_hz: Option<f64> }`
- `HornProfile` enum: Conical, Exponential, Hyperbolic(t_param), Parabolic, Tractrix, LeCleach
- `ThroatChamber { volume_m3, area_m2 }`
- `RearChamber` enum: Lined { volume_m3, depth_m, flow_resistivity, thickness }, Vented { volume_m3, port_area_m2, port_length_m }, PassiveRadiator { volume_m3, added_mass_kg }
- Implement horn solver using TMM with profile-dependent area functions
- Implement throat chamber as lumped compliance + distributed resonance model

#### 4.2 Solver: Nd multi-driver
- `DriverConfig` enum: Single, Series(n), Parallel(n), SeriesParallel(s, p), OffsetDriver, CompoundHorn
- Composite T/S parameter derivation (Sd_composite = Sd×S×P, etc.)
- Offset driver: driver mounted inside horn path (splits horn into two coupled sub-sections)

#### 4.3 Solver: Passive radiator
- Model as a driver with Cms_pr, Mms_pr (no motor) mechanically coupled to the box volume
- Transfer function: similar to vented but with mass-compliance resonator instead of port mass

#### 4.4 Solver: Bandpass (4th order)
- Two-chamber model: sealed rear + vented front
- Extension of vented model with additional compliance

#### 4.5 Solver: Open baffle
- No box compliance; driver radiates into free space front and back
- Dipole cancellation model: SPL = |p_front - p_back| with path length difference

#### 4.6 Frontend: Full parameter UI
- **Horn inputs**: segment count selector (1-4), per-segment S, L, Con/profile, F-cutoff
- **Rear chamber type switcher** (lined/vented/passive radiator)
- **Throat chamber inputs** (Vtc, Atc)
- **Nd multi-driver selector** (series/parallel config dialog)
- **Per-segment stuffing UI**: visual zone editor with drag handles (start%, end%, density, flow_resistivity per zone)
- **Computed readouts panel**: Fc, Qtc, Fb, efficiency, sensitivity, f3 (-3dB point)
- **Tooltips on EVERY input** (GDS requirement): parameter name, unit, typical range, physical meaning
- **Drive voltage and sweep range inputs** (currently hardcoded 2.83V, 10-20kHz, 500 points)

#### 4.7 Tests
- Horn profile area functions (analytical verification for each profile type)
- Multi-segment cascade matches single-segment for uniform profile
- Passive radiator impedance has 2 peaks (same as vented)
- Bandpass has bandpass-shaped SPL response
- Open baffle shows dipole null at expected frequency
- Nd series/parallel composite params match manual calculation

### Session 5: Crossover Engine + Multi-Way

**Goal:** Match VituixCAD's core crossover workflow. MNA solver for passive networks, active filter blocks, multi-way complex acoustic summation.

#### 5.1 Solver: MNA matrix builder
- Component stamping: R, L (with DCR), C into admittance matrix
- Driver impedance as frequency-dependent load (from ZMA data or computed from T/S + enclosure model)
- Voltage source (amplifier) with internal impedance
- Solve Y×V = I at each frequency → node voltages → driver voltages → per-way transfer function

#### 5.2 Solver: Passive filter blocks
- All VituixCAD primitives: R, C, R+L, R+C, R∥C, (R+L)∥R, (R+L)∥(R+C), parallel notch, series notch, Zobel, L-pad, lattice all-pass
- Wizard function: given filter type (Butterworth/LR/Bessel 1st-4th) + crossover frequency + load impedance → compute component values
- Up to 15 blocks per way

#### 5.3 Solver: Active filter blocks (IIR biquads)
- Standard biquad transfer function: H(z) = (b0 + b1z⁻¹ + b2z⁻²) / (1 + a1z⁻¹ + a2z⁻²)
- Computed in analog domain (s-plane) then applied as frequency-dependent complex gain
- Types: LP/HP (1st-4th order, all alignments), PEQ, shelving, all-pass, Linkwitz transform
- Biquad coefficient export for miniDSP

#### 5.4 Solver: Multi-way system model
- `SpeakerProject { ways: Vec<Way>, listening_distance_m }`
- `Way { name, drivers: Vec<WayDriver>, active_filters, passive_filters, gain_db, delay_us, polarity_inverted, enabled }`
- `WayDriver { driver_params, enclosure_config, position_xyz_m, frd_data, zma_data }`
- Complex summation: `p_total(f) = Σ way_i.transfer(f) × way_i.spl(f) × exp(-j×2πf×delay_i/c)`
- Per-way and total SPL, impedance, group delay outputs

#### 5.5 Solver: FRD/ZMA import as driver data
- Parser already exists in test_utils.rs — promote to production code
- Interpolate measured data to simulation frequency grid
- Use as driver load impedance in MNA (replaces computed Ze)
- Use as driver SPL response in system summation (replaces computed SPL)

#### 5.6 Frontend: Crossover UI
- **Way tabs** at top of sidebar: one per way + "Add Way" button
- Each way tab: driver inputs (T/S or FRD/ZMA import), enclosure selector, filter chain editor
- **Filter chain editor**: drag-to-reorder list of filter blocks, "Add Block" dropdown with all types
- **Schematic view**: visual circuit diagram (series/shunt path with component values)
- **System view**: combined SPL plot with per-way traces (different colors) + total (black/thick)
- **Optimizer panel**: target curve editor (draw or select standard HP/LP/BP), start/stop, iteration log
- **Tooltips on all crossover inputs**

#### 5.7 Tests
- MNA: verify known 2nd-order Butterworth LP/HP produces correct -3dB at crossover
- Passive filter with reactive load (driver ZMA) differs from resistive load
- Zobel flattens impedance rise from Le
- Complex summation: two drivers with 180° polarity inversion cancel
- Acoustic offset: 10cm driver spacing produces comb filtering at expected frequencies
- Optimizer: starting from flat, can achieve ±1dB of a Butterworth target in <100 iterations

### Session 6: Polish + Optimizer + Deployment

#### 6.1 Schematic diagram view
- 2D cross-section rendering of the current enclosure (horn profile, chamber, port, driver position)
- SVG/Canvas rendering, updates in real-time with parameter changes
- Export as SVG for construction drawings

#### 6.2 Comparison overlay
- Save snapshots of current simulation
- Overlay multiple designs on the same plot (different line styles/colors)
- Toggle individual overlays on/off

#### 6.3 LLM variable inventory document
- For Session 6 Claude-as-Optimizer: complete variable inventory
- Inputs: every adjustable parameter with name, type, unit, valid range, physical meaning, sensitivity
- Outputs: every result field with interpretation guide
- Optimization strategies: which variables to sweep for which goals

#### 6.4 CLI binary + MCP server
- `solver/src/main.rs`: stdin JSON → stdout JSON
- MCP tools: simulate, evaluate (flatness/extension/impedance metrics), sweep (parameter scan), suggest_alignment
- Optimization skill for Claude

#### 6.5 Deployment + CI
- GitHub Actions: build WASM + frontend on push, deploy to VPS
- URL state encoding (share designs via URL hash)
- Dark mode (GDS dark section variants)
- Mobile responsive (sidebar collapses)

---

## Priority Order

1. **Session 4** — most impactful for feature parity. Users currently can't model horns, bandpass, or multi-driver configs. The UI is also missing critical controls and tooltips.
2. **Session 5** — the crossover engine is the unique value proposition (no other web tool does this).
3. **Session 6** — polish and optimization. The LLM integration is the long-term differentiator.

## Key Lesson

Every feature must be designed by studying how Hornresp and VituixCAD implement it first — their data formats, parameter ranges, and edge cases. Then implement from the published physics with that understanding. Never code from the plan alone.
