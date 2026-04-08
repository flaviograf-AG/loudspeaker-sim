# Loudspeaker Simulator — TODO

> **Last updated:** 2026-04-08
> **Current state:** 16 Rust modules, 100 tests, 7 enclosure types, crossover engine, multi-way system, 571 drivers, CLI binary. UI rewrite v2 deployed. Live at https://ls.graf.me.uk

---

## Next Up: Optimizer v3 — Passive Component Tuning + Parameter Locks

### Context
The optimizer currently tunes active filter frequencies and per-way gains. It does NOT modify passive component values (L, C, R). Users want to design a passive crossover topology, then let the optimizer refine the component values while keeping certain parameters fixed (e.g., crossover frequency).

### What to build

**A. Passive component optimization** — new `OptParam` variants:
- `PassiveL { way_idx, filter_idx }` — optimizes inductor henries
- `PassiveC { way_idx, filter_idx }` — optimizes capacitor farads
- `PassiveR { way_idx, filter_idx }` — optimizes resistor ohms
- Bounds: L 0.01-10 mH, C 0.1-100 µF, R 0.1-50 Ω

**B. Parameter lock/fix toggle** — user marks any optimizable parameter as "fixed":
- `fixed: bool` field on each `OptParamJson` (default false)
- Fixed params excluded before passing to optimizer
- Primary use case: lock crossover freq, optimize gains + passive values
- UI: lock icon toggle next to each parameter

### Files to modify
- `solver/src/optimizer.rs` — OptParam enum, extract/apply, bounds
- `solver/src/system_api.rs` — OptParamJson variants + fixed field
- `solver/src/lib.rs` — wire fixed param filtering
- `web/src/components/OptimizerPanel.tsx` — param list UI with lock toggles

### Tests
- Passive L/C/R extraction and application
- Fixed params excluded from optimization
- Optimizer with passive params converges
- E2E: lock crossover freq, run optimizer, verify freq unchanged

### Reference
- Existing optimizer plan: `docs/plans/2026-04-07-optimizer-v2.md` (Tasks 1-6 all done)
- User requirements: memory `project_optimizer_v2_requirements.md`

---

## Completed (2026-04-08 session)

- [x] **UI Rewrite v2** — DesignState single source of truth, clean component tree
  - App.tsx: 574→250 lines, accordion sidebar, way tabs
  - New: WayEditor, CrossoverPanel, PassiveWizard, SystemPanel, SaveLoad
  - Deleted: MultiWayEditor, SaveLoadControls, useUrlState, useDesignStore, WaySummary
  - compute.ts: buildSolverInput() — one-way pure function, no reverse path
  - NumericInput: local draft state + live onChange on every keystroke
  - Save/load: v2 format with auto-migration from v1
  - SetupWizard: preserved with DesignState conversion
  - Stable callbacks via designRef pattern
  - Accessibility: sidebar drag handle keyboard support
  - 46 E2E Puppeteer tests passing
  - 100 solver tests passing
  - Deployed to ls.graf.me.uk

---

## Previously Completed

- [x] S2-S7: All original development (see git history)
- [x] Optimizer v2: target curves, DE algorithm, constraints, E-series, Two-Phase, L-Pad
- [x] FRD/ZMA solver bridge — measured driver data for system simulation
- [x] 571 driver database from 30+ manufacturers
- [x] CLI binary for automation/LLM integration

---

## Backlog — Priority 1

- [ ] **Scrapling driver DB enrichment** — bulk import from loudspeakerdatabase.com (6000+ drivers)
- [ ] **Tapped horn** — driver mid-horn injection
- [ ] **GitHub Actions CI/CD** — build + auto-deploy on push

## Backlog — Priority 2

- [ ] **Extended Le model UI** — expose Ke field with toggle
- [ ] **Off-axis / directivity** — piston directivity model
- [ ] **Impulse / step response UI** — solver function exists, needs plot
- [ ] **Dark mode** — GDS dark section variants
- [ ] **Mobile responsive** — sidebar collapses to bottom drawer
- [ ] **Inline styles → CSS classes** — for responsive/theming

## Backlog — Priority 3

- [ ] Full MNA netlist (arbitrary circuit topology)
- [ ] 3D/CAD enclosure export
- [ ] Power dissipation per component
- [ ] Driver parameter extraction from impedance measurement
- [ ] Room gain overlay
- [ ] Series/parallel driver arrays
- [ ] FIR/linear-phase filter targets
- [ ] LTspice netlist export

---

## Lessons Learned

- Validate through code, not external tools — Hornresp/XSim are references, not oracles
- Port phase sign matters — vented port subtracts from driver (u_driver - u_port)
- NumericInput must fire onChange on every keystroke, not just blur — charts must update live
- E2E tests must use real Puppeteer clicks, never page.evaluate(() => el.click())
- When rewriting a component, compare ALL interaction patterns against the old version
- Don't claim "N tests passing" as proof — test the thing the user actually does
