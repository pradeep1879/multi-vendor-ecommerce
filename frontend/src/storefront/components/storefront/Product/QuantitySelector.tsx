import { Minus, Plus } from 'lucide-react';

export function QuantitySelector({
  value,
  max,
  onChange,
  disabled = false,
  label = 'Quantity',
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="store-quantity" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={disabled || value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={14} />
      </button>
      <output aria-live="polite">{value}</output>
      <button
        type="button"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
