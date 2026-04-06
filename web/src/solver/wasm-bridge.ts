import type { SimulationInput, SimulationResult } from '../types';

let wasmModule: { simulate: (json: string) => string } | null = null;

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
