import type { SimulationInput, SimulationResult, SystemInput, SystemResult } from '../types';

let wasmModule: {
  simulate: (json: string) => string;
  simulate_system: (json: string) => string;
  optimize_system: (json: string) => string;
} | null = null;

export async function initSolver(): Promise<void> {
  const wasm = await import('../../../solver/pkg/loudspeaker_solver');
  await wasm.default();
  wasmModule = wasm;
}

export function runSimulation(input: SimulationInput): SimulationResult {
  if (!wasmModule) {
    throw new Error('WASM solver not initialized. Call initSolver() first.');
  }
  const resultJson = wasmModule.simulate(JSON.stringify(input));
  return JSON.parse(resultJson);
}

export function runSystemSimulation(input: SystemInput): SystemResult {
  if (!wasmModule) {
    throw new Error('WASM solver not initialized. Call initSolver() first.');
  }
  const resultJson = wasmModule.simulate_system(JSON.stringify(input));
  return JSON.parse(resultJson);
}

export interface OptimizerInput {
  system: import('../types').SystemInput;
  params: { type: string; way_idx?: number; filter_idx?: number }[];
  target_db: number;
  freq_min_hz: number;
  freq_max_hz: number;
  max_iterations: number;
}

export interface OptimizerResult {
  optimized_system: import('../types').SystemInput;
  final_cost: number;
  iterations: number;
  cost_history: number[];
}

export function runOptimizer(input: OptimizerInput): OptimizerResult {
  if (!wasmModule) {
    throw new Error('WASM solver not initialized.');
  }
  const resultJson = wasmModule.optimize_system(JSON.stringify(input));
  return JSON.parse(resultJson);
}
