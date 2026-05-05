import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as argon from "argon2";
import * as fs from "fs";
import * as moment from "moment";
import { ClamScanService } from "src/clamscan/clamscan.service";
import { ConfigService } from "src/config/config.service";
import { FileService } from "src/file/file.service";
import { PrismaService } from "src/prisma/prisma.service";
import { ReverseShareService } from "src/reverseShare/reverseShare.service";
import { parseRelativeDateToAbsolute } from "src/utils/date.util";
import { SHARE_DIRECTORY } from "../constants";
import { CreateShareDTO } from "./dto/createShare.dto";
import { ShareNotificationService } from "./shareNotification.service";
import { ShareZipService } from "./shareZip.service";

@Injectable()
export class ShareCreationService {
  private readonly logger = new Logger(ShareCreationService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private fileService: FileService,
    private reverseShareService: ReverseShareService,
    private clamScanService: ClamScanService,
    private shareZipService: ShareZipService,
    private shareNotificationService: ShareNotificationService,
  ) {}

  async create(
    share: CreateShareDTO,
    user?: { id: string },
    reverseShareToken?: string,
  ) {
    if (!(await this.isShareIdAvailable(share.id)).isAvailable)
      throw new BadRequestException("Share id already in use");

    if (!share.security || Object.keys(share.security).length == 0)
      share.security = undefined;

    if (share.security?.password) {
      share.security.password = await argon.hash(share.security.password);
    }

    let expirationDate: Date;

    const reverseShare =
      await this.reverseShareService.getByToken(reverseShareToken);
    if (reverseShare) {
      expirationDate = reverseShare.shareExpiration;
    } else {
      const parsedExpiration = parseRelativeDateToAbsolute(share.expiration);

      const expiresNever = moment(0).toDate() == parsedExpiration;

      const maxExpiration = this.configService.get("share.maxExpiration");
      if (
        maxExpiration.value !== 0 &&
        (expiresNever ||
          parsedExpiration >
            moment().add(maxExpiration.value, maxExpiration.unit).toDate())
      ) {
        throw new BadRequestException(
          "Expiration date exceeds maximum expiration date",
        );
      }

      expirationDate = parsedExpiration;
    }

    fs.mkdirSync(`${SHARE_DIRECTORY}/${share.id}`, {
      recursive: true,
    });

    const shareTuple = await this.prisma.share.create({
      data: {
        ...share,
        expiration: expirationDate,
        creator: { connect: user ? { id: user.id } : undefined },
        security: { create: share.security },
        recipients: {
          create: share.recipients
            ? share.recipients.map((email) => ({ email }))
            : [],
        },
        storageProvider: this.configService.get("s3.enabled") ? "S3" : "LOCAL",
      },
    });

    if (reverseShare) {
      await this.prisma.reverseShare.update({
        where: { token: reverseShareToken },
        data: {
          shares: {
            connect: { id: shareTuple.id },
          },
        },
      });
    }

    return shareTuple;
  }

  async complete(id: string, reverseShareToken?: string) {
    const share = await this.prisma.share.findUnique({
      where: { id },
      include: {
        files: true,
        recipients: true,
        creator: true,
        reverseShare: { include: { creator: true } },
      },
    });

    if (!share) throw new NotFoundException("Share not found");

    if (await this.isShareCompleted(id))
      throw new BadRequestException("Share already completed");

    if (share.files.length == 0)
      throw new BadRequestException(
        "You need at least on file in your share to complete it.",
      );

    await this.clamScanService.checkAndRemove(share.id);
    const afterScan = await this.prisma.share.findUnique({ where: { id } });
    if (afterScan?.removedReason) {
      throw new BadRequestException(afterScan.removedReason);
    }

    if (share.files.length > 1) {
      try {
        await this.shareZipService.createZip(id);
        await this.prisma.share.update({
          where: { id },
          data: { isZipReady: true },
        });
      } catch (err) {
        this.logger.error(
          `Failed to create zip for share ${id}`,
          err instanceof Error ? err.stack : String(err),
        );
        throw new BadRequestException("Failed to create downloadable archive");
      }
    }

    await this.shareNotificationService.notifyRecipients(
      share.recipients,
      share.id,
      share.creator,
      share.description,
      share.expiration,
    );

    const notifyReverseShareCreator = share.reverseShare
      ? this.configService.get("smtp.enabled") &&
        share.reverseShare.sendEmailNotification
      : undefined;

    if (notifyReverseShareCreator) {
      await this.shareNotificationService.notifyReverseShareCreator(
        share.reverseShare.creator.email,
        share.id,
      );
    }

    if (share.reverseShare) {
      await this.prisma.reverseShare.update({
        where: { token: reverseShareToken },
        data: { remainingUses: { decrement: 1 } },
      });
    }

    const updatedShare = await this.prisma.share.update({
      where: { id },
      data: { uploadLocked: true },
    });

    return {
      ...updatedShare,
      notifyReverseShareCreator,
    };
  }

  async revertComplete(id: string) {
    return this.prisma.share.update({
      where: { id },
      data: { uploadLocked: false, isZipReady: false },
    });
  }

  async removeOwnShare(shareId: string) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
    });

    if (!share) throw new NotFoundException("Share not found");

    if (!share.creatorId)
      throw new ForbiddenException("Anonymous shares can't be deleted");

    await this.fileService.deleteAllFiles(shareId);
    await this.prisma.share.delete({ where: { id: shareId } });
  }

  async removeShareAsAdmin(shareId: string) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
    });

    if (!share) throw new NotFoundException("Share not found");

    await this.fileService.deleteAllFiles(shareId);
    await this.prisma.share.delete({ where: { id: shareId } });
  }

  async isShareCompleted(id: string) {
    const row = await this.prisma.share.findUnique({ where: { id } });
    return row?.uploadLocked ?? false;
  }

  async isShareIdAvailable(id: string) {
    const share = await this.prisma.share.findUnique({ where: { id } });
    return { isAvailable: !share };
  }
}
