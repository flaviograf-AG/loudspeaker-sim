import { useState } from 'react';
import { loadDesigns, saveDesign, deleteDesign, type SavedDesign } from '../hooks/useDesignStore';
import type { SimulationInput } from '../types';

interface Props {
  input: SimulationInput;
  onLoad: (input: SimulationInput) => void;
}

export function SaveLoadControls({ input, onLoad }: Props) {
  const [designs, setDesigns] = useState<SavedDesign[]>(loadDesigns);
  const [showList, setShowList] = useState(false);

  const handleSave = () => {
    const name = prompt('Design name:');
    if (!name) return;
    saveDesign(name, input);
    setDesigns(loadDesigns());
  };

  const handleDelete = (idx: number) => {
    deleteDesign(idx);
    setDesigns(loadDesigns());
  };

  const handleExport = () => {
    const json = JSON.stringify(input, null, 2);
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
          onLoad(parsed);
        } catch {
          alert('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    };
    fileInput.click();
  };

  const btnStyle: React.CSSProperties = {
    fontSize: 12, padding: '3px 8px', cursor: 'pointer', marginRight: 4,
  };

  return (
    <fieldset style={{ border: '1px solid #ccc', padding: 8, marginBottom: 8 }}>
      <legend>Save / Load</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <button style={btnStyle} onClick={handleSave}>Save</button>
        <button style={btnStyle} onClick={() => setShowList(!showList)}>
          Load ({designs.length})
        </button>
        <button style={btnStyle} onClick={handleExport}>Export JSON</button>
        <button style={btnStyle} onClick={handleImport}>Import JSON</button>
      </div>
      {showList && designs.length > 0 && (
        <ul style={{ fontSize: 12, margin: '6px 0 0', paddingLeft: 16 }}>
          {designs.map((d, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              <button style={{ ...btnStyle, fontWeight: 'bold' }} onClick={() => { onLoad(d.input); setShowList(false); }}>
                {d.name}
              </button>
              <span style={{ color: '#999' }}>{new Date(d.timestamp).toLocaleDateString()}</span>
              <button style={{ ...btnStyle, color: 'red', marginLeft: 4 }} onClick={() => handleDelete(i)}>×</button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
