import type { SimulationInput } from '../types';

const STORAGE_KEY = 'ls-designs';

export interface SavedDesign {
  name: string;
  timestamp: number;
  input: SimulationInput;
}

export function loadDesigns(): SavedDesign[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDesign(name: string, input: SimulationInput): void {
  const designs = loadDesigns();
  designs.push({ name, timestamp: Date.now(), input });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
}

export function deleteDesign(index: number): void {
  const designs = loadDesigns();
  designs.splice(index, 1);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
}
