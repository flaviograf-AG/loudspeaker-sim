import { useState } from 'react';
import type { DesignStateV2 } from '../types';

const STORAGE_KEY = 'ls-designs-v2';

interface SavedDesign {
  name: string;
  timestamp: number;
  design: DesignStateV2;
}

function loadDesigns(): SavedDesign[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function saveDesignToStorage(name: string, design: DesignStateV2): void {
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
  design: DesignStateV2;
  onLoad: (design: DesignStateV2) => void;
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
          if (parsed.version === 2) {
            onLoad(parsed);
          } else {
            alert('Unrecognized file format (expected v2 design)');
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
