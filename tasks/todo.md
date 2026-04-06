# Loudspeaker Simulator — TODO

> **Last updated:** 2026-04-07
> **Current state:** 16 Rust modules, 85+ tests, 7 enclosure types, crossover engine, multi-way system, 571 drivers, CLI binary. Live at https://ls.graf.me.uk

---

## Completed

- [x] S2: Analytical validation (9 tests) + UI wins (impedance phase, group delay, cross-chart linking, port calc)
- [x] S3: Extended TL (driver offset, tapers, stuffing zones, folds)
- [x] Bug fixes: Ql losses, group delay formula, full Bradbury, input validation, TL perf, vented port phase
- [x] S4: Horn solver (6 profiles), bandpass, passive radiator, open baffle
- [x] S4: Tooltips on all inputs, computed readouts, per-zone stuffing editor, simulation settings
- [x] S4: Driver database (571 drivers from 30+ vendors — QSpeakers + curated + scraped)
- [x] S5: Crossover engine (passive ABCD ladder, 16 active filter types, component presets)
- [x] S5: Multi-way system solver + UI (way tabs, filter editor, system SPL overlay)
- [x] S5: Optimizer (Nelder-Mead) + UI
- [x] S6: CLI binary (stdin JSON → stdout JSON)
- [x] S6: LLM variable inventory document
- [x] S7: Alignment presets (sealed BW/Bessel/Cheby, vented B4/QB3/SC4/EBS)
- [x] S7: Additional filter types (LR2, shelving, Linkwitz Transform, Ke semi-inductance)
- [x] S7: Biquad DSP export (miniDSP compatible)
- [x] S7: Acoustic phase plot + FRD export with real phase
- [x] S7: Slot/rectangular ports + E-series rounding
- [x] S7: FRD/ZMA file import + overlay on plots
- [x] S7: Passive crossover topology library (15 presets, 1st-4th order)
- [x] S7: SVG crossover schematic diagram
- [x] S7: SVG enclosure cross-section schematic
- [x] S7: Filter transfer function plot + min impedance warning
- [x] S7: Undo/redo (Ctrl+Z/Y) + comparison snapshots
- [x] S7: URL state encoding (shareable design links)
- [x] S7: Resizable sidebar with drag handle
- [x] S7: Complete tooltip coverage
- [x] S7: Parabolic + Le Cléac'h horn profiles
- [x] SEO: Full OG + Twitter Card + Schema.org structured data
- [x] Cross-validation: vented port phase verified vs QSpeakers C++ source

---

## Remaining — Priority 1 (High Impact)

- [ ] **Scrapling driver DB enrichment** — bulk import from loudspeakerdatabase.com (6000+ drivers) via MCP
- [ ] **More manufacturer drivers** — scrape remaining sites (Sica, LaVoce, Mundorf AMT, Parts Express)
- [ ] **Tapped horn** — driver mid-horn injection (topology change needed)
- [ ] **GitHub Actions CI/CD** — build WASM + frontend on push, auto-deploy

## Remaining — Priority 2 (Medium)

- [ ] **Extended Le model UI** — expose Ke field in driver inputs with toggle
- [ ] **Off-axis / directivity / polar pattern** — piston directivity model
- [ ] **Impulse / step response** — inverse FFT (solver function exists, needs UI)
- [ ] **Dark mode** — GDS dark section variants
- [ ] **Mobile responsive** — sidebar collapses to bottom drawer
- [ ] **Keyboard shortcuts** — Ctrl+S save, Ctrl+N new

## Remaining — Priority 3 (Future)

- [ ] **Full MNA netlist** — arbitrary circuit topology (not just ladder)
- [ ] **3D/CAD enclosure export** — OpenSCAD or SVG cutting templates
- [ ] **Power dissipation per component** — heat in each resistor
- [ ] **Driver parameter entry from measurement** — impedance sweep → T/S extraction
- [ ] **Room gain overlay** — listening room EQ compensation
- [ ] **Nd multi-driver composite** — series/parallel driver arrays within one way
- [ ] **Lossy Le UI** — full Thorborg 4-parameter impedance model
- [ ] **FIR / linear-phase filters** — for DSP targets
- [ ] **LTspice integration** — export crossover as SPICE netlist

---

## Lessons Learned

- Validate through code, not external tools — Hornresp/XSim are references, not oracles
- Study reference code (QSpeakers C++, Hornresp data format) BEFORE designing
- Port phase sign matters — vented box port output subtracts from driver (u_driver - u_port)
- Ql = high R = low loss (not the other way around)
- CSS `resize: horizontal` is unreliable — use JavaScript drag handles instead
- Group delay = -dφ/dω (numerical differentiation), NOT phase/ω (phase delay)
- Full Bradbury: k_c = k₀×√(1+Rf/jωρ₀), not just k₀ - jα
