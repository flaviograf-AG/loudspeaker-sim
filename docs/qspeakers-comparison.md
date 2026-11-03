# QSpeakers Feature Comparison

Updated 2026-11-03.

## Parity & Gaps Closed Since Initial Audit

| Feature | QSpeakers | LS Graf Simulator |
|---------|-----------|-------------------|
| **Driver Database** | ~1,100 unverified XML entries | **1,308 verified drivers** across 23 manufacturers with 6-point T/S physics validation, provenance badges, datasheet links, and burn-in state switching |
| **Enclosure Alignments** | Sealed ($Q_{tc}=0.707$) + 6 vented alignments | **One-click Sealed (Butterworth, Bessel, Chebyshev) & Vented (B4, QB3, SC4, EBS) alignments** |
| **Port Geometries & Warnings** | Round & slot ports | **Round & slot ports + port air velocity plot + organ-pipe standing-wave resonance warnings** |
| **Bandpass Enclosures** | 4th-order sealed/vented | **4th-order single-reflex AND 6th-order dual-reflex bandpass** |
| **Cabinet & Cross-Section Visuals** | 2D/OpenSCAD export | **Live SVG enclosure cross-section schematic + interactive Cabinet Cut-List Calculator** |
| **Undo / Redo & Snapshots** | Basic undo/redo | **50-step Undo/Redo (`Ctrl+Z`/`Ctrl+Y`) + A/B Comparison Snapshot overlay** |

## What LS Graf Simulator Does That QSpeakers Doesn't

1. **4 additional enclosure types**: Transmission Line (32-segment TMM), Multi-Segment Horn (6 flare profiles), Passive Radiator (with 1st-party PR presets), and Open Baffle (Olson diffraction)
2. **Multi-way active & passive crossover design**: 15 passive ladder topologies + 16 active DSP filters + live SVG schematic + Nelder-Mead/DE optimizer + miniDSP biquad export
3. **Full electromechanical circuit models**: Includes voice-coil inductance ($L_e$ and $K_e$ semi-inductance), piston radiation impedance, and complex acoustic phase summation
4. **7 interactive diagnostic plots**: SPL (with optional Baffle Step & $0^\circ/30^\circ/60^\circ$ off-axis directivity), electrical impedance + phase, cone excursion vs $X_{\text{max}}$, port air velocity + organ-pipe resonance, group delay, acoustic phase, and crossover filter transfer functions
5. **FRD/ZMA measurement import & export**
6. **Zero-install WebAssembly app** at [ls.graf.me.uk](https://ls.graf.me.uk) + shareable `#v2=` design URLs
