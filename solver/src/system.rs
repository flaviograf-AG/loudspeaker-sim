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
use crate::crossover::{
    active_filter_response, passive_input_impedance, passive_transfer_function, ActiveFilter,
    PassiveBlock,
};
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
    /// Acoustic phase of this way (degrees)
    pub phase_deg: Vec<f64>,
    /// Electrical impedance magnitude of this way's driver + passive crossover (Ω)
    pub impedance_ohm: Vec<f64>,
    /// Electrical impedance phase of this way's driver + passive crossover (degrees)
    pub impedance_phase_deg: Vec<f64>,
    /// Complex electrical input impedance of this way (Ω)
    pub complex_impedance: Vec<Complex<f64>>,
    /// Filter transfer function magnitude (dB) — the crossover attenuation curve
    pub filter_gain_db: Vec<f64>,
    /// Filtered cone displacement per frequency point (mm)
    pub cone_displacement_mm: Vec<f64>,
    /// Filtered port air velocity per frequency point (m/s), if applicable
    pub port_velocity_ms: Option<Vec<f64>>,
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
    /// Combined system acoustic phase (degrees)
    pub system_phase_deg: Vec<f64>,
    /// System group delay
    pub system_group_delay_ms: Vec<f64>,
    /// System impedance magnitude (parallel combination of all ways as seen by amplifier)
    pub system_impedance_ohm: Vec<f64>,
    /// System impedance phase (degrees)
    pub system_impedance_phase_deg: Vec<f64>,
    /// Maximum cone displacement per way (mm, after crossover filter attenuation)
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
        // Both paths provide full complex acoustic phase and complex electrical impedance.
        let (raw_spl, raw_phase, raw_z_mag, raw_z_phase, raw_disp, raw_port_vel) =
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

                let mut spl: Vec<f64> = freqs.iter().map(|&f| interp(&m.frequencies_hz, &m.spl_db, f)).collect();
                let mut phase: Vec<f64> = freqs.iter().map(|&f| interp(&m.frequencies_hz, &m.phase_deg, f)).collect();
                let mut z_mag: Vec<f64> = if m.impedance_ohm.is_empty() {
                    vec![way.driver.re_ohm; n] // fallback to Re if no ZMA
                } else {
                    freqs.iter().map(|&f| interp(&m.frequencies_hz, &m.impedance_ohm, f)).collect()
                };
                let mut z_phase: Vec<f64> = if m.impedance_phase_deg.is_empty() {
                    vec![0.0; n]
                } else {
                    freqs.iter().map(|&f| interp(&m.frequencies_hz, &m.impedance_phase_deg, f)).collect()
                };
                let mut disp = vec![0.0; n];
                let mut port_vel = None;

                // Optional Hybrid FRD + Enclosure Simulation mode:
                // Superimposes the simulated enclosure's acoustic loading relative to an infinite baffle
                // onto the measured FRD, and provides simulated box impedance (when no ZMA) + excursion/port velocity.
                if m.simulate_enclosure {
                    let box_input = SimulationInput {
                        driver: way.driver.clone(),
                        enclosure: way.enclosure.clone(),
                        freq_start_hz: project.freq_start_hz,
                        freq_end_hz: project.freq_end_hz,
                        freq_points: project.freq_points,
                        drive_voltage_rms: project.drive_voltage_rms,
                    };
                    let ib_input = SimulationInput {
                        driver: way.driver.clone(),
                        enclosure: EnclosureConfig::Sealed(SealedBoxParams {
                            volume_m3: (way.driver.vas_m3 * 1000.0).max(1.0),
                            ql: 100.0,
                        }),
                        freq_start_hz: project.freq_start_hz,
                        freq_end_hz: project.freq_end_hz,
                        freq_points: project.freq_points,
                        drive_voltage_rms: project.drive_voltage_rms,
                    };
                    if let (Ok(box_res), Ok(ib_res)) = (solve_simulation(&box_input), solve_simulation(&ib_input)) {
                        for i in 0..n {
                            spl[i] += box_res.spl_db[i] - ib_res.spl_db[i];
                            phase[i] += box_res.acoustic_phase_deg[i] - ib_res.acoustic_phase_deg[i];
                        }
                        if m.impedance_ohm.is_empty() {
                            z_mag = box_res.impedance_ohm;
                            z_phase = box_res.impedance_phase_deg;
                        }
                        disp = box_res.cone_displacement_mm;
                        port_vel = box_res.port_velocity_ms;
                    }
                }

                (spl, phase, z_mag, z_phase, disp, port_vel)
            } else {
                // T/S-based simulation
                let raw_input = SimulationInput {
                    driver: way.driver.clone(),
                    enclosure: way.enclosure.clone(),
                    freq_start_hz: project.freq_start_hz,
                    freq_end_hz: project.freq_end_hz,
                    freq_points: project.freq_points,
                    drive_voltage_rms: project.drive_voltage_rms,
                };
                let raw_result = solve_simulation(&raw_input)?;
                (
                    raw_result.spl_db,
                    raw_result.acoustic_phase_deg,
                    raw_result.impedance_ohm,
                    raw_result.impedance_phase_deg,
                    raw_result.cone_displacement_mm,
                    raw_result.port_velocity_ms,
                )
            };

        let mut complex_pressure = Vec::with_capacity(n);
        let mut way_spl = Vec::with_capacity(n);
        let mut way_phase_deg = Vec::with_capacity(n);
        let mut way_impedance = Vec::with_capacity(n);
        let mut way_impedance_phase = Vec::with_capacity(n);
        let mut way_complex_impedance = Vec::with_capacity(n);
        let mut filter_gain_db = Vec::with_capacity(n);
        let mut way_disp_mm = Vec::with_capacity(n);
        let mut way_port_vel = raw_port_vel.as_ref().map(|_| Vec::with_capacity(n));

        for (i, &f) in freqs.iter().enumerate() {
            let omega = TWO_PI * f;

            // Driver electrical impedance (from ZMA or simulation)
            let z_driver = Complex::from_polar(
                raw_z_mag[i].max(1e-3),
                raw_z_phase[i].to_radians(),
            );

            // Passive crossover transfer function & branch input impedance
            let (h_passive, z_way) = if way.passive_filters.is_empty() {
                (Complex::new(1.0, 0.0), z_driver)
            } else {
                let h_p = passive_transfer_function(
                    &way.passive_filters,
                    z_driver,
                    omega,
                    way.source_impedance_ohm,
                );
                let z_in = passive_input_impedance(&way.passive_filters, z_driver, omega);
                (h_p, z_in)
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

            // Reconstruct complex acoustic pressure using true acoustic phase
            let p_mag = 10.0_f64.powf(raw_spl[i] / 20.0) * 20e-6; // dB → Pa
            let p_raw = Complex::from_polar(p_mag, raw_phase[i].to_radians());

            // Filter transfer function (crossover attenuation in dB)
            let h_total = h_passive * h_active * gain * polarity;
            let h_mag = h_total.norm();
            filter_gain_db.push(20.0 * h_mag.max(1e-12).log10());

            // Combined: p_way = p_raw × H_passive × H_active × gain × polarity × delay
            let p_way = p_raw * h_total * phase_delay;
            complex_pressure.push(p_way);
            way_spl.push(pressure_to_spl_db(p_way.norm()));
            way_phase_deg.push(p_way.arg().to_degrees());

            // Filtered mechanical displacement and port velocity
            way_disp_mm.push(raw_disp[i] * h_mag);
            if let (Some(ref raw_pv), Some(ref mut out_pv)) = (&raw_port_vel, &mut way_port_vel) {
                out_pv.push(raw_pv[i] * h_mag);
            }

            // Way electrical impedance as seen by amplifier (including passive crossover ladder)
            way_impedance.push(z_way.norm());
            way_impedance_phase.push(z_way.arg().to_degrees());
            way_complex_impedance.push(z_way);
        }

        let max_disp = way_disp_mm.iter().cloned().fold(0.0_f64, f64::max);
        way_max_displacement_mm.push(max_disp);

        way_results.push(WayResult {
            name: way.name.clone(),
            frequencies_hz: freqs.clone(),
            complex_pressure,
            spl_db: way_spl,
            phase_deg: way_phase_deg,
            impedance_ohm: way_impedance,
            impedance_phase_deg: way_impedance_phase,
            complex_impedance: way_complex_impedance,
            filter_gain_db,
            cone_displacement_mm: way_disp_mm,
            port_velocity_ms: way_port_vel,
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
    let system_phase_deg: Vec<f64> = system_phases.iter()
        .map(|p| p.to_degrees())
        .collect();
    let system_group_delay = compute_group_delay_ms(&freqs, &system_phases);

    // System impedance: complex parallel combination of all way input impedances
    // Y_total(jω) = sum_k (1 / Z_way_k(jω))
    let mut system_impedance = Vec::with_capacity(n);
    let mut system_impedance_phase_deg = Vec::with_capacity(n);
    for i in 0..n {
        let mut y_total = Complex::new(0.0, 0.0);
        for wr in &way_results {
            let z_w = wr.complex_impedance[i];
            if z_w.norm() > 1e-9 {
                y_total += Complex::new(1.0, 0.0) / z_w;
            }
        }
        let z_sys = if y_total.norm() > 1e-12 {
            Complex::new(1.0, 0.0) / y_total
        } else {
            Complex::new(1e6, 0.0)
        };
        system_impedance.push(z_sys.norm());
        system_impedance_phase_deg.push(z_sys.arg().to_degrees());
    }

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
        system_phase_deg,
        system_group_delay_ms: system_group_delay,
        system_impedance_ohm: system_impedance,
        system_impedance_phase_deg,
        way_max_displacement_mm,
    })
}
