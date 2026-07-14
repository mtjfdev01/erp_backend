/**
 * Great-circle distance between two WGS-84 coordinates (meters).
 */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const DEFAULT_DONATION_BOX_COLLECTION_RADIUS_METERS = Number(
  process.env.DONATION_BOX_COLLECTION_RADIUS_METERS || 100,
);

export const MIN_DONATION_BOX_COLLECTION_RADIUS_METERS = 10;
export const MAX_DONATION_BOX_COLLECTION_RADIUS_METERS = 10000;

export function formatRadiusMeters(meters: number): string {
  if (!Number.isFinite(meters)) return "-";
  if (meters >= 1000) {
    const km = meters / 1000;
    return Number.isInteger(km) ? `${km} km` : `${km.toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}
