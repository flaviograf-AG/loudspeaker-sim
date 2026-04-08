//! Multi-way speaker system model.
//!
//! Combines multiple "ways" (driver + enclosure + crossover filter) into
//! a complete speaker system. Each way's acoustic output is computed
//! independently, then summed as complex vectors accounting for:
//! - Crossover filter transfer function (passive and/or active)
//! - Driver physical position offset (path length → phase delay)
//! - Polarity inversion
//! - Per-way gain and delay
//!
//! Reference: Fincham, L.R. "Multiple-Driver Loudspeaker Systems" (AES, 1983)

use num_complex::Complex;

use crate::constants::{C_0, TWO_PI};
use crate::crossover::{active_filter_response, passive_transfer_function, ActiveFilter, PassiveBlock};
use crate::solve_simulation;
use crate::sweep::{compute_group_delay_ms, log_frequency_sweep, pressure_to_spl_db};
use crate::types::*;

/// A single "way" in a multi-way speaker system.
#[derive(Debug, Clone)]
pub struct Way {
    /// Display name (e.g., "Woofer", "Tweeter")
    pub name: String,
    /// Driver T/S parameters
    pub driver: DriverParams,
    /// Enclosure configuration
    pub enclosure: EnclosureConfig,
    /// Passive filter blocks (between amplifier and driver)
    pub passive_filters: Vec<PassiveBlock>,
    /// Active filter blocks (before amplifier — ideal voltage gain)
    pub active_filters: Vec<ActiveFilter>,
    /// Per-way gain (dB)
    pub gain_db: f64,
    /// Per-way delay (seconds) — acoustic offset compensation
    pub delay_s: f64,
    /// Polarity inversion
    pub inverted: bool,
    /// Physical Z-offset from reference plane (m) — for acoustic path delay
    pub z_offset_m: f64,
    /// Enabled
    pub enabled: bool,
    /// Measured FRD/ZMA data. When Some, bypasses T/S+enclosure simulation.
    pub measured: Option<MeasuredDriverData>,
    /// Source impedance (Ω): amplifier output impedance + cable resistance.
    /// Affects passive crossover behavior — especially shunt components.
    /// Ref: Dickason, "Loudspeaker Design Cookbook", Ch. 5
    pub source_impedance_ohm: f64,
}

/// Complete multi-way speaker project.
#[derive(Debug, Clone)]
pub struct SpeakerProject {
    pub ways: Vec<Way>,
    pub freq_start_hz: f64,
    pub freq_end_hz: f64,
    pub freq_points: usize,
    pub drive_voltage_rms: f64,
}

/// Result for a single way.
pub struct WayResult {
    pub name: String,
    pub frequencies_hz: Vec<f64>,
    /// Complex pressure at 1m for this way (before system summation)
    pub complex_pressure: Vec<Complex<f64>>,
    /// SPL of this way alone
    pub spl_db: Vec<f64>,
    /// Electrical impedance of this way's driver + crossover
    pub impedance_ohm: Vec<f64>,
    /// Filter transfer function magnitude (dB) — the crossover attenuation curve
    pub filter_gain_db: Vec<f64>,
}

/// Result for the complete system.
pub struct SystemResult {
    pub frequencies_hz: Vec<f64>,
    /// Minimum system impedance (Ω) and the frequency where it occurs
    pub min_impedance_ohm: f64,
    pub min_impedance_freq_hz: f64,
    /// Per-way results
    pub ways: Vec<WayResult>,
    /// Combined system SPL (complex sum of all ways)
    pub system_spl_db: Vec<f64>,
    /// System group delay
    pub system_group_delay_ms: Vec<f64>,
    /// System impedance (parallel combination of all ways as seen by amplifier)
    pub system_impedance_ohm: Vec<f64>,
    /// Maximum cone displacement per way (mm, peak)
    pub way_max_displacement_mm: Vec<f64>,
}

/// Solve a complete multi-way speaker system.
pub fn solve_system(project: &SpeakerProject) -> Result<SystemResult, String> {
    let freqs = log_frequency_sweep(
        project.freq_start_hz,
        project.freq_end_hz,
        project.freq_points,
    );
    let n = freqs.len();

    let mut way_results: Vec<WayResult> = Vec::new();
    let mut way_max_displacement_mm: Vec<f64> = Vec::new();

    for way in &project.ways {
        if !way.enabled {
            way_max_displacement_mm.push(0.0);
            continue;
        }

        // 1. Get raw driver response: either from measured FRD/ZMA or T/S simulation.
        // When measured data is present, interpolate it to the system frequency grid.
        let (raw_spl, raw_phase, raw_z_mag, raw_z_phase, has_real_phase) =
            if let Some(ref m) = way.measured {
                // Log-frequency linear interpolation of measured data onto system grid
                let interp = |src_f: &[f64], src_v: &[f64], target_f: f64| -> f64 {
                    if src_f.is_empty() { return 0.0; }
                    if target_f <= src_f[0] { return src_v[0]; }
                    if target_f >= *src_f.last().unwrap() { return *src_v.last().unwrap(); }
                    for (fw, vw) in src_f.windows(2).zip(src_v.windows(2)) {
                        if target_f >= fw[0] && target_f <= fw[1] {
                            let t = (target_f.ln() - fw[0].ln()) / (fw[1].ln() - fw[0].ln());
                            return vw[0] + t * (vw[1] - vw[0]);
                        }
                    }
                    *src_v.last().unwrap()
                };

                let spl: Vec<f64> = freqs.iter().map(|&f| interp(&m.frequencies_hz, &m.spl_db, f)).collect();
                let phase: Vec<f64> = freqs.iter().map(|&f| interp(&m.frequencies_hz, &m.phase_deg, f)).collect();
                let z_mag: Vec<f64> = if m.impedance_ohm.is_empty() {
                    vec![way.driver.re_ohm; n] // fallback to Re if no ZMA
                } else {
                    freqs.iter().map(|&f| interp(&m.frequencies_hz, &m.impedance_ohm, f)).collect()
                };
                let z_phase: Vec<f64> = if m.impedance_phase_deg.is_empty() {
                    vec![0.0; n]
                } else {
                    freqs.iter().map(|&f| interp(&m.frequencies_hz, &m.impedance_phase_deg, f)).collect()
                };
                way_max_displacement_mm.push(0.0); // no displacement data from FRD
                (spl, phase, z_mag, z_phase, true)
            } else {
                // T/S-based simulation (existing path)
                let raw_input = SimulationInput {
                    driver: way.driver.clone(),
                    enclosure: way.enclosure.clone(),
                    freq_start_hz: project.freq_start_hz,
                    freq_end_hz: project.freq_end_hz,
                    freq_points: project.freq_points,
                    drive_voltage_rms: project.drive_voltage_rms,
                };
                let raw_result = solve_simulation(&raw_input)?;
                let max_disp = raw_result.cone_displacement_mm.iter()
                    .cloned()
                    .fold(0.0_f64, f64::max);
                way_max_displacement_mm.push(max_disp);
                (
                    raw_result.spl_db,
                    raw_result.acoustic_phase_deg,
                    raw_result.impedance_ohm,
                    raw_result.impedance_phase_deg,
                    false,
                )
            };

        let mut complex_pressure = Vec::with_capacity(n);
        let mut way_spl = Vec::with_capacity(n);
        let mut way_impedance = Vec::with_capacity(n);
        let mut filter_gain_db = Vec::with_capacity(n);

        for (i, &f) in freqs.iter().enumerate() {
            let omega = TWO_PI * f;

            // Driver electrical impedance (from ZMA or simulation)
            let z_driver = Complex::from_polar(
                raw_z_mag[i],
                raw_z_phase[i].to_radians(),
            );

            // Passive crossover transfer function
            let h_passive = if way.passive_filters.is_empty() {
                Complex::new(1.0, 0.0)
            } else {
                passive_transfer_function(&way.passive_filters, z_driver, omega, way.source_impedance_ohm)
            };

            // Active filter cascade
            let mut h_active = Complex::new(1.0, 0.0);
            for af in &way.active_filters {
                h_active = h_active * active_filter_response(af, f);
            }

            // Per-way gain
            let gain = 10.0_f64.powf(way.gain_db / 20.0);

            // Polarity
            let polarity = if way.inverted { -1.0 } else { 1.0 };

            // Acoustic path delay from Z-offset + explicit delay
            let total_delay = way.delay_s + way.z_offset_m / C_0;
            let phase_delay = Complex::from_polar(1.0, -omega * total_delay);

            // Reconstruct complex acoustic pressure.
            // With measured FRD data, use real acoustic phase for accurate summation.
            // With T/S simulation, use magnitude only (minimum-phase approximation).
            let p_mag = 10.0_f64.powf(raw_spl[i] / 20.0) * 20e-6; // dB → Pa
            let p_raw = if has_real_phase {
                Complex::from_polar(p_mag, raw_phase[i].to_radians())
            } else {
                Complex::new(p_mag, 0.0) // minimum-phase approx
            };

            // Filter transfer function (crossover attenuation in dB)
            let h_total = h_passive * h_active * gain * polarity;
            filter_gain_db.push(20.0 * h_total.norm().log10());

            // Combined: p_way = p_raw × H_passive × H_active × gain × polarity × delay
            let p_way = p_raw * h_passive * h_active * gain * polarity * phase_delay;
            complex_pressure.push(p_way);
            way_spl.push(pressure_to_spl_db(p_way.norm()));

            // Way impedance as seen by amplifier
            way_impedance.push(raw_z_mag[i]);
        }

        way_results.push(WayResult {
            name: way.name.clone(),
            frequencies_hz: freqs.clone(),
            complex_pressure,
            spl_db: way_spl,
            impedance_ohm: way_impedance,
            filter_gain_db,
        });
    }

    // System summation: complex sum of all way pressures
    let mut system_pressure = vec![Complex::new(0.0, 0.0); n];
    for wr in &way_results {
        for (i, &p) in wr.complex_pressure.iter().enumerate() {
            system_pressure[i] = system_pressure[i] + p;
        }
    }

    let system_spl: Vec<f64> = system_pressure.iter()
        .map(|p| pressure_to_spl_db(p.norm()))
        .collect();

    let system_phases: Vec<f64> = system_pressure.iter()
        .map(|p| p.arg())
        .collect();
    let system_group_delay = compute_group_delay_ms(&freqs, &system_phases);

    // System impedance: parallel combination of all way impedances
    let system_impedance: Vec<f64> = (0..n).map(|i| {
        let mut y_total = 0.0;
        for wr in &way_results {
            if wr.impedance_ohm[i] > 0.0 {
                y_total += 1.0 / wr.impedance_ohm[i];
            }
        }
        if y_total > 0.0 { 1.0 / y_total } else { 1e6 }
    }).collect();

    // Find minimum system impedance
    let mut min_z = f64::MAX;
    let mut min_z_freq = 0.0;
    for (i, &z) in system_impedance.iter().enumerate() {
        if z < min_z {
            min_z = z;
            min_z_freq = freqs[i];
        }
    }

    Ok(SystemResult {
        frequencies_hz: freqs,
        min_impedance_ohm: min_z,
        min_impedance_freq_hz: min_z_freq,
        ways: way_results,
        system_spl_db: system_spl,
        system_group_delay_ms: system_group_delay,
        system_impedance_ohm: system_impedance,
        way_max_displacement_mm,
    })
}
