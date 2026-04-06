interface NumericInputProps {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export function NumericInput({ label, value, step = 1, min, max, unit, onChange }: NumericInputProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <label style={{ flex: '0 0 100px', fontSize: 13, textAlign: 'right' }}>{label}</label>
      <input
        type="number"
        value={Number(value.toPrecision(6))}
        step={step}
        min={min}
        max={max}
        style={{ width: 90, padding: '2px 4px', fontSize: 13 }}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
      />
      {unit && <span style={{ fontSize: 12, color: '#666' }}>{unit}</span>}
    </div>
  );
}
