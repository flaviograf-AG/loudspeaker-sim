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

use crate::constants::{C_0, RHO_0, TWO_PI};
use crate::sweep::pressure_to_spl_db;
use crate::transfer_matrix::{
    cascade_2x2, characteristic_impedance, complex_wave_number, duct_transfer_matrix,
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

/// Get flow resistivity at a fractional position along the line.
/// If stuffing zones are defined, look up the zone; otherwise use the global value.
fn flow_resistivity_at(tl: &TransmissionLineParams, frac: f64) -> f64 {
    if tl.stuffing_zones.is_empty() {
        return tl.flow_resistivity_pa_s_m2;
    }
    for zone in &tl.stuffing_zones {
        if frac >= zone.start_pct && frac < zone.end_pct {
            return zone.flow_resistivity_pa_s_m2;
        }
    }
    0.0 // No zone covers this position → lossless
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
        let z0 = characteristic_impedance(RHO_0, C_0, area);
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
    let mut group_delay_ms = Vec::with_capacity(n);

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

        // === Build transfer matrices ===
        let z_line = if dp > 0.0 && n_dead > 0 {
            // Dead-end section: wall to driver
            let t_dead =
                build_section_matrix(tl, 0.0, dp, n_dead, omega, &fold_positions);
            // Dead-end termination: closed wall (infinite impedance)
            let z_wall = Complex::new(1e12, 0.0);
            let z_dead = (t_dead[0][0] * z_wall + t_dead[0][1])
                / (t_dead[1][0] * z_wall + t_dead[1][1]);

            // Open section: driver to mouth
            let t_open =
                build_section_matrix(tl, dp, 1.0, n_open, omega, &fold_positions);
            let z_open = (t_open[0][0] * z_rad + t_open[0][1])
                / (t_open[1][0] * z_rad + t_open[1][1]);

            // Driver sees both in parallel
            (z_dead * z_open) / (z_dead + z_open)
        } else {
            // No offset: single chain from driver (frac=0) to mouth (frac=1)
            let t_total =
                build_section_matrix(tl, 0.0, 1.0, n_seg_total, omega, &fold_positions);
            let a = t_total[0][0];
            let b = t_total[0][1];
            let c_mat = t_total[1][0];
            let d = t_total[1][1];
            (a * z_rad + b) / (c_mat * z_rad + d)
        };

        // === Convert to mechanical domain and solve circuit ===
        let sd2 = p.sd_m2 * p.sd_m2;
        let z_mech_line = sd2 * z_line;

        let s = j * omega;
        let z_mech_total = s * driver.mms + driver.rms + 1.0 / (s * driver.cms) + z_mech_line;
        let z_mot = driver.bl * driver.bl / z_mech_total;
        let z_in = p.re_ohm + s * p.le_h + z_mot;

        impedance_ohm.push(z_in.norm());
        impedance_phase_deg.push(z_in.arg().to_degrees());

        let i_coil = drive_voltage_rms / z_in;
        let force = driver.bl * i_coil;
        let v_cone = force / z_mech_total;
        let x_cone = v_cone / (j * omega);
        displacement_mm.push(x_cone.norm() * 1000.0);

        // === Volume velocity at mouth ===
        let u_driver = p.sd_m2 * v_cone;

        let u_mouth = if dp > 0.0 && n_dead > 0 {
            // With offset: mouth output from open section only
            let t_open =
                build_section_matrix(tl, dp, 1.0, n_open, omega, &fold_positions);
            // Fraction of driver volume velocity going into open section
            let t_dead =
                build_section_matrix(tl, 0.0, dp, n_dead, omega, &fold_positions);
            let z_wall = Complex::new(1e12, 0.0);
            let z_dead = (t_dead[0][0] * z_wall + t_dead[0][1])
                / (t_dead[1][0] * z_wall + t_dead[1][1]);
            let z_open = (t_open[0][0] * z_rad + t_open[0][1])
                / (t_open[1][0] * z_rad + t_open[1][1]);
            // Current divider: U_open = U_driver × Z_dead / (Z_dead + Z_open)
            let u_open = u_driver * z_dead / (z_dead + z_open);
            u_open / (t_open[1][0] * z_rad + t_open[1][1])
        } else {
            let t_total =
                build_section_matrix(tl, 0.0, 1.0, n_seg_total, omega, &fold_positions);
            u_driver / (t_total[1][0] * z_rad + t_total[1][1])
        };

        // Radiated sound: driver front + mouth
        let p_driver = RHO_0 * omega * u_driver / (2.0 * std::f64::consts::PI);
        let p_mouth = RHO_0 * omega * u_mouth / (2.0 * std::f64::consts::PI);
        let p_total = p_driver + p_mouth;
        spl_db.push(pressure_to_spl_db(p_total.norm()));

        group_delay_ms.push(-p_total.arg() / omega * 1000.0);
    }

    SimulationResult {
        frequencies_hz: frequencies_hz.to_vec(),
        spl_db,
        impedance_ohm,
        impedance_phase_deg,
        cone_displacement_mm: displacement_mm,
        group_delay_ms,
        port_velocity_ms: None,
    }
}
