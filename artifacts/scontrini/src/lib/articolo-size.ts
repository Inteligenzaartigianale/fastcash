export const SIZES = [
  { label: "S", px: 100 },
  { label: "M", px: 130 },
  { label: "L", px: 160 },
  { label: "XL", px: 200 },
  { label: "XXL", px: 250 },
] as const;

export type SizeLabel = typeof SIZES[number]["label"];