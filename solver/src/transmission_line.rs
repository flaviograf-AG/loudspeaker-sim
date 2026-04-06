//! Transmission line (TL) loudspeaker model.
//!
//! Uses the Transfer Matrix Method (TMM) to model a distributed acoustic
//! waveguide behind the driver. The line is divided into N segments, each
//! with its own cross-sectional area (for tapered lines) and damping.
//!
//! Supports driver offset, multiple taper profiles, per-zone stuffing,
//! fold losses, and different mouth terminations.
//!
//! References:
//! - Bailey, A.R. "A Non-Resonant Loudspeaker Enclosure Design"
//!   (Wireless World, 1965) — original TL concept
//! - King, M.J. "Quarter Wavelength Loudspeaker Design" (2005-2020)
//!   — practical TL design methodology, driver offset, taper profiles
//! - Bradbury, L.J.S. "The Use of Fibrous Materials in Loudspeaker Enclosures"
//!   (JAES, 1976) — stuffing absorption model

use num_complex::Complex;

use crate::driver::driver_electrical_impedance;
use crate::constants::{C_0, RHO_0, TWO_PI};
use crate::sweep::{compute_group_delay_ms, pressure_to_spl_db};
use crate::transfer_matrix::{
    cascade_2x2, characteristic_impedance_stuffed, complex_wave_number, duct_transfer_matrix,
    identity_2x2, TransferMatrix2x2,
};
use crate::types::{
    DerivedDriver, MouthTermination, SimulationResult, TaperProfile, TransmissionLineParams,
};

/// Compute cross-sectional area at fractional position x/L along the line.
///
/// Supports multiple taper profiles:
/// - Straight: linear in radius → quadratic in area
/// - Exponential: S(x) = S_driver × exp(m×x), m = ln(S_mouth/S_driver)/L
/// - Conical: linear in area
///
/// Reference: King (2005-2020)
fn area_at_fraction(tl: &TransmissionLineParams, frac: f64) -> f64 {
    match &tl.taper_profile {
        TaperProfile::Straight => {
            // Linear taper in radius
            let r_driver = (tl.area_driver_m2 / std::f64::consts::PI).sqrt();
            let r_mouth = (tl.area_mouth_m2 / std::f64::consts::PI).sqrt();
            let r = r_driver + (r_mouth - r_driver) * frac;
            std::f64::consts::PI * r * r
        }
        TaperProfile::Exponential => {
            // Exponential: S(x) = S_driver × exp(m × x)
            if tl.area_driver_m2 <= 0.0 || tl.area_mouth_m2 <= 0.0 {
                return tl.area_driver_m2;
            }
            let m = (tl.area_mouth_m2 / tl.area_driver_m2).ln();
            tl.area_driver_m2 * (m * frac).exp()
        }
        TaperProfile::Conical => {
            // Linear in area
            tl.area_driver_m2 + (tl.area_mouth_m2 - tl.area_driver_m2) * frac
        }
    }
}

/// Estimate flow resistivity from stuffing density using Bradbury's empirical relation.
/// Rf ≈ 1000 × density_kg_m3 (rough approximation for polyester fiberfill).
/// Reference: Bradbury (1976), empirical data for glass wool / polyester.
fn density_to_flow_resistivity(density_kg_m3: f64) -> f64 {
    if density_kg_m3 <= 0.0 {
        return 0.0;
    }
    // Typical relation: Rf ≈ 1000 × ρ for polyester fill
    // (glass wool is ~3000×ρ, dacron ~800×ρ — 1000 is a reasonable default)
    1000.0 * density_kg_m3
}

/// Get flow resistivity at a fractional position along the line.
/// If stuffing zones are defined, look up the zone; otherwise use the global value.
/// When flow_resistivity is 0 but density > 0, derives from density.
fn flow_resistivity_at(tl: &TransmissionLineParams, frac: f64) -> f64 {
    if !tl.stuffing_zones.is_empty() {
        for zone in &tl.stuffing_zones {
            if frac >= zone.start_pct && frac < zone.end_pct {
                let fr = zone.flow_resistivity_pa_s_m2;
                return if fr > 0.0 { fr } else { density_to_flow_resistivity(zone.density_kg_m3) };
            }
        }
        return 0.0; // No zone covers this position → lossless
    }
    // Global stuffing
    if tl.flow_resistivity_pa_s_m2 > 0.0 {
        tl.flow_resistivity_pa_s_m2
    } else {
        density_to_flow_resistivity(tl.stuffing_density_kg_m3)
    }
}

/// Build a 2×2 series impedance matrix for a fold discontinuity.
/// Each fold adds a lumped acoustic mass ≈ ρ₀ × δ / S, where δ ≈ pipe diameter.
/// This damps standing wave peaks by introducing impedance discontinuities.
fn fold_impedance_matrix(omega: f64, area: f64) -> TransferMatrix2x2 {
    let diameter = 2.0 * (area / std::f64::consts::PI).sqrt();
    let m_fold = RHO_0 * diameter / area; // acoustic mass of fold
    let j = Complex::new(0.0, 1.0);
    let z_fold = j * omega * m_fold;
    let one = Complex::new(1.0, 0.0);
    let zero = Complex::new(0.0, 0.0);
    // Series impedance: [[1, Z], [0, 1]]
    [[one, z_fold], [zero, one]]
}

/// Build the cascaded transfer matrix for a section of the TL.
/// `start_frac` and `end_frac` are fractional positions along the full line (0.0–1.0).
fn build_section_matrix(
    tl: &TransmissionLineParams,
    start_frac: f64,
    end_frac: f64,
    n_seg: usize,
    omega: f64,
    fold_positions: &[f64],
) -> TransferMatrix2x2 {
    let section_length = (end_frac - start_frac) * tl.length_m;
    let seg_length = section_length / n_seg as f64;
    let mut t_total = identity_2x2();

    for seg in 0..n_seg {
        let seg_frac = start_frac + (seg as f64 + 0.5) / n_seg as f64 * (end_frac - start_frac);
        let area = area_at_fraction(tl, seg_frac);
        let fr = flow_resistivity_at(tl, seg_frac);
        let k = complex_wave_number(omega, C_0, RHO_0, fr);
        let z0 = characteristic_impedance_stuffed(omega, RHO_0, C_0, area, fr);
        let t_seg = duct_transfer_matrix(k, z0, seg_length);
        t_total = cascade_2x2(&t_total, &t_seg);

        // Insert fold matrix if a fold falls between this segment and the next
        let seg_end_frac =
            start_frac + (seg as f64 + 1.0) / n_seg as f64 * (end_frac - start_frac);
        for &fold_pos in fold_positions {
            if fold_pos > seg_frac && fold_pos <= seg_end_frac {
                let fold_area = area_at_fraction(tl, fold_pos);
                let t_fold = fold_impedance_matrix(omega, fold_area);
                t_total = cascade_2x2(&t_total, &t_fold);
            }
        }
    }

    t_total
}

/// Compute TL frequency response using cascaded transfer matrices.
///
/// When driver_position > 0, the line splits into two sections:
/// - Dead-end: from closed wall (frac=0) to driver (frac=driver_position)
/// - Open section: from driver to mouth (frac=driver_position to 1.0)
/// The driver sees dead-end impedance in parallel with open-section impedance.
///
/// Reference: King (2005-2020) — driver offset methodology
pub fn tl_frequency_response(
    driver: &DerivedDriver,
    tl: &TransmissionLineParams,
    frequencies_hz: &[f64],
    drive_voltage_rms: f64,
) -> SimulationResult {
    let p = &driver.params;
    let j = Complex::new(0.0, 1.0);
    let n_seg_total = tl.num_segments.max(1) as usize;
    let dp = tl.driver_position.clamp(0.0, 0.49); // max 49% offset

    // Distribute folds evenly along the line
    let fold_positions: Vec<f64> = if tl.num_folds > 0 {
        (1..=tl.num_folds)
            .map(|i| i as f64 / (tl.num_folds + 1) as f64)
            .collect()
    } else {
        Vec::new()
    };

    // Split segments between dead-end and open sections
    let n_dead = if dp > 0.0 {
        (n_seg_total as f64 * dp).max(1.0) as usize
    } else {
        0
    };
    let n_open = n_seg_total - n_dead;

    let n = frequencies_hz.len();
    let mut spl_db = Vec::with_capacity(n);
    let mut impedance_ohm = Vec::with_capacity(n);
    let mut impedance_phase_deg = Vec::with_capacity(n);
    let mut displacement_mm = Vec::with_capacity(n);
    let mut pressure_phases = Vec::with_capacity(n);

    for &f in frequencies_hz {
        let omega = TWO_PI * f;

        // === Mouth termination impedance ===
        let mouth_area = match &tl.mouth_termination {
            MouthTermination::Flush => tl.area_mouth_m2,
            MouthTermination::Flared { flare_radius_m } => {
                std::f64::consts::PI * flare_radius_m * flare_radius_m
            }
        };
        let a_mouth = (mouth_area / std::f64::consts::PI).sqrt();
        let ka = (omega / C_0) * a_mouth;
        let z_rad = if tl.open_end {
            // Open end: radiation impedance (piston in baffle)
            // Beranek (1986), Eq. 5.12
            let z0_mouth = RHO_0 * C_0 / mouth_area;
            Complex::new(z0_mouth * 0.5 * ka * ka, z0_mouth * 0.6133 * ka)
        } else {
            Complex::new(1e12, 0.0) // Closed end
        };

        // === Build transfer matrices (computed once, reused for Z and U) ===
        let s = j * omega;
        let sd2 = p.sd_m2 * p.sd_m2;

        let (z_line, u_mouth_from_driver) = if dp > 0.0 && n_dead > 0 {
            let t_dead = build_section_matrix(tl, 0.0, dp, n_dead, omega, &fold_positions);
            let t_open = build_section_matrix(tl, dp, 1.0, n_open, omega, &fold_positions);
            let z_wall = Complex::new(1e12, 0.0);

            let z_dead = (t_dead[0][0] * z_wall + t_dead[0][1])
                / (t_dead[1][0] * z_wall + t_dead[1][1]);
            let z_open = (t_open[0][0] * z_rad + t_open[0][1])
                / (t_open[1][0] * z_rad + t_open[1][1]);

            let z_par = (z_dead * z_open) / (z_dead + z_open);

            // Mouth transfer: U_mouth/U_driver_open, where
            // U_driver_open = U_driver × Z_dead / (Z_dead + Z_open)
            // U_mouth = U_driver_open / (C×Z_rad + D) of open section
            let mouth_denom = t_open[1][0] * z_rad + t_open[1][1];
            let open_fraction = z_dead / (z_dead + z_open);
            // Combined: U_mouth = U_driver × open_fraction / mouth_denom
            let transfer = open_fraction / mouth_denom;

            (z_par, transfer)
        } else {
            let t_total = build_section_matrix(tl, 0.0, 1.0, n_seg_total, omega, &fold_positions);
            let z = (t_total[0][0] * z_rad + t_total[0][1])
                / (t_total[1][0] * z_rad + t_total[1][1]);
            let transfer = Complex::new(1.0, 0.0) / (t_total[1][0] * z_rad + t_total[1][1]);
            (z, transfer)
        };

        // === Electrical impedance and cone velocity ===
        let z_mech_line = sd2 * z_line;
        let z_mech_total = s * driver.mms + driver.rms + 1.0 / (s * driver.cms) + z_mech_line;
        let z_mot = driver.bl * driver.bl / z_mech_total;
        let z_in = driver_electrical_impedance(p, s) + z_mot;

        impedance_ohm.push(z_in.norm());
        impedance_phase_deg.push(z_in.arg().to_degrees());

        let i_coil = drive_voltage_rms / z_in;
        let force = driver.bl * i_coil;
        let v_cone = force / z_mech_total;
        let x_cone = v_cone / (j * omega);
        displacement_mm.push(x_cone.norm() * 1000.0);

        // === Volume velocity at mouth (using cached transfer) ===
        let u_driver = p.sd_m2 * v_cone;
        let u_mouth = u_driver * u_mouth_from_driver;

        // Radiated sound: driver front + mouth
        let p_driver = RHO_0 * omega * u_driver / (2.0 * std::f64::consts::PI);
        let p_mouth = RHO_0 * omega * u_mouth / (2.0 * std::f64::consts::PI);
        let p_total = p_driver + p_mouth;
        spl_db.push(pressure_to_spl_db(p_total.norm()));
        pressure_phases.push(p_total.arg());
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
        acoustic_phase_deg: pressure_phases.iter().map(|p| p.to_degrees()).collect(),
        port_velocity_ms: None,
    }
}
