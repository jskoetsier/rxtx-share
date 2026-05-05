import { Injectable } from "@nestjs/common";
import { User } from "@prisma/client";
import { ConfigService } from "src/config/config.service";
import { EmailService } from "src/email/email.service";

@Injectable()
export class ShareNotificationService {
  constructor(
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

  async notifyRecipients(
    recipients: { email: string }[],
    shareId: string,
    creator: User,
    description: string | null,
    expiration: Date,
  ) {
    for (const recipient of recipients) {
      await this.emailService.sendMailToShareRecipients(
        recipient.email,
        shareId,
        creator,
        description,
        expiration,
      );
    }
  }

  async notifyReverseShareCreator(
    reverseShareCreatorEmail: string,
    shareId: string,
  ) {
    if (!this.configService.get("smtp.enabled")) return;
    await this.emailService.sendMailToReverseShareCreator(
      reverseShareCreatorEmail,
      shareId,
    );
  }
}
