import { useState } from 'react';
import { loadDesigns, saveDesign, deleteDesign, type SavedDesign } from '../hooks/useDesignStore';
import type { SystemInput, SystemTopology } from '../types';

interface Props {
  topology: SystemTopology;
  system: SystemInput;
  onLoad: (topology: SystemTopology, system: SystemInput) => void;
}

export function SaveLoadControls({ topology, system, onLoad }: Props) {
  const [designs, setDesigns] = useState<SavedDesign[]>(loadDesigns);
  const [showList, setShowList] = useState(false);

  const handleSave = () => {
    const name = prompt('Design name:');
    if (!name) return;
    saveDesign(name, topology, system);
    setDesigns(loadDesigns());
  };

  const handleDelete = (idx: number) => {
    deleteDesign(idx);
    setDesigns(loadDesigns());
  };

  const handleExport = () => {
    const json = JSON.stringify({ topology, system }, null, 2);
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
          // Handle new format
          if ('system' in parsed && 'topology' in parsed) {
            onLoad(parsed.topology, parsed.system);
          }
          // Handle legacy SimulationInput format
          else if ('driver' in parsed) {
            onLoad('1-way', {
              ways: [{
                name: 'Full Range', driver: parsed.driver, enclosure: parsed.enclosure,
                passive_filters: [], active_filters: [],
                gain_db: 0, delay_s: 0, inverted: false, z_offset_m: 0, enabled: true,
              }],
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
          title="Save current design to browser localStorage with a name">
          <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: -3 }}>save</span> Save
        </button>
        <button className="graf-btn graf-btn-sm graf-btn-outline" onClick={() => setShowList(!showList)}
          title="Load a previously saved design from browser localStorage">
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
              <button className="graf-btn graf-btn-sm graf-btn-primary" onClick={() => { onLoad(d.topology, d.system); setShowList(false); }}>
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
