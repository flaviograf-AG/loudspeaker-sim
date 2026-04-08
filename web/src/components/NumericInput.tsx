import { useState, useEffect, useRef } from 'react';

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
  const [draft, setDraft] = useState(formatVal(value));
  const [focused, setFocused] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Sync from parent when not focused (undo, external change)
  useEffect(() => {
    if (!focused) setDraft(formatVal(value));
  }, [value, focused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDraft(raw);

    // Fire onChange immediately for valid numbers (live chart updates)
    // but don't fire for partial input like "3." or empty string
    const n = parseFloat(raw);
    if (!isNaN(n) && isFinite(n) && raw !== '' && !raw.endsWith('.')) {
      const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
      onChangeRef.current(clamped);
    }
  };

  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n) && isFinite(n)) {
      const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
      onChangeRef.current(clamped);
      setDraft(formatVal(clamped));
    } else {
      setDraft(formatVal(value)); // revert bad input
    }
  };

  return (
    <div className="param-row" title={tooltip}>
      <span className="param-label">{label}</span>
      <input
        type="number"
        className="graf-form-control"
        value={focused ? draft : formatVal(value)}
        step={step}
        min={min}
        max={max}
        style={{ width: 90 }}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(); }}
        onChange={handleChange}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
      />
      {unit && <span className="param-unit">{unit}</span>}
    </div>
  );
}

function formatVal(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 100) return v.toFixed(1);
  if (abs >= 1) return v.toFixed(2);
  if (abs >= 0.01) return v.toFixed(4);
  return v.toExponential(3);
}
