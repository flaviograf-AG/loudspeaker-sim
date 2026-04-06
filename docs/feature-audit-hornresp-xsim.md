# Feature Audit: Our App vs Hornresp v60 vs XSim4/VituixCAD

Generated 2026-04-06 from exhaustive code analysis.

## Critical Gaps vs Hornresp

| Gap | Impact | Difficulty |
|-----|--------|-----------|
| Tapped horn (driver mid-horn injection) | High — popular DIY subwoofer type | Hard — requires topology change |
| Extended voice coil model (Ke semi-inductance, FDD) | High above 1kHz | Medium |
| Le Cléac'h / Parabolic / OSWG horn profiles | Medium — niche but expected | Easy — add area functions |
| Offset driver horn (Nd=OD) | Medium | Medium |
| Amplifier output resistance (Rs) | Low | Easy |
| Impulse/step response (inverse FFT) | Medium | Medium |
| Directivity/polar pattern | High for horns | Hard |
| Maximum SPL calculator | Medium | Medium |
| Schematic cross-section diagram | High for usability | Medium |
| AkAbak script export | Low | Easy |
| Room gain profile overlay | Low | Easy |
| Acoustic phase as separate plot | Low | Easy |

## Critical Gaps vs XSim/VituixCAD

| Gap | Impact | Difficulty |
|-----|--------|-----------|
| FRD/ZMA import as driver source (measurement-driven) | Critical — bridges sim to real data | Medium |
| Automatic optimizer (Nelder-Mead on sum-sq-error) | Critical — how crossovers are actually tuned | Medium |
| Biquad coefficient export (miniDSP) | High — users need this for real DSP | Easy |
| Free-form circuit topology (not just ladder) | Medium — covers edge cases | Hard |
| Off-axis/polar response (requires measurement data) | High — room behavior | Hard |
| Bessel/Chebyshev/LR6/LR8 filter types | Medium | Easy |
| Shelving filters, Linkwitz Transform | Medium | Easy |
| E-series component rounding (E12/E24/E48) | Medium | Easy |
| Power dissipation per component | Low | Easy |
| Lattice all-pass (passive) | Low | Easy |
| FIR/linear-phase filter blocks | Low — DSP-only | Hard |

## Our Advantages Over Both

- **7 enclosure types in one web tool** (vs Hornresp desktop-only, XSim crossover-only)
- **Zero install** — browser-based, works everywhere
- **Full electromechanical circuit models** with impedance/displacement/group delay (vs QSpeakers SPL-only)
- **Multi-way crossover + enclosure in one app** (Hornresp has no crossover; XSim has no enclosure)
- **83 unit tests with cited equations** (vs no tests in Hornresp/XSim/QSpeakers)
- **485 searchable real drivers** built in
- **CLI binary** for LLM/MCP-driven optimization
