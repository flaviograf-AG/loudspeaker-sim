# Gap-Closing Plan — Feature Parity Roadmap

> **Date:** 2026-04-06
> **Based on:** Feature audits vs Hornresp v60, XSim4/VituixCAD, QSpeakers
> **Current state:** 14 Rust modules, 83+ tests, 7 enclosure types, crossover engine, multi-way system, 485 drivers, CLI binary

---

## Priority 1: Quick Wins (Easy, High Impact)

These are low-hanging fruit — each takes <1 hour and directly addresses user-facing gaps.

### P1.1: Vented alignment optimizer
**Gap:** QSpeakers has 6 one-click vented alignments. We have none.
**Plan:** Add `alignment_presets` module with closed-form formulas:
- QB3: Vb = 15×Vas×Qts^2.87, Fb = 0.26×Fs×Qts^(-1.4)
- B4 (Butterworth): Vb = Vas, Fb = Fs
- SC4 (Sub-Chebyshev): Vb from lookup table
- Sealed Qtc=0.707: Vb = Vas / ((0.707/Qts)² - 1)
**UI:** "Suggest alignment" dropdown in enclosure inputs → auto-fills Vb and port length.
**Source:** QSpeakers `portedbox.cpp` alignment functions.

### P1.2: Additional active filter types
**Gap:** Missing Bessel, Chebyshev, LR2, LR6/LR8, shelving, Linkwitz Transform.
**Plan:** Add to `crossover.rs`:
- `Bessel2/4` (known Q values: 0.577/0.691)
- `Chebyshev2/4` (parameterized by ripple dB)
- `LR2LowPass/HighPass` (Q=0.5, 12dB/oct)
- `ShelvingLP/HP` (1st order with gain)
- `LinkwitzTransform { fo, qo, fp, qp }` — pole-zero remapping
**UI:** Add to filter preset dropdown in MultiWayEditor.

### P1.3: Biquad coefficient export
**Gap:** VituixCAD exports miniDSP-compatible biquad coefficients. We don't.
**Plan:** For each active filter, compute the digital biquad via bilinear transform at user-selected sample rate (48kHz default). Export as text file with b0,b1,b2,a1,a2 per section.
**UI:** "Export DSP" button in multi-way mode.

### P1.4: E-series component rounding
**Gap:** VituixCAD rounds passive component values to E12/E24/E48.
**Plan:** Utility function: given a value, return nearest E12/E24/E48 standard value. Apply after wizard computes ideal values.
**UI:** Checkbox "Round to E24" in passive filter section.

### P1.5: Acoustic phase plot
**Gap:** We compute pressure phase internally but don't expose it.
**Plan:** Add `acoustic_phase_deg` to `SimulationResult`. Plot in PlotArea.

### P1.6: Slot/rectangular ports
**Gap:** QSpeakers supports slot ports. We only have circular.
**Plan:** Add `port_shape: PortShape` enum (Circular, Rectangular { width_m, height_m }) to VentedBoxParams. Different end correction formula for rectangular ports (Francis Brooke).

---

## Priority 2: Medium Effort, High Impact

### P2.1: FRD/ZMA import as driver source
**Gap:** XSim/VituixCAD use measured FRD/ZMA as driver data. Our solver only synthesizes from T/S.
**Plan:**
- Solver: Add `DriverSource` enum: `ThieleSmall(DriverParams)` | `Measured { frd: Vec<(f64,f64,f64)>, zma: Vec<(f64,f64,f64)> }`
- System: When measured data is available, use it instead of synthesized SPL/impedance
- UI: File upload button for FRD/ZMA in driver section
- Parser already exists in `io/frd.ts` and `io/zma.ts`

### P2.2: Optimizer (Nelder-Mead on sum-squared-error)
**Gap:** VituixCAD and QSpeakers both have optimizers. We have none.
**Plan:**
- Solver: Implement Nelder-Mead simplex in Rust (or use `argmin` crate)
- Cost function: Σ(SPL(f) - target(f))² over user-defined frequency range
- Parameters: any filter component value, per-way gain/delay
- UI: "Optimize" button with target curve selector (flat, Butterworth shape, custom)
- Stop after 300 iterations or <0.1dB max deviation
**Source:** VituixCAD manual documents the exact cost function and stopping criteria.

### P2.3: Extended voice coil impedance model
**Gap:** Hornresp models Le with loss (Ke semi-inductance). We use simple sLe.
**Plan:** Add optional `ImpedanceModel` to DriverParams:
- `Simple` (current: Re + sLe)
- `SemiInductance { ke, le_bound, rss }` — Ke×s^0.5 model from Thorborg et al.
- Affects impedance above 1kHz — critical for tweeter modeling
**UI:** Advanced toggle showing Ke, Leb, Rss fields.

### P2.4: Schematic cross-section diagram
**Gap:** Hornresp and QSpeakers both show enclosure cross-sections. We show nothing.
**Plan:** SVG rendering of current enclosure:
- Sealed: simple box with driver
- Vented: box with port tube
- TL: folded pipe with driver position and stuffing zones (color gradient)
- Horn: flared profile from segment areas
- Updates in real-time with parameter changes
**UI:** Canvas/SVG component below the plots, or as a tab.

### P2.5: Missing horn profiles
**Gap:** Hornresp has Le Cléac'h, Parabolic, OSWG. We have 4 of 8.
**Plan:** Add to `HornProfile` enum:
- `Parabolic` — S(x) = S1 × (1 + x/L × (√(S2/S1) - 1))²
- `LeCleach` — optimized phase-coherent profile (published formula)
- `OSWG` — oblate spheroidal waveguide (for waveguide tweeters)

---

## Priority 3: Hard, Architecturally Significant

### P3.1: Tapped horn
**Gap:** Popular DIY subwoofer type. Driver injects mid-horn.
**Plan:** New `TappedHorn` enclosure variant. Requires splitting the TMM chain:
- Section A: closed end → driver back
- Section B: driver front → mouth
- Driver sees Section A and B in parallel (similar to TL with offset, but both sections are horn-profiled)
This is architecturally similar to our TL driver_position model but with horn profiles on both sections.

### P3.2: Off-axis / directivity / polar
**Gap:** Both Hornresp and VituixCAD offer off-axis modeling.
**Plan:** Start with piston directivity model: `D(θ) = 2J₁(ka×sin(θ))/(ka×sin(θ))` for circular radiators. For horns, the mouth aperture determines the directivity pattern.
- Add `off_axis_angles` to SimulationInput
- Return per-angle SPL arrays
- Plot as polar chart at user-selected frequency

### P3.3: Free-form circuit topology
**Gap:** XSim supports arbitrary node-based circuits. We have ladder-only.
**Plan:** Full MNA (Modified Nodal Analysis) with arbitrary netlist:
- Component list: each has two node IDs
- Build N×N admittance matrix
- Solve Y×V = I at each frequency
- Much more complex than ABCD ladder but covers bridged-T, lattice, etc.
**Note:** This is needed mainly for advanced crossover topologies. Ladder covers 95% of practical designs.

### P3.4: Impulse / step response
**Gap:** Hornresp computes IR via inverse FFT.
**Plan:** After computing complex pressure at all frequencies, apply inverse FFT to get time-domain impulse response. Step response = integral of IR.
**Dependency:** Requires full-bandwidth complex pressure (magnitude + phase), which we now compute.

### P3.5: 3D/CAD enclosure export
**Gap:** QSpeakers exports OpenSCAD templates for CNC/3D printing.
**Plan:** Generate parameterized SVG or DXF cutting templates for each enclosure type. Include wood thickness, kerf, bracing.

---

## Priority 4: Polish

- P4.1: Undo/redo (state history stack)
- P4.2: Design comparison overlay (multiple designs on same plot)
- P4.3: Driver database enrichment via Scrapling (6000+ from loudspeakerdatabase.com)
- P4.4: Dark mode (GDS dark variants)
- P4.5: Mobile responsive (sidebar collapses)
- P4.6: GitHub Actions CI/CD
- P4.7: URL state encoding (share designs via link)
- P4.8: Power dissipation per component
- P4.9: Maximum SPL calculator (power-limited + displacement-limited curves)

---

## Execution Order

| Sprint | Tasks | Est. Effort | Cumulative Value |
|--------|-------|-------------|------------------|
| S7 | P1.1-P1.6 (quick wins) | 1 session | Alignment wizard, more filters, DSP export, slot ports |
| S8 | P2.1-P2.2 (FRD import + optimizer) | 1-2 sessions | Measurement-driven workflow, automated tuning |
| S9 | P2.3-P2.5 (extended Le, schematic, horn profiles) | 1 session | Accuracy + visual feedback |
| S10 | P3.1-P3.2 (tapped horn + directivity) | 1-2 sessions | Major feature completeness |
| S11 | P3.3-P3.5 (full MNA, IR, CAD export) | 2 sessions | Professional-grade tool |
| S12 | P4.* (polish) | 1-2 sessions | Production quality |
