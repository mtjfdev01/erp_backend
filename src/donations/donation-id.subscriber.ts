import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  DataSource,
  EntityManager,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from "typeorm";
import { Donation } from "./entities/donation.entity";
import { generateDonationPublicIdCandidate } from "./donation-id.util";

/**
 * Assigns opaque donation_public_id on every Donation insert
 * (create, installment, reconciliation). Skips if already set.
 */
@Injectable()
@EventSubscriber()
export class DonationIdSubscriber
  implements EntitySubscriberInterface<Donation>
{
  private readonly logger = new Logger(DonationIdSubscriber.name);

  constructor(@InjectDataSource() dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return Donation;
  }

  async beforeInsert(event: InsertEvent<Donation>): Promise<void> {
    if (!event.entity || event.entity.donation_public_id) return;
    event.entity.donation_public_id = await this.generateUnique(event.manager);
  }

  private async generateUnique(manager: EntityManager): Promise<string> {
    for (let attempt = 0; attempt < 25; attempt++) {
      const code = generateDonationPublicIdCandidate();
      const exists = await manager.findOne(Donation, {
        where: { donation_public_id: code },
        select: ["id"],
      });
      if (!exists) return code;
    }
    this.logger.error(
      "Failed to generate unique donation_public_id after 25 attempts",
    );
    throw new Error("Failed to generate unique donation_public_id");
  }
}
