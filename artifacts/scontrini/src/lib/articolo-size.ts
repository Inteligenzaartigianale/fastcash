import { useState, useEffect } from "react";

export const SIZES = [
  { label: "S",  px: 100 },
  { label: "M",  px: 130 },
  { label: "L",  px: 160 },
  { label: "XL", px: 200 },
  { label: "XXL",px: 250 },
] as const;

export type SizeLabel = typeof SIZES[number]["label"];

const KEY = "articolo_size";
const DEFAULT: SizeLabel = "S";

export function useArticoloSize() {
  const [size, setSize] = useState<SizeLabel>(() => {
    const saved = localStorage.getItem(KEY) as SizeLabel | null;
    return SIZES.find(s => s.label === saved) ? (saved as SizeLabel) : DEFAULT;
  });

  useEffect(() => {
    localStorage.setItem(KEY, size);
  }, [size]);

  const px = SIZES.find(s => s.label === size)!.px;
  return { size, setSize, px };
}
