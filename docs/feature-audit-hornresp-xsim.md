# Feature Audit: LS Graf Simulator vs Hornresp v60 vs XSim4/VituixCAD

Updated 2026-11-03 to reflect current solver and frontend capabilities.

## Status vs Hornresp v60

| Feature | Status in LS Graf Simulator | Notes |
|---------|-----------------------------|-------|
| **7 Enclosure Types (Sealed, Vented, TL, Horn, Bandpass, PR, Open Baffle)** | **Implemented** | All 7 modeled via electromechanical equivalent circuits & TMM |
| **4th- & 6th-Order Bandpass** | **Implemented** | Single-reflex (sealed+vented) and dual-reflex (vented+vented) with complex port summation |
| **Port Organ-Pipe Resonance Detection** | **Implemented** | Computes $f_{\text{pipe}} = c_0 / (2 L_{\text{eff}})$ for vented & bandpass ports with SPL plot markers |
| **Le Cléac'h & Parabolic Horn Profiles** | **Implemented** | 6 flare profiles: Conical, Exponential, Hyperbolic, Tractrix, Parabolic, Le Cléac'h |
| **Extended Voice Coil Inductance ($K_e$ Semi-Inductance)** | **Implemented** | Thorborg frequency-dependent semi-inductance ($Z_{L} = K_e (j\omega)^{0.5}$) |
| **Amplifier Output Resistance ($R_s$)** | **Implemented** | Configurable `source_impedance_ohm` (amp + cable resistance) |
| **Baffle Step & Off-Axis Polar Directivity ($0^\circ, 30^\circ, 60^\circ$)** | **Implemented** | Finite-baffle step + circular-piston directivity $2 J_1(ka \sin\theta)/(ka \sin\theta)$ overlay |
| **Schematic Cross-Section & 3D Cabinet Calculator** | **Implemented** | Live SVG enclosure schematic + panel cut-list calculator |
| **Acoustic Phase Plot** | **Implemented** | Dedicated acoustic phase chart + FRD export with phase |
| **Tapped Horn (Mid-Horn Driver Injection)** | Planned | Requires 3-port TMM junction topology |
| **Impulse / Step Response (Inverse FFT)** | Planned | Time-domain IFFT from complex pressure spectrum |

## Status vs XSim4 / VituixCAD

| Feature | Status in LS Graf Simulator | Notes |
|---------|-----------------------------|-------|
| **FRD/ZMA Measurement Import per Way** | **Implemented** | Replaces T/S simulation per way when measured files are loaded |
| **Automatic Crossover Optimizer (NM / DE / Hybrid)** | **Implemented** | Supports target curves, min-Z constraints, and per-parameter lock checkboxes |
| **Biquad Coefficient Export (miniDSP)** | **Implemented** | Exports 48 kHz / 96 kHz biquad blocks for active crossovers |
| **Filter Bypass Toggles (Active & Passive)** | **Implemented** | Non-destructive per-block bypass in UI, solver, and optimizer |
| **16 Active Filter Types** | **Implemented** | LR2/LR4, Butterworth 1st–4th, Bessel, Chebyshev, PEQ, Lowshelf/Highshelf, Linkwitz Transform, All-Pass |
| **15 Passive Filter Topologies + E-Series Rounding** | **Implemented** | 1st–4th order LP/HP, Zobel, L-pad, RLC notch + E12/E24/E48 snapping |
| **Coaxial 2-Way & Passive Radiator Presets** | **Implemented** | One-click time-aligned coaxial 2-way setups & 1st-party PR templates |
| **Power Dissipation per Passive Component** | Planned | Per-resistor/inductor thermal dissipation spectrum |
| **Multiple Drivers per Way (Series/Parallel MTM)** | Planned | Multi-driver array grouping within a single way |

## Our Advantages Over Both

- **7 enclosure types + N-way active/passive crossover in one browser tool** (Hornresp is desktop-only without multi-way crossover; XSim is crossover-only without enclosure physics)
- **Zero install** — runs in-browser via Rust/WebAssembly at [ls.graf.me.uk](https://ls.graf.me.uk)
- **1,308 verified drivers across 23 manufacturers** with 6-point T/S physics validation, datasheet links, and Before/After Burn-In switching
- **128+ automated Rust & Node tests + 45 Playwright E2E tests** with cited academic equations
- **Shareable URL state (`#v2=`)** and **CLI binary** (`loudspeaker-solver`) for LLM/automated optimization
