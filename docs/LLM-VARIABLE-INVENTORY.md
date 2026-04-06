# LLM Variable Inventory — Loudspeaker Solver

> **For:** Claude-as-Optimizer and any LLM agent using the solver CLI or MCP tools.
> **CLI:** `echo '<json>' | loudspeaker-solver` (reads stdin, writes stdout)
> **Auto-detection:** If input JSON has a `"ways"` key → multi-way system mode; otherwise → single-enclosure mode.

---

## Input Variables

### Driver Parameters (`driver`)

All driver parameters are **fixed for a given physical driver** — the LLM should not optimize these unless exploring driver substitution. Values come from manufacturer datasheets or measurement.

| Field | Type | Unit (internal) | User unit | Valid range | Physical meaning | Sensitivity |
|-------|------|-----------------|-----------|-------------|------------------|-------------|
| `fs_hz` | f64 | Hz | Hz | 15–5000 | Free-air resonance frequency. Lower = deeper bass potential. | High — directly sets the minimum useful frequency |
| `re_ohm` | f64 | Ω | Ω | 0.5–50 | DC voice coil resistance. Sets minimum impedance. | Low — affects efficiency, not response shape |
| `le_h` | f64 | H | mH (÷1000) | 0–5e-3 | Voice coil inductance. Causes impedance rise and SPL rolloff at HF. | Medium above 1kHz, negligible below |
| `qes` | f64 | — | — | 0.1–2.0 | Electrical Q at resonance. Low = strong motor, high damping. | High — controls damping and alignment type |
| `qms` | f64 | — | — | 0.5–15 | Mechanical Q at resonance. High = low suspension loss. | Medium — affects peak height, not rolloff slope |
| `vas_m3` | f64 | m³ | L (×1000) | 0.0001–1.0 | Equivalent compliance volume. Determines interaction with box volume. | High — directly determines Fc and Qtc for sealed |
| `sd_m2` | f64 | m² | cm² (×1e4) | 1e-4–0.1 | Effective cone area. Determines displacement-limited SPL. | Medium — affects sensitivity and max SPL |
| `xmax_m` | f64 | m | mm (×1000) | 0.5e-3–50e-3 | Maximum linear excursion. Determines displacement-limited max SPL. | Not used in simulation — display only |

**Derived (computed, not inputs):** Qts, Bl, Mms, Cms, Rms, sensitivity (dB/W/m), efficiency (%).

---

### Enclosure Parameters

#### Sealed (`type: "Sealed"`)

| Field | Unit | Range | Meaning | Optimization guidance |
|-------|------|-------|---------|----------------------|
| `volume_m3` | m³ | 0.5e-3 – 0.5 | Box volume. Larger = lower Fc, lower Qtc. | **Primary tuning variable.** Start with Vas × Qtc²/(Qtc_target² - Qts²) for target Qtc. |
| `ql` | — | 3–50 | Box loss Q. Lower = more absorption = lower Q. | 7 is typical. Rarely optimized — leave at 7 unless modeling specific lining. |

**Key relationships:** Fc = Fs × √(1 + Vas/Vb), Qtc = Qts × √(1 + Vas/Vb) adjusted by Ql.

**Optimization targets:**
- Qtc = 0.577 → Bessel (best transient, most gradual rolloff)
- Qtc = 0.707 → Butterworth (maximally flat, -3dB at Fc)
- Qtc = 1.0 → +3dB peak at Fc (boom, avoid unless compensated)

---

#### Vented (`type: "Vented"`)

| Field | Unit | Range | Meaning | Optimization guidance |
|-------|------|-------|---------|----------------------|
| `volume_m3` | m³ | 1e-3 – 1.0 | Box volume. | **Primary.** Typically 1.5-3× Vas for standard alignments. |
| `port_area_m2` | m² | 5e-5 – 0.05 | Port cross-section area. | Size for <15 m/s port velocity. Area = Sd × Xmax × Fb / 15. |
| `port_length_m` | m | 0.01 – 1.0 | Port physical length. | Derived from target Fb: L = c²Sp/(4π²Fb²Vb) - end_corrections. |
| `num_ports` | u32 | 1–4 | Number of identical ports. | More ports = lower per-port velocity. |
| `port_flanged` | bool | — | End correction type. | True for most builds. |
| `ql` | — | 3–50 | Box loss Q. | 7 typical. |

**Key relationships:** Fb = c/(2π) × √(Sp/(Leff×Vb)). Port velocity peaks near Fb.

**Optimization targets:**
- QB3 alignment: Fb ≈ Fs, Vb per alignment table
- SC4 alignment: Fb ≈ 0.9×Fs
- Maximize: bass extension (low f3) while keeping port velocity < 15-20 m/s

---

#### Transmission Line (`type: "TransmissionLine"`)

| Field | Unit | Range | Meaning | Optimization guidance |
|-------|------|-------|---------|----------------------|
| `length_m` | m | 0.3 – 5.0 | Acoustic path length. | **Primary.** λ/4 frequency = c/(4L). Set for desired bass frequency. |
| `area_driver_m2` | m² | Sd – 2×Sd | Cross-section at driver. | Start at Sd. |
| `area_mouth_m2` | m² | 0.5×Sd – 3×Sd | Cross-section at mouth. | Taper ratio affects HF standing wave behavior. |
| `driver_position` | 0.0–0.49 | — | Offset as fraction of length. | **Critical.** 0.33 suppresses 3rd harmonic. 0.25 suppresses 2nd. |
| `taper_profile` | enum | Straight/Exp/Conical | Cross-section shape. | Exponential smooths resonances. Conical is simplest. |
| `stuffing_density_kg_m3` | kg/m³ | 0–30 | Global stuffing density. | 5-12 typical polyester. Higher = more damping, lower effective speed. |
| `flow_resistivity_pa_s_m2` | Pa·s/m² | 0–40000 | Global flow resistivity. | 0 = auto from density (Rf≈1000×density). |
| `stuffing_zones` | array | — | Per-zone stuffing. | Heavy near driver (10-20 kg/m³), light near mouth (2-5). |
| `open_end` | bool | — | Quarter-wave (true) or half-wave (false). | Almost always true for bass TL. |
| `num_folds` | u32 | 0–8 | Number of 180° folds. | Damps standing waves, practical for compact cabinets. |

**Optimization strategy:** Set length for target λ/4 frequency. Adjust driver_position and stuffing to minimize ripple in 100-500 Hz range while preserving bass output.

---

#### Horn (`type: "Horn"`)

| Field | Path | Range | Meaning |
|-------|------|-------|---------|
| `segments[].area_start_m2` | m² | 1e-4 – 0.5 | Segment throat area. Compression ratio = Sd/S_throat. |
| `segments[].area_end_m2` | m² | 1e-4 – 1.0 | Segment mouth area. |
| `segments[].length_m` | m | 0.05 – 3.0 | Segment axial length. |
| `segments[].profile` | enum | Con/Exp/Hyp/Tractrix | Flare type. Exponential has cleanest cutoff. |
| `segments[].cutoff_hz` | Hz | 50 – 5000 | Horn cutoff (Exp/Hyp only). Below this, loading drops. |
| `rear_chamber.volume_m3` | m³ | 1e-3 – 0.1 | Compression chamber behind driver. |
| `rear_chamber.ql` | — | 3–50 | Rear chamber loss. |
| `throat_chamber` | opt | — | Small volume between driver and throat. Smooths HF. |
| `radiation_angle_sr` | sr | π/2 – 4π | Solid angle: 2π = half-space (floor), 4π = free-air. |

**Optimization:** Compression ratio 1.5:1 to 3:1. Mouth area ≥ λ²/(4π) at cutoff. Horn length determines LF extension.

---

#### Bandpass (`type: "Bandpass"`)

| Field | Unit | Range | Meaning |
|-------|------|-------|---------|
| `rear_volume_m3` | m³ | 1e-3 – 0.5 | Sealed rear chamber. Controls HP slope. |
| `front_volume_m3` | m³ | 1e-3 – 0.5 | Vented front chamber. Controls LP slope. |
| `port_area_m2` | m² | 5e-5 – 0.05 | Front port area. |
| `port_length_m` | m | 0.01 – 1.0 | Front port length. |

**Optimization:** Ratio of rear/front volumes shapes the passband width. Equal volumes → symmetric bandpass.

---

#### Passive Radiator (`type: "PassiveRadiator"`)

| Field | Unit | Range | Meaning |
|-------|------|-------|---------|
| `volume_m3` | m³ | 1e-3 – 0.5 | Box volume. |
| `pr_sd_m2` | m² | Sd – 3×Sd | PR cone area. Larger = lower excursion needed. |
| `pr_cms` | m/N | 1e-4 – 0.01 | PR compliance. Lower = higher tuning. |
| `pr_mms_kg` | kg | 0.01 – 0.5 | PR moving mass. **Primary tuning variable.** More mass = lower Fb. |
| `pr_rms` | N·s/m | 0.1 – 5 | PR damping. |

---

#### Open Baffle (`type: "OpenBaffle"`)

| Field | Unit | Range | Meaning |
|-------|------|-------|---------|
| `width_m` | m | 0.2 – 1.5 | Baffle width. Determines step frequency f_step ≈ 343/(π×w). |
| `height_m` | m | 0.2 – 2.0 | Baffle height. |
| `driver_offset_m` | m | 0 – w/2 | Asymmetric placement smooths diffraction ripple. |

---

### Simulation Settings

| Field | Unit | Default | Meaning |
|-------|------|---------|---------|
| `freq_start_hz` | Hz | 10 | Sweep start. 10 for subwoofers, 100 for midrange. |
| `freq_end_hz` | Hz | 20000 | Sweep end. |
| `freq_points` | int | 500 | Resolution. More = smoother but slower. |
| `drive_voltage_rms` | V | 2.83 | 2.83V = 1W into 8Ω. Use 1.0V for sensitivity comparison. |

---

### Multi-Way System Parameters

| Field | Unit | Range | Meaning |
|-------|------|-------|---------|
| `ways[].active_filters` | array | — | Active crossover chain (LR4LP, LR4HP, PEQ, etc.) |
| `ways[].passive_filters` | array | — | Passive crossover network (series/shunt RLC) |
| `ways[].gain_db` | dB | -20 to +20 | Level matching between ways. |
| `ways[].delay_s` | s | 0 to 0.01 | Time alignment (29µs ≈ 1cm). |
| `ways[].inverted` | bool | — | 180° polarity flip. |
| `ways[].z_offset_m` | m | -0.2 to 0.2 | Physical depth offset. |

---

## Output Variables

### Single-Enclosure Result

| Field | Unit | Interpretation |
|-------|------|----------------|
| `frequencies_hz` | Hz | Log-spaced frequency array (N points). |
| `spl_db` | dB SPL | On-axis SPL at 1m. **Primary design target.** Flat = good. |
| `impedance_ohm` | Ω | Electrical impedance magnitude. Min must stay above amp's rated load. |
| `impedance_phase_deg` | deg | Impedance phase. Large negative = capacitive load (stresses amplifier). |
| `cone_displacement_mm` | mm | Peak excursion. Compare against Xmax for distortion risk. |
| `group_delay_ms` | ms | Time delay variation vs frequency. >20ms at LF is audible. |
| `port_velocity_ms` | m/s | Port air velocity (vented only). >15-20 m/s → turbulence noise. |

### System Result

| Field | Unit | Interpretation |
|-------|------|----------------|
| `ways[].spl_db` | dB SPL | Individual way contribution (with crossover applied). |
| `system_spl_db` | dB SPL | **Total system SPL** — complex sum of all ways. This is the target. |
| `system_impedance_ohm` | Ω | Parallel combination of all way impedances. |
| `system_group_delay_ms` | ms | System group delay from combined pressure phase. |

---

## Optimization Strategies

### Goal: Flat frequency response (±3 dB, 50 Hz–20 kHz)

**Single driver:**
1. Choose driver with Qts ≈ 0.35-0.45 for sealed, 0.25-0.40 for vented.
2. Sealed: set Vb to achieve Qtc ≈ 0.707 (Butterworth). Vb = Vas / ((Qtc/Qts)² - 1).
3. Vented: set Vb ≈ 1.5-2× Vas, tune Fb near Fs for QB3 alignment.
4. Evaluate: check f3 (-3dB point), ripple in passband.

**Multi-way (2-way):**
1. Set crossover frequency where woofer starts beaming (f_xo ≈ c/(π×d_woofer)).
2. Apply LR4 LP to woofer, LR4 HP to tweeter at same frequency.
3. Adjust tweeter gain to match woofer passband level.
4. If dip at crossover: try inverting tweeter polarity.
5. If step at crossover: adjust tweeter delay (z_offset or delay_s).
6. Iterate: ±500 Hz on crossover, ±1 dB on gain, ±10µs on delay.

### Goal: Maximum bass extension (lowest f3)

1. Use vented or TL over sealed (lower f3 for same driver).
2. Vented: increase Vb and lower Fb until port velocity exceeds 15 m/s — that's the limit.
3. TL: increase length until quarter-wave matches target. Use 33% driver offset.

### Goal: Minimize box size

1. Use sealed. Accept higher Fc.
2. Bandpass gives narrower bandwidth in smaller total volume.
3. PR replaces port tube (shorter than equivalent vented port).

### Cost function for automated optimization

```
error = Σ_f [ w(f) × (SPL(f) - target(f))² ]
```

Where:
- `target(f)` = desired SPL (flat line at reference sensitivity, or a shaped target)
- `w(f)` = frequency weighting (higher in the 200-5000 Hz region where human hearing is most sensitive)
- Sum over all frequency points in the simulation

**Convergence criterion:** Stop when max |SPL(f) - target(f)| < 0.5 dB in the design band, or after 100 iterations.
