export const POC_TYPES = [
  'Corporate Donors',
  'Donation Boxes',
  'Mosques',
] as const;

export type PocType = (typeof POC_TYPES)[number];

export const DEFAULT_POC_TYPE: PocType = 'Corporate Donors';
