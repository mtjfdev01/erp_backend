export const DEFAULT_COLLECTION_UNIT_TYPE = "Donation Boxes";

export const COLLECTION_UNIT_TYPES = [
  "Donation Boxes",
  "Mosques",
] as const;

export type CollectionUnitType = (typeof COLLECTION_UNIT_TYPES)[number] | string;
