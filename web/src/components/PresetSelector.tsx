import { useState, useEffect, useMemo } from 'react';
import { DRIVER_DB } from '../presets/drivers_db';
import { DRIVER_PRESETS } from '../presets/drivers';
import type { DriverParams } from '../types';

interface Props {
  onSelect: (params: DriverParams, name: string) => void;
  currentName?: string;
}

export function PresetSelector({ onSelect, currentName }: Props) {
  const [search, setSearch] = useState(currentName ?? '');

  // Sync search field when active way changes
  useEffect(() => {
    setSearch(currentName ?? '');
  }, [currentName]);
  const [showList, setShowList] = useState(false);

  const filtered = useMemo(() => {
    if (!search || search.length < 2) return [];
    const q = search.toLowerCase();
    return DRIVER_DB.filter(
      (d) => d.vendor.toLowerCase().includes(q) || d.model.toLowerCase().includes(q)
    ).slice(0, 30); // max 30 results
  }, [search]);

  return (
    <div className="section-card" style={{ position: 'relative', overflow: 'visible' }}>
      <div className="section-title">Driver Database</div>

      {/* Search input */}
      <div className="param-row" title="Search 485 real drivers by manufacturer or model name (e.g. 'Scan-Speak', 'W18', 'Dayton')">
        <input
          type="text"
          className="graf-form-control"
          placeholder="Search drivers..."
          style={{ width: '100%' }}
          value={search}
          onFocus={() => setShowList(true)}
          onChange={(e) => { setSearch(e.target.value); setShowList(true); }}
        />
      </div>

      {/* Search results dropdown */}
      {showList && filtered.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 100, left: 0, right: 0,
          maxHeight: 200, overflowY: 'auto',
          background: 'var(--graf-surface, #fff)',
          border: '1px solid var(--graf-border, #e8e4dc)',
          borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          {filtered.map((d, i) => (
            <div key={i}
              style={{
                padding: '4px 8px', cursor: 'pointer', fontSize: 12,
                borderBottom: '1px solid var(--graf-warm-100, #f0ede8)',
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                const name = `${d.vendor} ${d.model}`;
                onSelect(d.params, name);
                setSearch(name);
                setShowList(false);
              }}
            >
              <strong>{d.vendor}</strong> {d.model}
              <span style={{ float: 'right', color: 'var(--graf-warm-400)', fontSize: 11 }}>
                {d.params.fs_hz}Hz {d.z_nom}Ω {d.dia_m ? `${(d.dia_m * 100).toFixed(0)}cm` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Generic presets fallback */}
      <div className="param-row" style={{ marginTop: 4 }}>
        <span className="param-label" style={{ flex: '0 0 50px' }}>Quick</span>
        <select
          className="graf-form-control graf-form-select"
          style={{ width: '100%' }}
          defaultValue=""
          onChange={(e) => {
            const idx = parseInt(e.target.value);
            if (!isNaN(idx)) {
              onSelect(DRIVER_PRESETS[idx].params, DRIVER_PRESETS[idx].name);
              setSearch(DRIVER_PRESETS[idx].name);
            }
            e.target.value = '';
          }}
        >
          <option value="" disabled>Generic presets...</option>
          {DRIVER_PRESETS.map((p, i) => (
            <option key={i} value={i}>{p.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
