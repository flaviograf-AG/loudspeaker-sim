# LS Graf Simulator

**Browser-based loudspeaker design & crossover simulation tool.**

Live at **[ls.graf.me.uk](https://ls.graf.me.uk)**

[![LS Graf Simulator](https://ls.graf.me.uk/ls-blueprint.png)](https://ls.graf.me.uk)

## Features

### Enclosure Modeling (7 types)
- **Sealed** — with Ql box losses and alignment presets (Butterworth/Bessel/Chebyshev)
- **Vented** — Helmholtz resonator with port velocity, slot ports, alignment presets (B4/QB3/SC4/EBS)
- **Transmission Line** — TMM chain with driver offset, 3 taper profiles, per-zone stuffing, fold losses
- **Horn** — multi-segment (up to 4), 6 flare profiles (Conical/Exp/Hyperbolic/Tractrix/Parabolic/Le Cléac'h)
- **Bandpass** — 4th-order sealed rear + vented front
- **Passive Radiator** — sealed box with mass-spring radiator
- **Open Baffle** — dipole with baffle step diffraction

### Crossover Design
- **Passive crossover** — 15 standard topologies (1st-4th order LP/HP, Zobel, L-pad, notch)
- **Active filters** — 16 types (LR4, Butterworth, Bessel, PEQ, shelving, Linkwitz Transform, all-pass)
- **Multi-way system** — N-way with per-way gain, delay, polarity, Z-offset
- **Complex acoustic summation** — phase-correct inter-driver summing
- **Nelder-Mead optimizer** — auto-tunes filter frequencies and gains
- **Biquad DSP export** — miniDSP-compatible coefficients
- **SVG circuit schematic** — live crossover circuit diagram

### Analysis & Visualization
- SPL frequency response (auto-scaled)
- Impedance magnitude + phase (dual Y-axis)
- Cone displacement with Xmax limit line
- Port air velocity
- Group delay
- Acoustic phase
- Filter transfer function (crossover attenuation per way)
- Minimum impedance warning (<3.2 Ohm)
- Cross-chart tooltip linking
- Enclosure cross-section schematic (SVG)

### Driver Database
- **571 real drivers** from 30+ manufacturers
- Searchable by vendor and model name
- Covers woofers, tweeters, midrange, full-range, coaxial, compression
- Sources: QSpeakers (GPL), manufacturer datasheets, web scraping

### Workflow Features
- Undo/Redo (Ctrl+Z/Y, 50-step history)
- Comparison snapshots (overlay before/after)
- FRD/ZMA file import per way (measured driver data replaces T/S simulation)
- FRD/ZMA/CSV export with real acoustic phase
- JSON design save/load + import/export (auto-migrates legacy formats)
- URL state encoding (shareable design links, `#v2=` format)
- CLI binary for automation/LLM integration

## Architecture

```
solver/          Rust crate → WASM (16 modules, 100 tests)
web/             React 19 + Vite + TypeScript frontend
  compute.ts     buildSolverInput() — DesignState → SystemInput (one-way, pure)
  App.tsx        DesignState single source of truth, accordion sidebar
  WayEditor      Driver + preset + FRD/ZMA per way
  CrossoverPanel Crossover points + per-way EQ + passive wizard
  SystemPanel    Freq range + optimizer + save/load + export
```

## Build

```bash
cd solver && wasm-pack build --target web --release
cd web && npm install && npm run build
```

## References

Small (1972-1973), Beranek (1954), Bailey (1965), King (2005-2020), Bradbury (1976), Keele (1979), Thorborg (2010), Bristow-Johnson (Audio EQ Cookbook).

## License

MIT
