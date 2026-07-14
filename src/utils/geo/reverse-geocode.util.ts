import {
  ResolvedLocationDetails,
} from "./location-details.types";

function firstNonEmpty(
  ...values: Array<string | undefined | null>
): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function buildRoadAddress(address: Record<string, string>): string | undefined {
  const road = firstNonEmpty(
    address.road,
    address.pedestrian,
    address.footway,
    address.path,
    address.residential,
  );
  const houseNumber = address.house_number?.trim();

  if (road && houseNumber) {
    return `${houseNumber}, ${road}`;
  }
  return road;
}

export function parseNominatimLocationDetails(data: {
  display_name?: string;
  name?: string;
  address?: Record<string, string>;
}): ResolvedLocationDetails | null {
  const address = data.address || {};

  const place_or_shop = firstNonEmpty(
    data.name,
    address.amenity,
    address.shop,
    address.building,
    address.office,
    address.commercial,
    address.retail,
    address.historic,
  );

  const road_address = buildRoadAddress(address);

  const city = firstNonEmpty(
    address.city,
    address.town,
    address.village,
    address.hamlet,
    address.municipality,
  );

  const area = firstNonEmpty(
    address.suburb,
    address.neighbourhood,
    address.quarter,
    address.city_district,
    address.district,
  );

  const district = firstNonEmpty(
    address.county,
    address.state_district,
    address.district,
  );

  const province = firstNonEmpty(address.state, address.province, address.region);
  const country = address.country?.trim();

  const display_name =
    data.display_name?.trim() ||
    [
      place_or_shop,
      road_address,
      city,
      area,
      district,
      province,
      country,
    ]
      .filter(Boolean)
      .join(", ");

  if (!display_name && !place_or_shop && !road_address && !city) {
    return null;
  }

  return {
    display_name: display_name || undefined,
    place_or_shop,
    road_address,
    city,
    area,
    district,
    province,
    country,
  };
}

/**
 * Reverse geocode WGS-84 coordinates into structured place details (OpenStreetMap Nominatim).
 */
export async function reverseGeocodeLocationDetails(
  latitude: number,
  longitude: number,
): Promise<ResolvedLocationDetails | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      format: "json",
      lat: String(latitude),
      lon: String(longitude),
      zoom: "18",
      addressdetails: "1",
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      {
        headers: {
          "User-Agent": "MTJF-ERP-DonationBox/1.0 (contact@mtjf.org)",
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      display_name?: string;
      name?: string;
      address?: Record<string, string>;
    };

    return parseNominatimLocationDetails(data);
  } catch {
    return null;
  }
}

export async function reverseGeocodeLocationName(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  const details = await reverseGeocodeLocationDetails(latitude, longitude);
  return details?.display_name || null;
}
