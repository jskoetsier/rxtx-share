import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Share } from "@prisma/client";
import * as argon from "argon2";
import * as moment from "moment";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { sharePublicInclude, SharePublicDto } from "./share.types";

@Injectable()
export class ShareAccessService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private jwtService: JwtService,
  ) {}

  async get(id: string): Promise<SharePublicDto> {
    const share = await this.prisma.share.findUnique({
      where: { id },
      include: sharePublicInclude,
    });

    if (!share) throw new NotFoundException("Share not found");

    if (share.removedReason)
      throw new NotFoundException(share.removedReason, "share_removed");

    if (!share.uploadLocked) throw new NotFoundException("Share not found");

    return {
      ...share,
      hasPassword: !!share.security?.password,
    };
  }

  async getMetaData(id: string) {
    const share = await this.prisma.share.findUnique({
      where: { id },
    });

    if (!share || !share.uploadLocked)
      throw new NotFoundException("Share not found");

    return share;
  }

  async getShares() {
    const shares = await this.prisma.share.findMany({
      orderBy: {
        expiration: "desc",
      },
      include: { files: true, creator: true },
    });

    return shares.map((share) => {
      return {
        ...share,
        size: share.files.reduce((acc, file) => acc + parseInt(file.size), 0),
      };
    });
  }

  async getSharesByUser(userId: string) {
    const shares = await this.prisma.share.findMany({
      where: {
        creator: { id: userId },
        uploadLocked: true,
        OR: [
          { expiration: { gt: new Date() } },
          { expiration: { equals: moment(0).toDate() } },
        ],
      },
      orderBy: {
        expiration: "desc",
      },
      include: { recipients: true, files: true, security: true },
    });

    return shares.map((share) => {
      return {
        ...share,
        size: share.files.reduce((acc, file) => acc + parseInt(file.size), 0),
        recipients: share.recipients.map((recipients) => recipients.email),
        security: {
          maxViews: share.security?.maxViews,
          passwordProtected: !!share.security?.password,
        },
      };
    });
  }

  async increaseViewCount(share: Share) {
    await this.prisma.share.update({
      where: { id: share.id },
      data: { views: share.views + 1 },
    });
  }

  async getShareToken(shareId: string, password: string) {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      include: {
        security: true,
      },
    });

    if (!share) throw new NotFoundException("Share not found");

    if (share.security?.password) {
      if (!password) {
        throw new ForbiddenException(
          "This share is password protected",
          "share_password_required",
        );
      }

      const isPasswordValid = await argon.verify(
        share.security.password,
        password,
      );
      if (!isPasswordValid) {
        throw new ForbiddenException("Wrong password", "wrong_password");
      }
    }

    if (share.security?.maxViews && share.security.maxViews <= share.views) {
      throw new ForbiddenException(
        "Maximum views exceeded",
        "share_max_views_exceeded",
      );
    }

    const token = await this.generateShareToken(shareId);
    await this.increaseViewCount(share);
    return token;
  }

  async generateShareToken(shareId: string) {
    const row = await this.prisma.share.findUnique({
      where: { id: shareId },
    });
    if (!row) throw new NotFoundException("Share not found");

    const { expiration, createdAt } = row;

    const tokenPayload = {
      shareId,
      shareCreatedAt: moment(createdAt).unix(),
      iat: moment().unix(),
    };

    const tokenOptions = {
      secret: this.configService.get("internal.jwtSecret"),
    };

    if (!moment(expiration).isSame(0)) {
      tokenOptions["expiresIn"] = moment(expiration).diff(
        new Date(),
        "seconds",
      );
    }

    return this.jwtService.sign(tokenPayload, tokenOptions);
  }

  async verifyShareToken(shareId: string, token: string) {
    const row = await this.prisma.share.findUnique({
      where: { id: shareId },
    });
    if (!row) return false;

    const { expiration, createdAt } = row;

    try {
      const claims = this.jwtService.verify(token, {
        secret: this.configService.get("internal.jwtSecret"),
        ignoreExpiration: moment(expiration).isSame(0),
      });

      return (
        claims.shareId == shareId &&
        claims.shareCreatedAt == moment(createdAt).unix()
      );
    } catch {
      return false;
    }
  }
}
