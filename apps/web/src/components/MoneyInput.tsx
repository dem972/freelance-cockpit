import { useState } from "react";

interface Props {
  /** Cents. */
  value: number;
  onChange: (cents: number) => void;
  allowNegative?: boolean;
  required?: boolean;
}

/** Euro amount field: shows euros, reports cents (integer). */
export function MoneyInput({ value, onChange, allowNegative = false, required = false }: Props) {
  const [text, setText] = useState(value === 0 ? "" : String(value / 100));
  return (
    <input
      inputMode="decimal"
      required={required}
      value={text}
      placeholder="0,00"
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = Number(raw.replace(/\s/g, "").replace(",", "."));
        if (Number.isFinite(n)) onChange(Math.round((allowNegative ? n : Math.abs(n)) * 100));
      }}
    />
  );
}
