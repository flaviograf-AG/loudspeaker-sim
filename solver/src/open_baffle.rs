//! Open baffle loudspeaker model.
//!
//! No enclosure — the driver is mounted on a flat baffle with free radiation
//! from both front and back. Below the baffle step frequency, front and back
//! radiation partially cancel (dipole behavior).
//!
//! Baffle step frequency: f_step ≈ c₀ / (π × w) where w = baffle width.
//! Below f_step, SPL drops at ~6 dB/octave relative to half-space response.
//!
//! Reference: Linkwitz, S. "Open Baffle Loudspeakers" (2007)
//! Reference: Olson, H.F. "Direct Radiator Loudspeaker Enclosures" (JAES, 1969)

use num_complex::Complex;

use crate::constants::{RHO_0, TWO_PI};
use crate::sweep::{compute_group_delay_ms, pressure_to_spl_db};
use crate::types::{DerivedDriver, OpenBaffleParams, SimulationResult};

pub fn open_baffle_frequency_response(
    driver: &DerivedDriver,
    enc: &OpenBaffleParams,
    frequencies_hz: &[f64],
    drive_voltage_rms: f64,
) -> SimulationResult {
    let p = &driver.params;
    let j = Complex::new(0.0, 1.0);

    // Effective baffle path length = distance from driver to nearest baffle edge
    // For a centered driver on a rectangular baffle: path ≈ min(w, h) / 2
    // For offset driver: path = min(offset, w - offset, h/2)
    let half_w = enc.width_m / 2.0;
    let path = if enc.driver_offset_m > 0.0 {
        enc.driver_offset_m.min(enc.width_m - enc.driver_offset_m).min(enc.height_m / 2.0)
    } else {
        half_w.min(enc.height_m / 2.0)
    };

    let n = frequencies_hz.len();
    let mut spl_db = Vec::with_capacity(n);
    let mut impedance_ohm = Vec::with_capacity(n);
    let mut impedance_phase_deg = Vec::with_capacity(n);
    let mut displacement_mm = Vec::with_capacity(n);
    let mut pressure_phases = Vec::with_capacity(n);

    for &f in frequencies_hz {
        let omega = TWO_PI * f;
        let s = j * omega;

        // Driver mechanical impedance — free air (no box compliance)
        // Only the driver's own compliance provides restoring force
        let z_mech = s * driver.mms + driver.rms + 1.0 / (s * driver.cms);
        let z_mot = driver.bl * driver.bl / z_mech;
        let z_in = p.re_ohm + s * p.le_h + z_mot;

        impedance_ohm.push(z_in.norm());
        impedance_phase_deg.push(z_in.arg().to_degrees());

        let i_coil = drive_voltage_rms / z_in;
        let force = driver.bl * i_coil;
        let v_cone = force / z_mech;
        let x_cone = v_cone / (j * omega);
        displacement_mm.push(x_cone.norm() * 1000.0);

        // === Baffle diffraction model ===
        // The front radiation arrives at the listening point directly.
        // The back radiation travels an extra path length around the baffle edge.
        // At low frequencies (wavelength >> baffle), front and back cancel → dipole.
        // At high frequencies (wavelength << baffle), back radiation is incoherent → half-space.
        //
        // Simplified model: p_total = p_front × (1 - exp(-j×k×2×path))
        // where 2×path is the round-trip delay of the back wave.
        // This transitions from |1-1|=0 (full cancellation) at DC
        // to |1-(-1)|=2 (constructive at λ/2 = 2×path) and averages to ~1 above f_step.
        //
        // Reference: Olson (1969) — simplified diffraction model
        let k = omega / 343.21;
        let delay = 2.0 * path;
        let baffle_factor = Complex::new(1.0, 0.0) - Complex::new(0.0, -k * delay).exp();

        // Front radiation (half-space monopole)
        let u_driver = p.sd_m2 * v_cone;
        let p_monopole = RHO_0 * omega * u_driver / (2.0 * std::f64::consts::PI);

        // Apply baffle diffraction
        let p_total = p_monopole * baffle_factor;
        spl_db.push(pressure_to_spl_db(p_total.norm()));
        pressure_phases.push(p_total.arg());
    }

    let group_delay_ms = compute_group_delay_ms(frequencies_hz, &pressure_phases);

    SimulationResult {
        frequencies_hz: frequencies_hz.to_vec(),
        spl_db,
        impedance_ohm,
        impedance_phase_deg,
        cone_displacement_mm: displacement_mm,
        group_delay_ms,
        acoustic_phase_deg: pressure_phases.iter().map(|p| p.to_degrees()).collect(),
        port_velocity_ms: None,
    }
}
