export const SIZES = [
  { label: "S", px: 70 },
  { label: "M", px: 90 },
  { label: "L", px: 112 },
  { label: "XL", px: 140 },
  { label: "XXL", px: 175 },
] as const;

export type SizeLabel = typeof SIZES[number]["label"];