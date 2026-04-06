#![warn(clippy::all)]

pub mod constants;
pub mod driver;
pub mod sealed;
pub mod sweep;
pub mod transfer_matrix;
pub mod transmission_line;
pub mod types;
pub mod vented;

use driver::derive_driver;
use sealed::sealed_frequency_response;
use sweep::log_frequency_sweep;
use transmission_line::tl_frequency_response;
use types::*;
use vented::vented_frequency_response;
use wasm_bindgen::prelude::*;

/// Main solver entry point — dispatches to the appropriate enclosure model.
pub fn solve_simulation(input: &SimulationInput) -> SimulationResult {
    let driver = derive_driver(&input.driver);
    let freqs = log_frequency_sweep(input.freq_start_hz, input.freq_end_hz, input.freq_points);

    match &input.enclosure {
        EnclosureConfig::Sealed(enc) => {
            sealed_frequency_response(&driver, enc, &freqs, input.drive_voltage_rms)
        }
        EnclosureConfig::Vented(enc) => {
            vented_frequency_response(&driver, enc, &freqs, input.drive_voltage_rms)
        }
        EnclosureConfig::TransmissionLine(enc) => {
            tl_frequency_response(&driver, enc, &freqs, input.drive_voltage_rms)
        }
    }
}

/// WASM entry point: accepts JSON string, returns JSON string.
/// This is the only function called from JavaScript.
#[wasm_bindgen]
pub fn simulate(input_json: &str) -> Result<String, JsValue> {
    let input: SimulationInput = serde_json::from_str(input_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid input: {}", e)))?;

    let result = solve_simulation(&input);

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}
