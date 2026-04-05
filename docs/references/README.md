# Reference Materials

These documents inform the design and implementation of the loudspeaker simulator. They are reference material for understanding existing tools and workflows, NOT source code to copy.

## Software Manuals

| File | Software | Author | Content |
|------|----------|--------|---------|
| `hornresp-manual.pdf` | Hornresp v60 | Dominique Petoin (unofficial manual) | 148 pages. Full feature walkthrough: 20+ enclosure types, all analysis tools, file I/O (FRD/ZMA/AkAbak export), filter wizard, horn parameter guide |
| `xsim-step-by-step.pdf` | XSim4 Crossover Designer | DIY practitioner guide | 3 pages. Real-world crossover development workflow using OmniMic + DATS measurements, FRD/ZMA file creation, mod delay alignment, BSC, phase tracking |
| `loudspeakersoft-intro.pdf` | LoudspeakerSoft 2.4.0a | Heinrich Weber (IGDH) | 7 pages. German. Alternative crossover sim with horizontal/vertical FR import, polar map visualization, manual component tweaking. Accepts FRD/ZMA/TXT formats |
| `vituixcad-help.pdf` | VituixCAD 1.1 | Kimmo Saunisto (author), Joni Laakso (manual) | 44 pages. THE gold standard for free crossover design. Up to 6-way, 4 drivers/way. Built-in enclosure tool, response merger, diffraction simulator, optimizer, polar/directivity analysis, impulse response export, biquad coefficient export, driver database. Full text extraction in `vituixcad-extracted.txt` |

## VituixCAD — Feature Benchmark (the tool to beat)

VituixCAD is the most capable free loudspeaker design tool. Key features we should aspire to:

**Architecture:**
- Up to 6-way speaker, 4 drivers per way, series/parallel configs
- Driver positioning: X/Y/Z coordinates + rotation/inclination
- Listening distance parameter for phase/amplitude calculations

**Crossover design:**
- 15 filter blocks per way (active + passive)
- Active: LP/HP (1st–8th order, Butterworth/Bessel/Cheby/LR + linear-phase variants), shelving, Linkwitz transform, all-pass, parametric EQ
- Passive: R, C, R+L, R+C, R||C, parallel notch, series notch, lattice all-pass, L-pad, Zobel, and complex multi-component blocks
- Wizard for common filter types with auto-calculated component values
- Block insert/replace/append modes, drag-and-drop, undo (10 levels)
- Biquad coefficient export (miniDSP compatible)

**Optimization:**
- Automated optimizer: target axial SPL and/or power response
- Per-way target curves (HP/LP/BP, any order/type)
- Adjustable weighting between axial and power response
- Minimum impedance constraint
- Component rounding to E12/E24/E48 standard values

**Analysis (6 simultaneous graphs):**
- SPL (total + per way + per driver, with phase)
- Power response + Directivity Index (calculated from polar measurements)
- Directivity (line chart, area, surface, polar map/heat map, polar plot)
- Group delay + phase (normal, excess, minimum)
- Filter gain per driver
- Impedance (magnitude + phase, total + per way)

**Built-in tools:**
- Enclosure tool (closed, bass reflex, double-tuned BR, passive radiator, bandpass types 1-3)
- Response Merger (near-field + far-field splicing)
- Calculator (FFT, smoothing, manipulation)
- Diffraction simulator (baffle edge effects)
- SPL Trace (target curve creation)
- Power dissipation calculator
- Impulse response export (WAV/TXT, 16/32/64-bit, for DSP/FIR convolver)

**File formats:**
- Input: FRD, ZMA, TXT (tab/space/semicolon delimited) — compatible with ARTA, Clio, REW, OmniMic, SoundEasy, XSim, etc.
- Export: FRD, ZMA, CSV, WAV (impulse response), TXT (biquad coefficients), miniDSP binary
- Project: `.vxp` files
- Driver database: tab-delimited TXT (editable in Excel)
- LspCAD extended format support

**What VituixCAD does that we should plan for:**
- Polar/directivity visualization from multi-angle measurements
- Power response (not just on-axis SPL)
- Baffle diffraction simulation
- Near-field + far-field response merging
- Optimizer with per-way target curves
- DSP export (biquad coefficients, FIR impulse responses)

## Key Workflow Insights (from XSim Step by Step)

The real-world crossover design workflow that our app must support:

1. **Build enclosure**, mount all drivers
2. **Measure each driver individually** in-box → produces FRD (frequency response) + ZMA (impedance) files
3. **Measure driver combinations** (e.g., mid+tweeter together) → additional FRD files for alignment verification
4. **Import FRD + ZMA** into crossover designer
5. **Set mod delay** (time alignment between drivers) by overlaying measured combo FRD against simulated combo
6. **Design crossover** by adding/tweaking R, L, C components, watching:
   - Combined frequency response (all drivers summed)
   - Per-driver response through crossover
   - Phase tracking between drivers at crossover point
   - System impedance (must stay > 3 ohms, avoid high negative phase angle)
7. **Iterate**: adjust component values, check baffle step compensation, verify with measurements

## Online Resources

- diyAudio XSim threads: https://www.diyaudio.com/community/threads/xsim-free-crossover-designer.259865/
- Hornresp download: http://www.hornresp.net.ms/
- XSim4 download: https://www.libinst.com/FreeAppDownloads/XSim4Setup.exe
- VituixCAD: https://kimmosaunisto.net/Software/VituixCAD/VituixCAD2.php
- VituixCAD driver database: https://kimmosaunisto.net/ (online, also downloadable as TSV)
- Martin King TL papers: http://www.quarter-wave.com/
- diyAudio crossover workflow thread: https://www.diyaudio.com/community/threads/412282/
