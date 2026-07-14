import { BadRequestException } from "@nestjs/common";
import { DonationBox } from "../entities/donation-box.entity";
import {
  DEFAULT_DONATION_BOX_COLLECTION_RADIUS_METERS,
  distanceMeters,
  formatRadiusMeters,
} from "../../../utils/geo/geo-distance.util";
export function boxRequiresCollectionLocation(donationBox: DonationBox): boolean {
  return donationBox.require_collection_location !== false;
}

export function assertCollectorWithinBoxLocation(
  donationBox: DonationBox,
  collectorLatitude?: number | null,
  collectorLongitude?: number | null,
): void {
  if (!boxRequiresCollectionLocation(donationBox)) {
    return;
  }

  const boxLat = donationBox.registration_latitude;
  const boxLng = donationBox.registration_longitude;

  if (boxLat == null || boxLng == null) {
    return;
  }

  if (collectorLatitude == null || collectorLongitude == null) {
    throw new BadRequestException(
      "Your device location (Google Maps / GPS) is required to record a collection for this donation box.",
    );
  }

  const radiusMeters =
    donationBox.location_radius_meters ||
    DEFAULT_DONATION_BOX_COLLECTION_RADIUS_METERS;

  const distance = distanceMeters(
    Number(boxLat),
    Number(boxLng),
    collectorLatitude,
    collectorLongitude,
  );

  if (distance > radiusMeters) {
    throw new BadRequestException(
      `Collection must be recorded at the donation box shop (device GPS). You are approximately ${Math.round(distance)}m away (allowed: ${formatRadiusMeters(radiusMeters)}).`,
    );
  }
}
