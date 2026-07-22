import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  min?: number;
}

/**
 * Input decimale che accetta sia virgola che punto come separatore.
 * Visualizza il valore formattato in italiano (es. "0,10") quando non attivo.
 */
export function CurrencyInput({
  value,
  onChange,
  className,
  placeholder = "0,00",
  disabled,
  min = 0,
}: CurrencyInputProps) {
  const [localStr, setLocalStr] = useState<string>("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Formatta come IT quando non attivo
  const formatted =
    value === 0
      ? ""
      : value.toLocaleString("it-IT", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  function parseLocal(str: string): number {
    // Normalizza: rimuovi spazi e punti mille, sostituisci virgola con punto
    const normalized = str.trim().replace(/\./g, "").replace(",", ".");
    const n = parseFloat(normalized);
    return isNaN(n) ? 0 : n;
  }

  function handleFocus() {
    setFocused(true);
    // Nel campo di testo mostra il valore numerico grezzo editabile
    setLocalStr(value === 0 ? "" : String(value).replace(".", ","));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Permetti solo cifre, virgola e punto
    const raw = e.target.value.replace(/[^0-9.,]/g, "");
    setLocalStr(raw);
  }

  function handleBlur() {
    setFocused(false);
    const parsed = parseLocal(localStr);
    // Applica min
    const clamped = Math.max(min, parsed);
    onChange(clamped);
    setLocalStr("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      inputRef.current?.blur();
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      disabled={disabled}
      className={cn(className)}
      placeholder={placeholder}
      value={focused ? localStr : formatted}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}
