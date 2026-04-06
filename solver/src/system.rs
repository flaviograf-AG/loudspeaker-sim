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
}

/// Result for the complete system.
pub struct SystemResult {
    pub frequencies_hz: Vec<f64>,
    /// Per-way results
    pub ways: Vec<WayResult>,
    /// Combined system SPL (complex sum of all ways)
    pub system_spl_db: Vec<f64>,
    /// System group delay
    pub system_group_delay_ms: Vec<f64>,
    /// System impedance (parallel combination of all ways as seen by amplifier)
    pub system_impedance_ohm: Vec<f64>,
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

    for way in &project.ways {
        if !way.enabled {
            continue;
        }

        // 1. Simulate this way's driver + enclosure (raw, unfiltered)
        let raw_input = SimulationInput {
            driver: way.driver.clone(),
            enclosure: way.enclosure.clone(),
            freq_start_hz: project.freq_start_hz,
            freq_end_hz: project.freq_end_hz,
            freq_points: project.freq_points,
            drive_voltage_rms: project.drive_voltage_rms,
        };
        let raw_result = solve_simulation(&raw_input)?;

        let j = Complex::new(0.0, 1.0);

        let mut complex_pressure = Vec::with_capacity(n);
        let mut way_spl = Vec::with_capacity(n);
        let mut way_impedance = Vec::with_capacity(n);

        for (i, &f) in freqs.iter().enumerate() {
            let omega = TWO_PI * f;

            // Driver electrical impedance (simplified: Re + jωLe + motional)
            // We use the impedance from the raw simulation result
            let z_driver = Complex::from_polar(
                raw_result.impedance_ohm[i],
                raw_result.impedance_phase_deg[i].to_radians(),
            );

            // 3. Passive crossover transfer function
            let h_passive = if way.passive_filters.is_empty() {
                Complex::new(1.0, 0.0)
            } else {
                passive_transfer_function(&way.passive_filters, z_driver, omega)
            };

            // 4. Active filter cascade
            let mut h_active = Complex::new(1.0, 0.0);
            for af in &way.active_filters {
                h_active = h_active * active_filter_response(af, f);
            }

            // 5. Per-way gain
            let gain = 10.0_f64.powf(way.gain_db / 20.0);

            // 6. Polarity
            let polarity = if way.inverted { -1.0 } else { 1.0 };

            // 7. Acoustic path delay from Z-offset + explicit delay
            let total_delay = way.delay_s + way.z_offset_m / C_0;
            let phase_delay = Complex::from_polar(1.0, -omega * total_delay);

            // 8. Reconstruct complex acoustic pressure from SPL + estimated phase
            // The raw_result gives SPL magnitude. For phase, use the group delay
            // to estimate the pressure phase (minimum-phase assumption).
            // For a more accurate model, we'd need the complex pressure directly
            // from the enclosure solver. Using SPL magnitude × filter phase for now.
            let p_mag = 10.0_f64.powf(raw_result.spl_db[i] / 20.0) * 20e-6; // dB → Pa
            let p_raw = Complex::new(p_mag, 0.0); // magnitude only (minimum-phase approx)

            // Combined: p_way = p_raw × H_passive × H_active × gain × polarity × delay
            let p_way = p_raw * h_passive * h_active * gain * polarity * phase_delay;
            complex_pressure.push(p_way);
            way_spl.push(pressure_to_spl_db(p_way.norm()));

            // Way impedance as seen by amplifier (through passive network)
            // Simplified: if no passive, just driver Z. With passive, it's the
            // input impedance of the ladder + load.
            way_impedance.push(raw_result.impedance_ohm[i]);
        }

        way_results.push(WayResult {
            name: way.name.clone(),
            frequencies_hz: freqs.clone(),
            complex_pressure,
            spl_db: way_spl,
            impedance_ohm: way_impedance,
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

    Ok(SystemResult {
        frequencies_hz: freqs,
        ways: way_results,
        system_spl_db: system_spl,
        system_group_delay_ms: system_group_delay,
        system_impedance_ohm: system_impedance,
    })
}
