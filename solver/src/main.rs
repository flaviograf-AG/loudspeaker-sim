//! CLI entry point for the loudspeaker solver.
//!
//! Reads JSON from stdin, runs the simulation, writes JSON to stdout.
//! Supports both single-enclosure and multi-way system modes.
//!
//! Usage:
//!   echo '{"driver":{...},"enclosure":{...},...}' | loudspeaker-solver
//!   echo '{"mode":"system","ways":[...],...}' | loudspeaker-solver
//!
//! The mode is auto-detected from the JSON structure:
//! - If "ways" key exists → multi-way system simulation
//! - Otherwise → single-enclosure simulation

use loudspeaker_solver::solve_simulation;
use loudspeaker_solver::system::solve_system;
use loudspeaker_solver::system_api::{SystemInputJson, SystemResultJson};
use loudspeaker_solver::types::SimulationInput;
use std::io::{self, Read};

fn main() {
    let mut input_str = String::new();
    if let Err(e) = io::stdin().read_to_string(&mut input_str) {
        eprintln!("Error reading stdin: {}", e);
        std::process::exit(1);
    }

    let input_str = input_str.trim();
    if input_str.is_empty() {
        eprintln!("No input provided. Send JSON via stdin.");
        std::process::exit(1);
    }

    // Auto-detect mode: if "ways" key exists, it's a system simulation
    let value: serde_json::Value = match serde_json::from_str(input_str) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("JSON parse error: {}", e);
            std::process::exit(1);
        }
    };

    if value.get("ways").is_some() {
        // Multi-way system mode
        let sys_input: SystemInputJson = match serde_json::from_value(value) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("Invalid system input: {}", e);
                std::process::exit(1);
            }
        };
        let project = sys_input.to_project();
        match solve_system(&project) {
            Ok(result) => {
                let output = SystemResultJson {
                    frequencies_hz: result.frequencies_hz,
                    min_impedance_ohm: result.min_impedance_ohm,
                    min_impedance_freq_hz: result.min_impedance_freq_hz,
                    ways: result.ways.into_iter().map(|w| loudspeaker_solver::system_api::WayResultJson {
                        name: w.name,
                        spl_db: w.spl_db,
                        impedance_ohm: w.impedance_ohm,
                        filter_gain_db: w.filter_gain_db,
                    }).collect(),
                    system_spl_db: result.system_spl_db,
                    system_group_delay_ms: result.system_group_delay_ms,
                    system_impedance_ohm: result.system_impedance_ohm,
                };
                serde_json::to_writer(io::stdout(), &output).unwrap();
            }
            Err(e) => {
                eprintln!("Simulation error: {}", e);
                std::process::exit(1);
            }
        }
    } else {
        // Single-enclosure mode
        let input: SimulationInput = match serde_json::from_value(value) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("Invalid input: {}", e);
                std::process::exit(1);
            }
        };
        match solve_simulation(&input) {
            Ok(result) => {
                serde_json::to_writer(io::stdout(), &result).unwrap();
            }
            Err(e) => {
                eprintln!("Simulation error: {}", e);
                std::process::exit(1);
            }
        }
    }
}
