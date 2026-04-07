import { useState } from 'react';
import { extractCrossoverPoints, defaultCrossoverPoints } from '../crossover';
import type { DesignState, SystemTopology } from '../types';

const STORAGE_KEY = 'ls-designs-v2';

interface SavedDesign {
  name: string;
  timestamp: number;
  design: DesignState;
}

function loadDesigns(): SavedDesign[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return migrateLegacyDesigns();
    return JSON.parse(raw);
  } catch { return []; }
}

/** One-time migration: read old ls-designs key and convert to v2 format */
function migrateLegacyDesigns(): SavedDesign[] {
  try {
    const raw = localStorage.getItem('ls-designs');
    if (!raw) return [];
    const legacy = JSON.parse(raw);
    const migrated: SavedDesign[] = legacy.map((d: any) => {
      const sys = d.system ?? { ways: [{ name: 'Full Range', driver: d.input?.driver, enclosure: d.input?.enclosure, passive_filters: [], active_filters: [], gain_db: 0, delay_s: 0, inverted: false, z_offset_m: 0, enabled: true }], freq_start_hz: d.input?.freq_start_hz ?? 10, freq_end_hz: d.input?.freq_end_hz ?? 20000, freq_points: d.input?.freq_points ?? 500, drive_voltage_rms: d.input?.drive_voltage_rms ?? 2.83 };
      const topo = d.topology ?? '1-way';
      const { points, perWayEq } = extractCrossoverPoints(sys.ways);
      return {
        name: d.name,
        timestamp: d.timestamp,
        design: {
          version: 2 as const,
          topology: topo,
          ways: sys.ways.map((w: any) => ({
            name: w.name, driver: w.driver, enclosure: w.enclosure,
            passive_filters: w.passive_filters ?? [], gain_db: w.gain_db ?? 0,
            delay_s: w.delay_s ?? 0, inverted: w.inverted ?? false,
            z_offset_m: w.z_offset_m ?? 0, enabled: w.enabled ?? true,
            preset_name: w.preset_name, measured: w.measured,
          })),
          crossover_points: points.length > 0 ? points : defaultCrossoverPoints(topo),
          per_way_eq: perWayEq,
          freq_start_hz: sys.freq_start_hz,
          freq_end_hz: sys.freq_end_hz,
          freq_points: sys.freq_points,
          drive_voltage_rms: sys.drive_voltage_rms,
        },
      };
    });
    // Save migrated designs under new key
    if (migrated.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch { return []; }
}

function saveDesignToStorage(name: string, design: DesignState): void {
  const designs = loadDesigns();
  designs.push({ name, timestamp: Date.now(), design });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
}

function deleteDesignFromStorage(index: number): void {
  const designs = loadDesigns();
  designs.splice(index, 1);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(designs));
}

interface SaveLoadProps {
  design: DesignState;
  onLoad: (design: DesignState) => void;
}

export function SaveLoad({ design, onLoad }: SaveLoadProps) {
  const [designs, setDesigns] = useState<SavedDesign[]>(loadDesigns);
  const [showList, setShowList] = useState(false);

  const handleSave = () => {
    const name = prompt('Design name:');
    if (!name) return;
    saveDesignToStorage(name, design);
    setDesigns(loadDesigns());
  };

  const handleDelete = (idx: number) => {
    deleteDesignFromStorage(idx);
    setDesigns(loadDesigns());
  };

  const handleExport = () => {
    const json = JSON.stringify(design, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'loudspeaker-design.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.onchange = () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (parsed.version === 2 && Array.isArray(parsed.ways) && parsed.ways.length > 0) {
            onLoad(parsed);
          } else if ('system' in parsed && 'topology' in parsed) {
            // Migrate v1 format: { topology, system }
            const { points, perWayEq } = extractCrossoverPoints(parsed.system.ways);
            onLoad({
              version: 2,
              topology: parsed.topology as SystemTopology,
              ways: parsed.system.ways.map((w: any) => ({
                name: w.name, driver: w.driver, enclosure: w.enclosure,
                passive_filters: w.passive_filters ?? [], gain_db: w.gain_db ?? 0,
                delay_s: w.delay_s ?? 0, inverted: w.inverted ?? false,
                z_offset_m: w.z_offset_m ?? 0, enabled: w.enabled ?? true,
                preset_name: w.preset_name, measured: w.measured,
              })),
              crossover_points: points.length > 0 ? points : defaultCrossoverPoints(parsed.topology),
              per_way_eq: perWayEq,
              freq_start_hz: parsed.system.freq_start_hz,
              freq_end_hz: parsed.system.freq_end_hz,
              freq_points: parsed.system.freq_points,
              drive_voltage_rms: parsed.system.drive_voltage_rms,
            });
          } else if ('driver' in parsed) {
            // Migrate legacy single-driver format
            onLoad({
              version: 2,
              topology: '1-way',
              ways: [{
                name: 'Full Range', driver: parsed.driver, enclosure: parsed.enclosure,
                passive_filters: [], gain_db: 0, delay_s: 0, inverted: false,
                z_offset_m: 0, enabled: true,
              }],
              crossover_points: [],
              per_way_eq: [[]],
              freq_start_hz: parsed.freq_start_hz, freq_end_hz: parsed.freq_end_hz,
              freq_points: parsed.freq_points, drive_voltage_rms: parsed.drive_voltage_rms,
            });
          } else {
            alert('Unrecognized file format');
          }
        } catch {
          alert('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    };
    fileInput.click();
  };

  return (
    <div className="section-card">
      <div className="section-title">Designs</div>
      <div className="btn-row">
        <button className="graf-btn graf-btn-sm graf-btn-outline" onClick={handleSave}
          title="Save current design to browser localStorage">
          <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: -3 }}>save</span> Save
        </button>
        <button className="graf-btn graf-btn-sm graf-btn-outline" onClick={() => setShowList(!showList)}
          title="Load a previously saved design">
          <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: -3 }}>folder_open</span> Load ({designs.length})
        </button>
        <button className="graf-btn graf-btn-sm graf-btn-ghost" onClick={handleExport}
          title="Export current design as a JSON file">Export</button>
        <button className="graf-btn graf-btn-sm graf-btn-ghost" onClick={handleImport}
          title="Import a design from a JSON file">Import</button>
      </div>
      {showList && designs.length > 0 && (
        <ul style={{ fontSize: 12, margin: '8px 0 0', paddingLeft: 16, listStyle: 'none' }}>
          {designs.map((d, i) => (
            <li key={i} style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <button className="graf-btn graf-btn-sm graf-btn-primary" onClick={() => { onLoad(d.design); setShowList(false); }}>
                {d.name}
              </button>
              <span className="param-unit">{new Date(d.timestamp).toLocaleDateString()}</span>
              <button className="graf-btn graf-btn-sm graf-btn-ghost" style={{ color: 'var(--graf-danger)' }} onClick={() => handleDelete(i)}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
