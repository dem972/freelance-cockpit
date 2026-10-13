import { useState } from "react";
import { Input } from "@/components/ui/input";

interface Props {
  id?: string;
  /** Cents. */
  value: number;
  onChange: (cents: number) => void;
  allowNegative?: boolean;
  required?: boolean;
}

/** Euro amount field: shows euros, reports cents (integer). */
export function MoneyInput({
  id,
  value,
  onChange,
  allowNegative = false,
  required = false,
}: Props) {
  const [text, setText] = useState(value === 0 ? "" : String(value / 100));
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="decimal"
        required={required}
        value={text}
        placeholder="0,00"
        className="num pr-8"
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const n = Number(raw.replace(/\s/g, "").replace(",", "."));
          if (Number.isFinite(n)) onChange(Math.round((allowNegative ? n : Math.abs(n)) * 100));
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
        €
      </span>
    </div>
  );
}
