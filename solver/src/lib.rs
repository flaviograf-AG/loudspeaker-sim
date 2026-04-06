#![warn(clippy::all)]

pub mod alignments;
pub mod bandpass;
pub mod constants;
pub mod crossover;
pub mod driver;
pub mod horn;
pub mod open_baffle;
pub mod optimizer;
pub mod passive_radiator;
pub mod sealed;
pub mod sweep;
pub mod system;
pub mod system_api;
pub mod transfer_matrix;
pub mod transmission_line;
pub mod types;
pub mod vented;

use bandpass::bandpass_frequency_response;
use driver::derive_driver;
use horn::horn_frequency_response;
use open_baffle::open_baffle_frequency_response;
use passive_radiator::passive_radiator_frequency_response;
use sealed::sealed_frequency_response;
use sweep::log_frequency_sweep;
use transmission_line::tl_frequency_response;
use types::*;
use vented::vented_frequency_response;
use wasm_bindgen::prelude::*;

/// Validate driver parameters. Returns an error message if invalid.
fn validate_driver(d: &types::DriverParams) -> Result<(), String> {
    if d.fs_hz <= 0.0 { return Err("Fs must be positive".into()); }
    if d.re_ohm <= 0.0 { return Err("Re must be positive".into()); }
    if d.qes <= 0.0 { return Err("Qes must be positive".into()); }
    if d.qms <= 0.0 { return Err("Qms must be positive".into()); }
    if d.vas_m3 <= 0.0 { return Err("Vas must be positive".into()); }
    if d.sd_m2 <= 0.0 { return Err("Sd must be positive".into()); }
    if d.le_h < 0.0 { return Err("Le must be non-negative".into()); }
    if d.xmax_m < 0.0 { return Err("Xmax must be non-negative".into()); }
    Ok(())
}

/// Validate enclosure parameters.
fn validate_enclosure(enc: &EnclosureConfig) -> Result<(), String> {
    match enc {
        EnclosureConfig::Sealed(s) => {
            if s.volume_m3 <= 0.0 { return Err("Box volume must be positive".into()); }
        }
        EnclosureConfig::Vented(v) => {
            if v.volume_m3 <= 0.0 { return Err("Box volume must be positive".into()); }
            if v.port_area_m2 <= 0.0 { return Err("Port area must be positive".into()); }
            if v.port_length_m <= 0.0 { return Err("Port length must be positive".into()); }
        }
        EnclosureConfig::TransmissionLine(t) => {
            if t.length_m <= 0.0 { return Err("Line length must be positive".into()); }
            if t.area_driver_m2 <= 0.0 { return Err("Driver area must be positive".into()); }
            if t.area_mouth_m2 <= 0.0 { return Err("Mouth area must be positive".into()); }
        }
        EnclosureConfig::Horn(h) => {
            if h.segments.is_empty() { return Err("Horn must have at least one segment".into()); }
            for (i, seg) in h.segments.iter().enumerate() {
                if seg.area_start_m2 <= 0.0 || seg.area_end_m2 <= 0.0 {
                    return Err(format!("Horn segment {} areas must be positive", i + 1));
                }
                if seg.length_m <= 0.0 {
                    return Err(format!("Horn segment {} length must be positive", i + 1));
                }
            }
        }
        EnclosureConfig::Bandpass(b) => {
            if b.rear_volume_m3 <= 0.0 { return Err("Rear volume must be positive".into()); }
            if b.front_volume_m3 <= 0.0 { return Err("Front volume must be positive".into()); }
            if b.port_area_m2 <= 0.0 { return Err("Port area must be positive".into()); }
            if b.port_length_m <= 0.0 { return Err("Port length must be positive".into()); }
        }
        EnclosureConfig::PassiveRadiator(pr) => {
            if pr.volume_m3 <= 0.0 { return Err("Box volume must be positive".into()); }
            if pr.pr_sd_m2 <= 0.0 { return Err("PR area must be positive".into()); }
            if pr.pr_mms_kg <= 0.0 { return Err("PR mass must be positive".into()); }
            if pr.pr_cms <= 0.0 { return Err("PR compliance must be positive".into()); }
        }
        EnclosureConfig::OpenBaffle(ob) => {
            if ob.width_m <= 0.0 { return Err("Baffle width must be positive".into()); }
            if ob.height_m <= 0.0 { return Err("Baffle height must be positive".into()); }
        }
    }
    Ok(())
}

/// Main solver entry point — dispatches to the appropriate enclosure model.
pub fn solve_simulation(input: &SimulationInput) -> Result<SimulationResult, String> {
    validate_driver(&input.driver)?;
    validate_enclosure(&input.enclosure)?;
    if input.freq_points < 2 { return Err("Need at least 2 frequency points".into()); }
    if input.freq_start_hz <= 0.0 || input.freq_end_hz <= input.freq_start_hz {
        return Err("Invalid frequency range".into());
    }

    let driver = derive_driver(&input.driver);
    let freqs = log_frequency_sweep(input.freq_start_hz, input.freq_end_hz, input.freq_points);

    let result = match &input.enclosure {
        EnclosureConfig::Sealed(enc) => {
            sealed_frequency_response(&driver, enc, &freqs, input.drive_voltage_rms)
        }
        EnclosureConfig::Vented(enc) => {
            vented_frequency_response(&driver, enc, &freqs, input.drive_voltage_rms)
        }
        EnclosureConfig::TransmissionLine(enc) => {
            tl_frequency_response(&driver, enc, &freqs, input.drive_voltage_rms)
        }
        EnclosureConfig::Horn(enc) => {
            horn_frequency_response(&driver, enc, &freqs, input.drive_voltage_rms)
        }
        EnclosureConfig::Bandpass(enc) => {
            bandpass_frequency_response(&driver, enc, &freqs, input.drive_voltage_rms)
        }
        EnclosureConfig::PassiveRadiator(enc) => {
            passive_radiator_frequency_response(&driver, enc, &freqs, input.drive_voltage_rms)
        }
        EnclosureConfig::OpenBaffle(enc) => {
            open_baffle_frequency_response(&driver, enc, &freqs, input.drive_voltage_rms)
        }
    };

    // Verify no NaN/Inf leaked through
    if result.spl_db.iter().any(|v| !v.is_finite()) {
        return Err("Simulation produced non-finite SPL values — check parameters".into());
    }

    Ok(result)
}

/// WASM entry point: accepts JSON string, returns JSON string.
/// This is the only function called from JavaScript.
#[wasm_bindgen]
pub fn simulate(input_json: &str) -> Result<String, JsValue> {
    let input: SimulationInput = serde_json::from_str(input_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid input: {}", e)))?;

    let result = solve_simulation(&input)
        .map_err(|e| JsValue::from_str(&e))?;

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// WASM entry point for multi-way system simulation.
#[wasm_bindgen]
pub fn simulate_system(input_json: &str) -> Result<String, JsValue> {
    let input: system_api::SystemInputJson = serde_json::from_str(input_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid system input: {}", e)))?;

    let project = input.to_project();
    let result = system::solve_system(&project)
        .map_err(|e| JsValue::from_str(&e))?;

    // Convert to JSON-friendly output
    let output = system_api::SystemResultJson {
        frequencies_hz: result.frequencies_hz,
        min_impedance_ohm: result.min_impedance_ohm,
        min_impedance_freq_hz: result.min_impedance_freq_hz,
        ways: result.ways.into_iter().map(|w| system_api::WayResultJson {
            name: w.name,
            spl_db: w.spl_db,
            impedance_ohm: w.impedance_ohm,
            filter_gain_db: w.filter_gain_db,
        }).collect(),
        system_spl_db: result.system_spl_db,
        system_group_delay_ms: result.system_group_delay_ms,
        system_impedance_ohm: result.system_impedance_ohm,
    };

    serde_json::to_string(&output)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

/// WASM entry point for crossover optimization.
#[wasm_bindgen]
pub fn optimize_system(input_json: &str) -> Result<String, JsValue> {
    let input: system_api::OptimizerInputJson = serde_json::from_str(input_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid optimizer input: {}", e)))?;

    let project = input.system.to_project();
    let opt_params: Vec<optimizer::OptParam> = input.params.iter().map(|p| match p {
        system_api::OptParamJson::FilterFreq { way_idx, filter_idx } =>
            optimizer::OptParam::FilterFreq { way_idx: *way_idx, filter_idx: *filter_idx },
        system_api::OptParamJson::WayGain { way_idx } =>
            optimizer::OptParam::WayGain { way_idx: *way_idx },
        system_api::OptParamJson::WayDelay { way_idx } =>
            optimizer::OptParam::WayDelay { way_idx: *way_idx },
    }).collect();

    let config = optimizer::OptimizerConfig {
        params: opt_params.clone(),
        target_db: input.target_db,
        freq_min_hz: input.freq_min_hz,
        freq_max_hz: input.freq_max_hz,
        max_iterations: input.max_iterations,
        tolerance: 0.01,
    };

    let result = optimizer::optimize(&project, &config);

    // Apply optimized values back to the input system for return
    let mut opt_project = project.clone();
    optimizer::apply_values_pub(&mut opt_project, &opt_params, &result.values);

    // Convert back to JSON
    let opt_system = system_api::SystemInputJson {
        ways: opt_project.ways.iter().zip(input.system.ways.iter()).map(|(w, orig)| {
            let mut wj = orig.clone();
            // Update filter frequencies and gains from optimized values
            for (i, af) in w.active_filters.iter().enumerate() {
                if i < wj.active_filters.len() {
                    // Re-serialize the optimized filter
                    wj.active_filters[i] = active_filter_to_json(af);
                }
            }
            wj.gain_db = w.gain_db;
            wj.delay_s = w.delay_s;
            wj
        }).collect(),
        ..input.system
    };

    let output = system_api::OptimizerResultJson {
        optimized_system: opt_system,
        final_cost: result.final_cost,
        iterations: result.iterations,
        cost_history: result.cost_history,
    };

    serde_json::to_string(&output)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

fn active_filter_to_json(af: &crossover::ActiveFilter) -> system_api::ActiveFilterJson {
    match af {
        crossover::ActiveFilter::LowPass1 { freq_hz } => system_api::ActiveFilterJson::LowPass1 { freq_hz: *freq_hz },
        crossover::ActiveFilter::HighPass1 { freq_hz } => system_api::ActiveFilterJson::HighPass1 { freq_hz: *freq_hz },
        crossover::ActiveFilter::LowPass2 { freq_hz, q } => system_api::ActiveFilterJson::LowPass2 { freq_hz: *freq_hz, q: *q },
        crossover::ActiveFilter::HighPass2 { freq_hz, q } => system_api::ActiveFilterJson::HighPass2 { freq_hz: *freq_hz, q: *q },
        crossover::ActiveFilter::LR4LowPass { freq_hz } => system_api::ActiveFilterJson::LR4LowPass { freq_hz: *freq_hz },
        crossover::ActiveFilter::LR4HighPass { freq_hz } => system_api::ActiveFilterJson::LR4HighPass { freq_hz: *freq_hz },
        crossover::ActiveFilter::LR2LowPass { freq_hz } => system_api::ActiveFilterJson::LR2LowPass { freq_hz: *freq_hz },
        crossover::ActiveFilter::LR2HighPass { freq_hz } => system_api::ActiveFilterJson::LR2HighPass { freq_hz: *freq_hz },
        crossover::ActiveFilter::PEQ { freq_hz, q, gain_db } => system_api::ActiveFilterJson::PEQ { freq_hz: *freq_hz, q: *q, gain_db: *gain_db },
        crossover::ActiveFilter::AllPass1 { freq_hz } => system_api::ActiveFilterJson::AllPass1 { freq_hz: *freq_hz },
        crossover::ActiveFilter::AllPass2 { freq_hz, q } => system_api::ActiveFilterJson::AllPass2 { freq_hz: *freq_hz, q: *q },
        crossover::ActiveFilter::ShelfLow { freq_hz, gain_db } => system_api::ActiveFilterJson::ShelfLow { freq_hz: *freq_hz, gain_db: *gain_db },
        crossover::ActiveFilter::ShelfHigh { freq_hz, gain_db } => system_api::ActiveFilterJson::ShelfHigh { freq_hz: *freq_hz, gain_db: *gain_db },
        crossover::ActiveFilter::LinkwitzTransform { fo, qo, fp, qp } => system_api::ActiveFilterJson::LinkwitzTransform { fo: *fo, qo: *qo, fp: *fp, qp: *qp },
        crossover::ActiveFilter::Gain { db } => system_api::ActiveFilterJson::Gain { db: *db },
        crossover::ActiveFilter::Invert => system_api::ActiveFilterJson::Invert,
    }
}
