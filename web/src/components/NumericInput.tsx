interface NumericInputProps {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  tooltip?: string;
  onChange: (value: number) => void;
}

export function NumericInput({ label, value, step = 1, min, max, unit, tooltip, onChange }: NumericInputProps) {
  return (
    <div className="param-row" title={tooltip}>
      <span className="param-label">{label}</span>
      <input
        type="number"
        className="graf-form-control"
        value={Number(value.toPrecision(6))}
        step={step}
        min={min}
        max={max}
        style={{ width: 90 }}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(v);
        }}
      />
      {unit && <span className="param-unit">{unit}</span>}
    </div>
  );
}
