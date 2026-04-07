//! JSON-serializable types for the multi-way system WASM API.
//!
//! These types bridge the JSON boundary (from JavaScript) to the internal
//! crossover and system solver types.

use serde::{Deserialize, Serialize};

use crate::crossover::{ActiveFilter, PassiveBlock};
use crate::system::{SpeakerProject, Way};
use crate::types::*;

/// JSON-serializable passive filter block.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PassiveFilterJson {
    SeriesR { ohms: f64 },
    SeriesL { henries: f64, dcr_ohms: f64 },
    SeriesC { farads: f64 },
    ShuntR { ohms: f64 },
    ShuntL { henries: f64, dcr_ohms: f64 },
    ShuntC { farads: f64 },
    ZobelShunt { ohms: f64, farads: f64 },
    LPad { series_ohms: f64, shunt_ohms: f64 },
    NotchShunt { ohms: f64, henries: f64, farads: f64 },
    NotchSeries { ohms: f64, henries: f64, farads: f64 },
}

impl From<PassiveFilterJson> for PassiveBlock {
    fn from(j: PassiveFilterJson) -> Self {
        match j {
            PassiveFilterJson::SeriesR { ohms } => PassiveBlock::SeriesR { ohms },
            PassiveFilterJson::SeriesL { henries, dcr_ohms } => PassiveBlock::SeriesL { henries, dcr_ohms },
            PassiveFilterJson::SeriesC { farads } => PassiveBlock::SeriesC { farads },
            PassiveFilterJson::ShuntR { ohms } => PassiveBlock::ShuntR { ohms },
            PassiveFilterJson::ShuntL { henries, dcr_ohms } => PassiveBlock::ShuntL { henries, dcr_ohms },
            PassiveFilterJson::ShuntC { farads } => PassiveBlock::ShuntC { farads },
            PassiveFilterJson::ZobelShunt { ohms, farads } => PassiveBlock::ZobelShunt { ohms, farads },
            PassiveFilterJson::LPad { series_ohms, shunt_ohms } => PassiveBlock::LPad { series_ohms, shunt_ohms },
            PassiveFilterJson::NotchShunt { ohms, henries, farads } => PassiveBlock::NotchShunt { ohms, henries, farads },
            PassiveFilterJson::NotchSeries { ohms, henries, farads } => PassiveBlock::NotchSeries { ohms, henries, farads },
        }
    }
}

/// JSON-serializable active filter block.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ActiveFilterJson {
    LowPass1 { freq_hz: f64 },
    HighPass1 { freq_hz: f64 },
    LowPass2 { freq_hz: f64, q: f64 },
    HighPass2 { freq_hz: f64, q: f64 },
    LR4LowPass { freq_hz: f64 },
    LR4HighPass { freq_hz: f64 },
    PEQ { freq_hz: f64, q: f64, gain_db: f64 },
    AllPass1 { freq_hz: f64 },
    AllPass2 { freq_hz: f64, q: f64 },
    LR2LowPass { freq_hz: f64 },
    LR2HighPass { freq_hz: f64 },
    ShelfLow { freq_hz: f64, gain_db: f64 },
    ShelfHigh { freq_hz: f64, gain_db: f64 },
    LinkwitzTransform { fo: f64, qo: f64, fp: f64, qp: f64 },
    Gain { db: f64 },
    Invert,
}

impl From<ActiveFilterJson> for ActiveFilter {
    fn from(j: ActiveFilterJson) -> Self {
        match j {
            ActiveFilterJson::LowPass1 { freq_hz } => ActiveFilter::LowPass1 { freq_hz },
            ActiveFilterJson::HighPass1 { freq_hz } => ActiveFilter::HighPass1 { freq_hz },
            ActiveFilterJson::LowPass2 { freq_hz, q } => ActiveFilter::LowPass2 { freq_hz, q },
            ActiveFilterJson::HighPass2 { freq_hz, q } => ActiveFilter::HighPass2 { freq_hz, q },
            ActiveFilterJson::LR4LowPass { freq_hz } => ActiveFilter::LR4LowPass { freq_hz },
            ActiveFilterJson::LR4HighPass { freq_hz } => ActiveFilter::LR4HighPass { freq_hz },
            ActiveFilterJson::PEQ { freq_hz, q, gain_db } => ActiveFilter::PEQ { freq_hz, q, gain_db },
            ActiveFilterJson::AllPass1 { freq_hz } => ActiveFilter::AllPass1 { freq_hz },
            ActiveFilterJson::AllPass2 { freq_hz, q } => ActiveFilter::AllPass2 { freq_hz, q },
            ActiveFilterJson::LR2LowPass { freq_hz } => ActiveFilter::LR2LowPass { freq_hz },
            ActiveFilterJson::LR2HighPass { freq_hz } => ActiveFilter::LR2HighPass { freq_hz },
            ActiveFilterJson::ShelfLow { freq_hz, gain_db } => ActiveFilter::ShelfLow { freq_hz, gain_db },
            ActiveFilterJson::ShelfHigh { freq_hz, gain_db } => ActiveFilter::ShelfHigh { freq_hz, gain_db },
            ActiveFilterJson::LinkwitzTransform { fo, qo, fp, qp } => ActiveFilter::LinkwitzTransform { fo, qo, fp, qp },
            ActiveFilterJson::Gain { db } => ActiveFilter::Gain { db },
            ActiveFilterJson::Invert => ActiveFilter::Invert,
        }
    }
}

/// JSON-serializable way definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WayJson {
    pub name: String,
    pub driver: DriverParams,
    pub enclosure: EnclosureConfig,
    #[serde(default)]
    pub passive_filters: Vec<PassiveFilterJson>,
    #[serde(default)]
    pub active_filters: Vec<ActiveFilterJson>,
    #[serde(default)]
    pub gain_db: f64,
    #[serde(default)]
    pub delay_s: f64,
    #[serde(default)]
    pub inverted: bool,
    #[serde(default)]
    pub z_offset_m: f64,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool { true }

/// JSON-serializable system input.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInputJson {
    pub ways: Vec<WayJson>,
    pub freq_start_hz: f64,
    pub freq_end_hz: f64,
    pub freq_points: usize,
    pub drive_voltage_rms: f64,
}

/// JSON-serializable per-way result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WayResultJson {
    pub name: String,
    pub spl_db: Vec<f64>,
    pub impedance_ohm: Vec<f64>,
    pub filter_gain_db: Vec<f64>,
}

/// JSON-serializable system result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemResultJson {
    pub frequencies_hz: Vec<f64>,
    pub min_impedance_ohm: f64,
    pub min_impedance_freq_hz: f64,
    pub ways: Vec<WayResultJson>,
    pub system_spl_db: Vec<f64>,
    pub system_group_delay_ms: Vec<f64>,
    pub system_impedance_ohm: Vec<f64>,
}

impl SystemInputJson {
    pub fn to_project(&self) -> SpeakerProject {
        SpeakerProject {
            ways: self.ways.iter().map(|w| Way {
                name: w.name.clone(),
                driver: w.driver.clone(),
                enclosure: w.enclosure.clone(),
                passive_filters: w.passive_filters.iter().cloned().map(Into::into).collect(),
                active_filters: w.active_filters.iter().cloned().map(Into::into).collect(),
                gain_db: w.gain_db,
                delay_s: w.delay_s,
                inverted: w.inverted,
                z_offset_m: w.z_offset_m,
                enabled: w.enabled,
            }).collect(),
            freq_start_hz: self.freq_start_hz,
            freq_end_hz: self.freq_end_hz,
            freq_points: self.freq_points,
            drive_voltage_rms: self.drive_voltage_rms,
        }
    }
}

/// JSON-serializable optimizer parameter.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum OptParamJson {
    FilterFreq { way_idx: usize, filter_idx: usize },
    WayGain { way_idx: usize },
    WayDelay { way_idx: usize },
    CrossoverFreq {
        lp_way_idx: usize, lp_filter_idx: usize,
        hp_way_idx: usize, hp_filter_idx: usize,
    },
}

/// Target curve specification for the optimizer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TargetCurveJson {
    Flat { db: f64 },
    Slope { db_at_1khz: f64, slope_db_per_octave: f64 },
    Custom { points: Vec<TargetPoint> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetPoint {
    pub freq_hz: f64,
    pub db: f64,
}

fn default_target_curve() -> TargetCurveJson {
    TargetCurveJson::Flat { db: 86.0 }
}

/// JSON-serializable optimizer input.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizerInputJson {
    pub system: SystemInputJson,
    pub params: Vec<OptParamJson>,
    #[serde(default = "default_target_curve")]
    pub target: TargetCurveJson,
    /// Legacy field — ignored if `target` is present
    #[serde(default)]
    pub target_db: Option<f64>,
    pub freq_min_hz: f64,
    pub freq_max_hz: f64,
    #[serde(default = "default_max_iter")]
    pub max_iterations: usize,
    /// Frequency weighting: "uniform" or "presence"
    #[serde(default)]
    pub freq_weight: Option<String>,
    /// Minimum impedance constraint (Ω). Omit or null = no constraint.
    #[serde(default)]
    pub min_impedance_ohm: Option<f64>,
    /// Algorithm: "nm", "de", "hybrid" (default: "hybrid")
    #[serde(default = "default_algorithm")]
    pub algorithm: String,
    /// E-series snapping: "E12", "E24", or "none" (default: none)
    #[serde(default)]
    pub e_series: Option<String>,
}

fn default_algorithm() -> String { "hybrid".to_string() }

fn default_max_iter() -> usize { 100 }

/// Hard cap to prevent browser tab freeze (WASM runs on main thread)
pub const MAX_ITERATIONS_CAP: usize = 500;

/// JSON-serializable optimizer result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizerResultJson {
    pub optimized_system: SystemInputJson,
    pub final_cost: f64,
    pub iterations: usize,
    pub cost_history: Vec<f64>,
    /// Minimum safe HP crossover frequency per way (Hz), derived from Sd × Xmax
    #[serde(default)]
    pub min_safe_freq_hz: Vec<f64>,
}
