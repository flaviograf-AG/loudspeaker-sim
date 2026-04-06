import { DRIVER_PRESETS } from '../presets/drivers';
import type { DriverParams } from '../types';

interface Props {
  onSelect: (params: DriverParams) => void;
}

export function PresetSelector({ onSelect }: Props) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 13 }}>
        Preset:{' '}
        <select
          style={{ fontSize: 13, padding: '2px 4px' }}
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
      </label>
    </div>
  );
}
