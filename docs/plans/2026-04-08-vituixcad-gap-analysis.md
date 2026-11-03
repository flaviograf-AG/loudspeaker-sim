# Gap Analysis: Our Solver vs VituixCAD

Generated 2026-04-08 from page-by-page VituixCAD manual reading (44 pages) cross-referenced against our actual solver code.

## Confirmed Missing / Broken

| # | Feature | VituixCAD | Our Code | Status |
|---|---------|-----------|----------|--------|
| 1 | **Source impedance configurable** | User sets amp output R + cable R per config (p.27 line 908) | `source_impedance_ohm` in `Way` / `SystemPanel.tsx` | **✓ Fixed** |
| 2 | **Power dissipation per component** | Shows power spectrum for amp, drivers, resistors in passive network (p.20 line 672) | Planned | Open (Medium) |
| 3 | **Extended impedance model (Thorborg 2010)** | Le + Leb + Ke + Rss four-parameter model (p.26 line 856) | `Le` and `Ke` semi-inductance implemented; `Leb`/`Rss` optional | Partial (Medium) |
| 4 | **Multiple drivers per way** | Up to 4 drivers per way, series/parallel/series-parallel (p.7 line 257) | Single `DriverParams` per Way (Coaxial 2-Way preset supported) | Open (Medium) |
| 5 | **Driver X,Y position & Off-Axis Directivity** | Full X,Y,Z positioning per driver (p.8 line 260) | Z-offset + circular-piston $0^\circ/30^\circ/60^\circ$ off-axis directivity overlay | **✓ Directivity Overlay Added** |
| 6 | **Listening distance** | Configurable virtual distance (p.22 line 729) | Fixed 1m reference assumption | Open (Low) |
| 7 | **Baffle diffraction for all enclosures** | Diffraction simulator for any baffle shape (p.39) | Open baffle Olson diffraction + configurable Baffle Step overlay on SPL plot | **✓ Implemented** |
| 8 | **Filter bypass (without delete)** | Per-block bypass checkbox (p.9 line 325) | `bypassed: bool` on `PassiveFilterEntry` and `ActiveFilter` | **✓ Fixed** |
| 9 | **Connection topology** | series/shunt in common net vs driver's net (p.12 lines 430-434) | ABCD ladder topologies (15 blocks) | Open (Low) |
| 10 | **Parameter lock/optimize checkboxes** | Per-parameter Opt checkbox; unchecked = locked (p.13 line 473) | `locked: bool` on `OptParam` + UI checkboxes | **✓ Fixed** |
| 11 | **Passive component values in optimizer** | All R/L/C values optimizable with Opt checkboxes | All passive R/L/C + active freq/gain/Q optimizable | **✓ Fixed** |

## Already Implemented (Parity)

| Feature | Status |
|---------|--------|
| FRD/ZMA import | ✓ Working |
| Active filters (LP/HP 1st-4th, PEQ, shelf, allpass, Linkwitz transform) | ✓ 16 types |
| Passive filters (series/shunt R/L/C, Zobel, L-pad, notch) | ✓ 11 types (now working with source impedance) |
| Biquad coefficient export (miniDSP) | ✓ Working |
| Crossover optimizer (NM, DE, Hybrid) | ✓ Working |
| E-series component snapping | ✓ Working |
| Per-way gain, delay, polarity inversion | ✓ Working |
| Impedance response + min-Z warning | ✓ Working |
| Group delay plot | ✓ Working |

## Priority Order for Implementation

### Immediate (affects correctness)
1. Source impedance as user parameter (currently hardcoded)
2. Parameter locks in optimizer (v3 plan Task 1+3)
3. Passive component values in optimizer (v3 plan Task 5)

### Next Sprint (professional features)
4. Filter bypass toggle
5. Power dissipation per component
6. Extended impedance model (Leb + Rss)

### Future (advanced)
7. Multiple drivers per way
8. Baffle diffraction for all enclosures
9. Driver X,Y positioning
10. Connection topology variants
11. Listening distance parameter

## Key Architectural Insight from VituixCAD

VituixCAD treats **measurement data as primary** and **T/S simulation as secondary**. Their workflow:
1. Measure the driver in its actual enclosure
2. Import FRD/ZMA
3. Design crossover on measured data
4. Enclosure tool is separate — used during driver selection, not during crossover design

Our app bridges both worlds (T/S simulation AND FRD import), which is an advantage but also means we must handle both paths correctly. The shunt component bug (fixed today) was a case where the simulation path was incomplete.
