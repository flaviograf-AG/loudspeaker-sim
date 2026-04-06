import { DRIVER_PRESETS } from '../presets/drivers';
import type { DriverParams } from '../types';

interface Props {
  onSelect: (params: DriverParams) => void;
}

export function PresetSelector({ onSelect }: Props) {
  return (
    <div className="param-row" style={{ marginBottom: 8 }}>
      <span className="param-label">Preset</span>
      <select
        className="graf-form-control graf-form-select"
        style={{ width: 170 }}
        defaultValue=""
        onChange={(e) => {
          const idx = parseInt(e.target.value);
          if (!isNaN(idx)) onSelect(DRIVER_PRESETS[idx].params);
          e.target.value = '';
        }}
      >
        <option value="" disabled>Select a driver...</option>
        {DRIVER_PRESETS.map((p, i) => (
          <option key={i} value={i}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}
