//! Test utilities: FRD/ZMA file parsers and comparison helpers.
//!
//! These parsers read the standard DIY audio file formats used by
//! Hornresp, XSim, VituixCAD, REW, ARTA, etc.

/// Parsed FRD (Frequency Response Data) file.
pub struct FrdData {
    pub frequencies_hz: Vec<f64>,
    pub spl_db: Vec<f64>,
    pub phase_deg: Vec<f64>,
}

/// Parsed ZMA (impedance measurement) file.
pub struct ZmaData {
    pub frequencies_hz: Vec<f64>,
    pub impedance_ohm: Vec<f64>,
    pub phase_deg: Vec<f64>,
}

/// Parse an FRD file from string contents.
/// Format: `frequency_hz  spl_db  phase_deg` per line, comments start with * or !
pub fn parse_frd(text: &str) -> FrdData {
    let mut frequencies_hz = Vec::new();
    let mut spl_db = Vec::new();
    let mut phase_deg = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('*') || trimmed.starts_with('!') {
            continue;
        }
        let parts: Vec<f64> = trimmed
            .split_whitespace()
            .filter_map(|s| s.parse::<f64>().ok())
            .collect();
        if parts.len() >= 2 {
            frequencies_hz.push(parts[0]);
            spl_db.push(parts[1]);
            phase_deg.push(if parts.len() >= 3 { parts[2] } else { 0.0 });
        }
    }

    FrdData { frequencies_hz, spl_db, phase_deg }
}

/// Parse a ZMA file from string contents.
/// Format: `frequency_hz  impedance_ohm  phase_deg` per line, comments start with * or !
pub fn parse_zma(text: &str) -> ZmaData {
    let mut frequencies_hz = Vec::new();
    let mut impedance_ohm = Vec::new();
    let mut phase_deg = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('*') || trimmed.starts_with('!') {
            continue;
        }
        let parts: Vec<f64> = trimmed
            .split_whitespace()
            .filter_map(|s| s.parse::<f64>().ok())
            .collect();
        if parts.len() >= 2 {
            frequencies_hz.push(parts[0]);
            impedance_ohm.push(parts[1]);
            phase_deg.push(if parts.len() >= 3 { parts[2] } else { 0.0 });
        }
    }

    ZmaData { frequencies_hz, impedance_ohm, phase_deg }
}

/// Linearly interpolate a value from a dataset at a target frequency.
/// Assumes `freqs` is sorted ascending.
pub fn interpolate(freqs: &[f64], values: &[f64], target_freq: f64) -> f64 {
    assert_eq!(freqs.len(), values.len());
    if target_freq <= freqs[0] {
        return values[0];
    }
    if target_freq >= *freqs.last().unwrap() {
        return *values.last().unwrap();
    }
    // Binary search for bracket
    let idx = freqs.partition_point(|&f| f < target_freq);
    if idx == 0 {
        return values[0];
    }
    let f0 = freqs[idx - 1];
    let f1 = freqs[idx];
    let v0 = values[idx - 1];
    let v1 = values[idx];
    let t = (target_freq - f0) / (f1 - f0);
    v0 + t * (v1 - v0)
}

/// Compare two datasets across a frequency range.
/// Returns (max_deviation, frequency_of_max_deviation).
pub fn max_deviation(
    ref_freqs: &[f64],
    ref_values: &[f64],
    sim_freqs: &[f64],
    sim_values: &[f64],
) -> (f64, f64) {
    let mut max_dev = 0.0_f64;
    let mut max_freq = 0.0_f64;

    for (i, &f) in sim_freqs.iter().enumerate() {
        // Only compare within the reference data range
        if f < ref_freqs[0] || f > *ref_freqs.last().unwrap() {
            continue;
        }
        let ref_val = interpolate(ref_freqs, ref_values, f);
        let dev = (sim_values[i] - ref_val).abs();
        if dev > max_dev {
            max_dev = dev;
            max_freq = f;
        }
    }

    (max_dev, max_freq)
}
