//! Core data types for the loudspeaker solver.

use serde::{Deserialize, Serialize};

/// Thiele-Small parameters as entered by the user.
/// Reference: Small, R.H. "Direct-Radiator Loudspeaker System Analysis" (JAES, 1972)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriverParams {
    /// Resonant frequency (Hz)
    pub fs_hz: f64,
    /// DC resistance (Ω)
    pub re_ohm: f64,
    /// Voice coil inductance (H) — user enters mH, convert before storing
    pub le_h: f64,
    /// Electrical Q factor (dimensionless)
    pub qes: f64,
    /// Mechanical Q factor (dimensionless)
    pub qms: f64,
    /// Equivalent compliance volume (m³) — user enters L, convert before storing
    pub vas_m3: f64,
    /// Effective cone area (m²) — user enters cm², convert before storing
    pub sd_m2: f64,
    /// Maximum linear excursion (m) — user enters mm, convert before storing
    pub xmax_m: f64,
}

/// Derived electromechanical parameters (computed from DriverParams).
/// These are the canonical form used by the solver.
#[derive(Debug, Clone)]
pub struct DerivedDriver {
    /// All user-facing params preserved
    pub params: DriverParams,
    /// Total Q factor: Qts = (Qes × Qms) / (Qes + Qms)
    pub qts: f64,
    /// Mechanical compliance (m/N)
    pub cms: f64,
    /// Moving mass (kg)
    pub mms: f64,
    /// Mechanical resistance (N·s/m)
    pub rms: f64,
    /// Force factor (T·m)
    pub bl: f64,
}

/// Sealed box enclosure parameters.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SealedBoxParams {
    /// Internal box volume (m³) — user enters L, convert before storing
    pub volume_m3: f64,
    /// Box loss factor Ql (dimensionless, typically 5–15; default 7)
    pub ql: f64,
}

/// Vented box (bass reflex) enclosure parameters.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VentedBoxParams {
    /// Internal box volume (m³)
    pub volume_m3: f64,
    /// Port cross-sectional area (m²)
    pub port_area_m2: f64,
    /// Port physical length (m) — before end corrections
    pub port_length_m: f64,
    /// Number of ports (default 1)
    pub num_ports: u32,
    /// Port is flanged (affects end correction)
    pub port_flanged: bool,
    /// Box loss factor Ql
    pub ql: f64,
}

/// Taper profile for transmission line cross-section variation.
/// Reference: King, M.J. "Quarter Wavelength Loudspeaker Design" (2005-2020)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TaperProfile {
    /// Linear taper in radius (area varies quadratically). Default.
    Straight,
    /// Exponential taper: S(x) = S_driver × e^(m×x), m = ln(S_mouth/S_driver)/L
    Exponential,
    /// Conical taper: linear in area, S(x) = S_driver + (S_mouth-S_driver)×x/L
    Conical,
}

impl Default for TaperProfile {
    fn default() -> Self {
        TaperProfile::Straight
    }
}

/// A stuffing zone within the transmission line.
/// Multiple zones allow heavy stuffing near the driver and light near the mouth.
/// Reference: Bradbury, L.J.S. "The Use of Fibrous Materials in Loudspeaker Enclosures" (JAES, 1976)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StuffingZone {
    /// Start position as fraction of line length (0.0 = driver end)
    pub start_pct: f64,
    /// End position as fraction of line length (1.0 = mouth)
    pub end_pct: f64,
    /// Stuffing density (kg/m³)
    pub density_kg_m3: f64,
    /// Specific flow resistivity (Pa·s/m²)
    pub flow_resistivity_pa_s_m2: f64,
}

/// Mouth termination type affecting radiation impedance.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum MouthTermination {
    /// Standard flush opening — simple piston radiation impedance.
    Flush,
    /// Flared mouth with larger effective radiating area.
    Flared { flare_radius_m: f64 },
}

impl Default for MouthTermination {
    fn default() -> Self {
        MouthTermination::Flush
    }
}

/// Transmission line enclosure parameters.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TransmissionLineParams {
    /// Line physical length (m)
    pub length_m: f64,
    /// Cross-sectional area at driver end (m²)
    pub area_driver_m2: f64,
    /// Cross-sectional area at open end (m²) — same as driver end if straight
    pub area_mouth_m2: f64,
    /// Number of segments for TMM discretization (default 20)
    pub num_segments: u32,
    /// Stuffing density (kg/m³) — 0 = no stuffing. Used when stuffing_zones is empty.
    pub stuffing_density_kg_m3: f64,
    /// Specific flow resistivity of stuffing material (Pa·s/m²)
    /// Typical polyester fill: ~3500–8000; fiberglass: ~10000–40000
    /// Reference: Bradbury (1976)
    pub flow_resistivity_pa_s_m2: f64,
    /// Open end (true = quarter-wave TL) or closed end
    pub open_end: bool,
    /// Driver offset from closed end as fraction of line length (0.0 = at wall, default)
    /// Placing driver at 1/3 suppresses 3rd harmonic standing wave.
    /// Reference: King (2005-2020)
    #[serde(default)]
    pub driver_position: f64,
    /// Taper profile for cross-section variation along the line
    #[serde(default)]
    pub taper_profile: TaperProfile,
    /// Per-zone stuffing configuration. When non-empty, overrides the global
    /// stuffing_density_kg_m3 and flow_resistivity_pa_s_m2 fields.
    #[serde(default)]
    pub stuffing_zones: Vec<StuffingZone>,
    /// Mouth termination type
    #[serde(default)]
    pub mouth_termination: MouthTermination,
    /// Number of folds in the line. Each fold adds acoustic mass.
    /// Reference: practical TL construction constraint.
    #[serde(default)]
    pub num_folds: u32,
}

/// Enclosure configuration — tagged union for all enclosure types.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum EnclosureConfig {
    Sealed(SealedBoxParams),
    Vented(VentedBoxParams),
    TransmissionLine(TransmissionLineParams),
}

/// Complete simulation input — everything needed to run a sweep.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationInput {
    pub driver: DriverParams,
    pub enclosure: EnclosureConfig,
    pub freq_start_hz: f64,
    pub freq_end_hz: f64,
    pub freq_points: usize,
    pub drive_voltage_rms: f64,
}

/// Output from a frequency-domain simulation sweep.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationResult {
    /// Frequency points (Hz)
    pub frequencies_hz: Vec<f64>,
    /// Sound pressure level at 1m (dB SPL)
    pub spl_db: Vec<f64>,
    /// Electrical impedance magnitude (Ω)
    pub impedance_ohm: Vec<f64>,
    /// Electrical impedance phase (degrees)
    pub impedance_phase_deg: Vec<f64>,
    /// Cone displacement (mm, peak)
    pub cone_displacement_mm: Vec<f64>,
    /// Group delay (ms)
    pub group_delay_ms: Vec<f64>,
    /// Port air velocity (m/s) — None for sealed boxes
    pub port_velocity_ms: Option<Vec<f64>>,
}
