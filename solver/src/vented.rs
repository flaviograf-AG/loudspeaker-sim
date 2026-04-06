//! Vented (bass reflex) box loudspeaker model.
//!
//! A vented box uses a port (duct) tuned to the Helmholtz resonance of the
//! box volume. This creates a fourth-order high-pass alignment with steeper
//! rolloff but extended bass compared to sealed.
//!
//! Reference: Small, R.H. "Vented-Box Loudspeaker Systems — Part I: Small-Signal Analysis"
//! JAES Vol. 21, No. 5 (1973), Equations 1–30.

use num_complex::Complex;

use crate::constants::{C_0, RHO_0, TWO_PI};
use crate::sweep::{compute_group_delay_ms, pressure_to_spl_db};
use crate::types::{DerivedDriver, SimulationResult, VentedBoxParams};

/// Compute effective port length including end corrections.
///
/// Flanged end correction: 0.85 × radius per end
/// Unflanged end correction: 0.6 × radius per end
/// Reference: Kinsler & Frey, "Fundamentals of Acoustics" (1982), Table 9.1
pub fn effective_port_length(enc: &VentedBoxParams) -> f64 {
    let port_diameter = (4.0 * enc.port_area_m2 / std::f64::consts::PI).sqrt();
    let radius = port_diameter / 2.0;

    let correction = if enc.port_flanged {
        0.85 * radius
    } else {
        0.6 * radius
    };

    // Both ends get a correction (inner + outer)
    enc.port_length_m + 2.0 * correction
}

/// Compute port tuning frequency (Helmholtz resonance of box + port).
///
/// Fb = c₀/(2π) × √(Sp / (Lp_eff × Vb))
/// Reference: Small (1973), Eq. 5
pub fn port_resonance_hz(enc: &VentedBoxParams) -> f64 {
    let lp_eff = effective_port_length(enc);
    let total_port_area = enc.port_area_m2 * enc.num_ports as f64;
    C_0 / TWO_PI * (total_port_area / (lp_eff * enc.volume_m3)).sqrt()
}

/// Compute frequency response for a vented box system.
///
/// Uses the full electromechano-acoustic equivalent circuit:
/// - Driver: Re, Le, Bl, Mms, Rms, Cms
/// - Box compliance: Cab = Vb / (ρ₀ × c₀²)
/// - Port mass: Map = ρ₀ × Lp_eff / Sp
///
/// Reference: Small (1973), Fig. 2 equivalent circuit
pub fn vented_frequency_response(
    driver: &DerivedDriver,
    enclosure: &VentedBoxParams,
    frequencies_hz: &[f64],
    drive_voltage_rms: f64,
) -> SimulationResult {
    let p = &driver.params;
    let j = Complex::new(0.0, 1.0);

    // Acoustic parameters
    let cab = enclosure.volume_m3 / (RHO_0 * C_0 * C_0);
    let lp_eff = effective_port_length(enclosure);
    let total_port_area = enclosure.port_area_m2 * enclosure.num_ports as f64;
    let map = RHO_0 * lp_eff / total_port_area;

    // Driver acoustic parameters (mechanical → acoustic domain via Sd²)
    let sd2 = p.sd_m2 * p.sd_m2;
    let mas = driver.mms / sd2;
    let ras = driver.rms / sd2;
    let cas = driver.cms * sd2;

    let n = frequencies_hz.len();
    let mut spl_db = Vec::with_capacity(n);
    let mut impedance_ohm = Vec::with_capacity(n);
    let mut impedance_phase_deg = Vec::with_capacity(n);
    let mut displacement_mm = Vec::with_capacity(n);
    let mut pressure_phases = Vec::with_capacity(n);
    let mut port_velocity = Vec::with_capacity(n);

    for &f in frequencies_hz {
        let omega = TWO_PI * f;
        let s = j * omega;

        // Box compliance impedance
        let z_cab = 1.0 / (s * cab);
        // Box loss resistance: Rab = 1/(ωb × Cab × Ql), evaluated at box resonance
        // This is a constant (frequency-independent) acoustic resistance.
        // Reference: Small (1973), Eq. 8
        let fb = port_resonance_hz(enclosure);
        let omega_b = TWO_PI * fb;
        let rab = if enclosure.ql > 0.0 && enclosure.ql < 1e6 {
            // Ql = ωb × Cab × Rab → Rab = Ql / (ωb × Cab)
            // High Ql = high resistance = low loss
            Complex::new(enclosure.ql / (omega_b * cab), 0.0)
        } else {
            Complex::new(1e12, 0.0) // No loss
        };
        let z_cab_with_loss = (z_cab * rab) / (z_cab + rab); // Cab ∥ Rab
        // Port impedance (acoustic mass)
        let z_port = s * map;
        // Box load: (Cab ∥ Rab) parallel with port
        let z_ab = (z_cab_with_loss * z_port) / (z_cab_with_loss + z_port);

        // Driver acoustic impedance including box load
        let z_driver_acoustic = s * mas + ras + 1.0 / (s * cas) + z_ab;

        // Convert to electrical domain
        let z_mech_total = sd2 * z_driver_acoustic;
        let z_mot = driver.bl * driver.bl / z_mech_total;
        let z_in = p.re_ohm + s * p.le_h + z_mot;

        impedance_ohm.push(z_in.norm());
        impedance_phase_deg.push(z_in.arg().to_degrees());

        // Cone velocity and displacement
        let i_coil = drive_voltage_rms / z_in;
        let force = driver.bl * i_coil;
        let v_cone = force / z_mech_total;
        let x_cone = v_cone / (j * omega);
        displacement_mm.push(x_cone.norm() * 1000.0);

        // Volume velocities
        let u_driver = p.sd_m2 * v_cone;
        let p_box = u_driver * z_ab;
        let u_port = p_box / z_port;
        let v_port = u_port / total_port_area;
        port_velocity.push(v_port.norm());

        // Radiated sound: driver front + port
        // p = ρ₀ × ω × (Ud + Up) / (2π)  at r = 1m
        let u_total = u_driver + u_port;
        let p_acoustic = RHO_0 * omega * u_total / (2.0 * std::f64::consts::PI);
        spl_db.push(pressure_to_spl_db(p_acoustic.norm()));
        pressure_phases.push(p_acoustic.arg());
    }

    // Group delay: -dφ/dω via numerical differentiation
    let group_delay_ms = compute_group_delay_ms(frequencies_hz, &pressure_phases);

    SimulationResult {
        frequencies_hz: frequencies_hz.to_vec(),
        spl_db,
        impedance_ohm,
        impedance_phase_deg,
        cone_displacement_mm: displacement_mm,
        group_delay_ms,
        port_velocity_ms: Some(port_velocity),
    }
}
