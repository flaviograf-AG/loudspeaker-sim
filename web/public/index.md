# LS Graf Simulator — Online Loudspeaker Enclosure & Crossover Design CAD

**LS Graf Simulator** ([https://ls.graf.me.uk/](https://ls.graf.me.uk/)) is a free, browser-based **loudspeaker enclosure calculator**, **passive RLC & active DSP crossover simulator**, **horn & transmission-line Transfer Matrix Method (TMM) solver**, and **3D speaker cabinet cut-list generator**. Powered by a Rust/WebAssembly acoustic physics engine and a verified **1,308-driver Thiele-Small database**, it serves as a unified, cross-platform online alternative to WinISD, VituixCAD, XSim, Boxsim, and Hornresp.

---

## What is LS Graf Simulator?

LS Graf Simulator is an integrated acoustic engineering web application that simulates the complete electro-mechano-acoustical chain of a 1-way, 2-way, 3-way, or 4-way loudspeaker system in real time (`20 Hz – 20 kHz`). Unlike standalone box calculators that ignore crossover interaction or standalone crossover simulators that ignore cabinet baffle width and port loading, LS Graf Simulator shares **driver Thiele-Small parameters, enclosure volume and port tuning, front-baffle dimensions, and active/passive crossover filters** across one unified model.

---

## Supported Loudspeaker Enclosure Alignments

| Enclosure Type | Acoustic Model | Key Design Parameters & Readouts | Typical Applications |
|---|---|---|---|
| **Sealed (Closed Box)** | 2nd-order acoustic suspension (12 dB/oct roll-off) | Volume $V_b$ (L), Loss $Q_l$, System Resonance $F_c$, Total $Q_{tc}$ (Bessel 0.577, Butterworth 0.707, Chebyshev) | Studio monitors, audiophile subwoofers, midrange chambers, Linkwitz Transform systems |
| **Vented (Bass-Reflex)** | 4th-order Helmholtz resonator (24 dB/oct roll-off) | Volume $V_b$ (L), Port Area $S_p$, Port Length $L_p$, Target $F_b$ ($B4, QB3, SC4, EBS$), Circular/Slot port, Pipe resonance $f_{\text{pipe}}$, Port velocity $V_{\text{port}}$ (m/s) | Bookshelf speakers, floorstanding towers, PA subwoofers, home theater subs |
| **Passive Radiator** | 4th-order drone-cone mass-spring resonator | Box Volume $V_b$, PR area $S_{d,\text{PR}}$, compliance $C_{ms,\text{PR}}$, moving mass $M_{ms,\text{PR}}$, mechanical loss $R_{ms,\text{PR}}$ | Compact subwoofers and desktop monitors where a physical port tube would be too long or chuff |
| **Bandpass (4th & 6th Order)** | Coupled rear & front chambers (single-reflex or dual-reflex) | Rear volume $V_{\text{rear}}$, Front volume $V_{\text{front}}$, Front & Rear port tuning $F_{b,\text{front}}, F_{b,\text{rear}}$ | Dedicated high-efficiency narrow-band subwoofers |
| **Transmission Line (TL)** | 2×2 Transfer Matrix Method (TMM) quarter-wave waveguide | Line length $L$, Driver & Mouth areas ($S_0, S_L$), Straight/Conical/Exponential taper, Driver offset $\%$, Folds, Multi-zone Delany-Bazley stuffing | Audiophile full-range and 2-way quarter-wave floorstanders ($\lambda/4 = c / 4L$) |
| **Horn-Loaded** | Multi-segment TMM waveguide with rear compression chamber | Up to 4 cascaded Conical, Exponential, Hyperbolic ($T$-parameter), or Tractrix segments + Sealed/Vented rear chamber | High-efficiency PA bass horns, mid-horns, and compression driver waveguides |
| **Open Baffle (Dipole)** | Finite-baffle figure-8 dipole cancellation model | Baffle Width $W$, Height $H$, Driver asymmetric offset | Dipole open-baffle audiophile loudspeakers |

---

## Passive RLC & Active DSP Crossover Design Features

| Crossover Mode | Supported Filters & Circuit Topologies | Built-in Engineering Workflows |
|---|---|---|
| **Passive RLC Network** | Series & Shunt $L, C, R$; 1st-order Butterworth; 2nd-order & 4th-order Linkwitz-Riley (`LR2`, `LR4`) & Butterworth (`BW2`); Parallel `R ∥ C` contour bypass; Baffle-Step `R ∥ L`; Series Parallel-RLC trap (*Sperrkreis*); Shunt Series-RLC notch (*Saugkreis*); Zobel (`R+C`); Conjugate $F_s$ Notch; L-Pad attenuator | Interactive live SVG schematic, 1-click E12/E24 standard value snapping & `−`/`+` E24 stepping, real complex driver impedance $Z(f)$ loading, Reverse-Null polarity test, and Markdown Bill of Materials (BOM) export |
| **Active DSP / Biquad** | `LR2`, `LR4`, `BW2`, 1st-order crossovers; Parametric EQ (`PEQ` with $f_0, Q, \text{Gain}$); Low/High Shelf; 1st & 2nd-Order All-Pass phase filters; **Linkwitz Transform** ($f_0, Q_0 \rightarrow f_p, Q_p$); Per-way Gain (dB), Delay ($\mu\text{s}$), and Polarity Invert | 1-click Sealed-Box Linkwitz Transform pole sync, physical $Z$-offset to DSP delay calculator ($29.1\,\mu\text{s/cm}$), Nelder-Mead automated crossover optimizer, and DSP biquad coefficient export |
| **Hybrid (DSP + Passive)** | Combines active DSP pre-filtering / Linkwitz Transform on the woofer with passive RLC crossover networks on mid/high ways | Ideal for 3-way towers with an active powered subwoofer section and passive mid-tweeter crossover |

---

## Frequently Asked Questions (Loudspeaker & Crossover Design)

### How do I choose between a Sealed and a Vented (Bass-Reflex) enclosure?
Calculate the driver's **Efficiency Bandwidth Product**, $\text{EBP} = f_s / Q_{es}$, and inspect its total Q factor ($Q_{ts}$). Drivers with $Q_{ts} > 0.45$ and $\text{EBP} < 50$ perform best in **Sealed** boxes ($Q_{tc} \approx 0.707$ Butterworth for maximally flat response, or $Q_{tc} \approx 0.577$ Bessel for optimal transient response). Drivers with $0.25 \le Q_{ts} \le 0.42$ and $\text{EBP} > 60$ excel in **Vented (Bass-Reflex)** enclosures, where the Helmholtz port resonance $F_b$ extends the $-3\text{ dB}$ cutoff ($F_3$) lower and reduces cone excursion near $F_b$. In LS Graf Simulator, click **Snapshot & Compare Vented / Sealed** to compare both alignments side-by-side.

### Why does a passive crossover need a Zobel network and Baffle Step compensation?
Standard textbook crossover formulas ($L = R / \omega_c$, $C = 1 / (\omega_c R)$) assume the loudspeaker driver is a constant resistor $R_e$. In reality, a woofer's voice-coil inductance $L_e$ causes impedance to rise at high frequencies, preventing a passive low-pass inductor from rolling off properly. A **Zobel network** (shunt resistor $R_z \approx 1.25 R_e$ in series with capacitor $C_z = L_e / R_e^2$) flattens the impedance seen by the crossover. Additionally, at wavelengths larger than the cabinet front baffle width ($f_{\text{bsc}} \approx 115 / W_{\text{m}}$), sound wraps around the cabinet ($4\pi$ full-space vs. $2\pi$ half-space), causing a $4\text{ to }6\text{ dB}$ loss in bass sensitivity that is corrected with a series **Baffle-Step `R ∥ L` network**.

### How do I verify phase alignment at the crossover frequency using a Reverse-Null test?
In a 2nd-order (`LR2`) or 4th-order (`LR4`) Linkwitz-Riley crossover, the low-pass and high-pass acoustic outputs are designed to be $0^\circ$ in-phase at the crossover frequency $f_{xo}$, summing to $+6\text{ dB}$ (flat total response since each way is at $-6\text{ dB}$ at $f_{xo}$). By clicking **Reverse Null Test** to invert the tweeter polarity by $180^\circ$, a properly time- and phase-aligned crossover produces a deep, symmetrical cancellation notch ($-20\text{ dB}$ to $-40\text{ dB}$) centered at $f_{xo}$.

### Can I import measured FRD and ZMA files including off-axis angles?
Yes. Each way in LS Graf Simulator accepts standard `.frd` (frequency, SPL dB, acoustic phase deg) and `.zma` (frequency, impedance $\Omega$, electrical phase deg) files exported from REW (Room EQ Wizard), ARTA, Clio, or SoundEasy. You can also upload multiple **off-axis `.frd` files** ($15^\circ, 30^\circ, 45^\circ, 60^\circ$) per driver to simulate off-axis crossover summation and horizontal directivity, and toggle **Simulate Enclosure with Measured FRD** to model box and port changes on top of a nearfield or infinite-baffle measurement.

---

## Machine-Readable Discovery Links
- Interactive Web Application: [https://ls.graf.me.uk/](https://ls.graf.me.uk/)
- LLM Summary (`llms.txt`): [https://ls.graf.me.uk/llms.txt](https://ls.graf.me.uk/llms.txt)
- Full LLM Engineering Guide (`llms-full.txt`): [https://ls.graf.me.uk/llms-full.txt](https://ls.graf.me.uk/llms-full.txt)
- XML Sitemap: [https://ls.graf.me.uk/sitemap.xml](https://ls.graf.me.uk/sitemap.xml)

