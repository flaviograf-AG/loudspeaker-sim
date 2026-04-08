# FRD/ZMA and Enclosure Model Interaction

## Research Finding

When a user imports FRD (Frequency Response Data) and optionally ZMA (impedance) files for a driver way, the measured data represents the driver's **actual acoustic output** — typically measured in its real enclosure, on a real baffle, at a real measurement distance.

### How the Solver Handles Measured Data

The Rust solver (`solver/src/system.rs:111`) checks `if let Some(ref m) = way.measured`:

1. **Enclosure model is completely bypassed.** No T/S parameter simulation, no sealed/vented/horn/TL calculation. The measured SPL and phase are interpolated directly to the system frequency grid via log-frequency linear interpolation.
2. **Passive and active crossover filters still apply.** These are signal-chain elements downstream of the driver's acoustic output and must be applied regardless of data source.
3. **Per-way controls (gain, delay, inversion) still apply.** Same reason as above.
4. **ZMA impedance data is used if provided.** Otherwise, the driver's DC resistance (Re) is used as a flat impedance estimate.

### Standard Practice in Other Tools

| Tool | FRD Support | Enclosure Model with FRD? |
|------|-------------|---------------------------|
| XSim, VituixCAD, PCD | Yes | No — FRD is the complete driver response |
| Hornresp, WinISD, AJ-Horn | No FRD | N/A — T/S only |
| **This app** | Yes | No — bypassed when measured data present |

This matches industry standard: applying an enclosure model on top of measured data would double-count the acoustic loading.

### UI Implications

When measured data is loaded for a way:
- Enclosure controls should be **disabled or hidden** — they have no effect.
- A clear message should explain why: "Using measured FRD response — enclosure model bypassed."
- Crossover, EQ, gain, delay, and inversion controls remain fully active.

### References

- Thiele, A.N. (1961). "Loudspeakers in Vented Boxes." *Proc. IRE Australia*, 22:487-508.
- Small, R.H. (1972). "Direct-Radiator Loudspeaker System Analysis." *JAES*, 20(5):383-395.
- XSim crossover design workflow: FRD = measured in-box response, crossover designed on top.
- VituixCAD manual: "Import measured data and design crossover filters. No enclosure simulation is applied."
