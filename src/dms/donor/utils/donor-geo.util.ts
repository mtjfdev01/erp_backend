import { buildGeoSearch } from "../../../utils/geo/geo-search.util";

export const DONOR_GEO_FIELD_KEYS = [
  "country",
  "city",
  "address",
  "company_address",
] as const;

export type DonorGeoInput = {
  country?: string | null;
  city?: string | null;
  address?: string | null;
  company_address?: string | null;
};

/** Includes CSR company_address in the search blob. */
export const buildDonorGeoSearch = (parts: DonorGeoInput): string =>
  buildGeoSearch({
    country: parts.country,
    city: parts.city,
    address: parts.address,
    extraParts: [parts.company_address],
  });

export const attachDonorGeoSearch = <T extends DonorGeoInput>(
  record: T,
): T & { geo_search: string } => ({
  ...record,
  geo_search: buildDonorGeoSearch(record),
});

export const donorGeoFieldsTouched = (
  patch: Record<string, unknown>,
): boolean =>
  DONOR_GEO_FIELD_KEYS.some((key) => patch[key] !== undefined);
