import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import * as moment from "moment";
import { PrismaService } from "src/prisma/prisma.service";
import { ShareSecurityGuard } from "src/share/guard/shareSecurity.guard";
import { ConfigService } from "src/config/config.service";

@Injectable()
export class FileSecurityGuard extends ShareSecurityGuard {
  constructor(
    jwtService: JwtService,
    private _prisma: PrismaService,
    configService: ConfigService,
  ) {
    super(jwtService, _prisma, configService);
  }

  async canActivate(context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();

    const shareId = Object.prototype.hasOwnProperty.call(
      request.params,
      "shareId",
    )
      ? request.params.shareId
      : request.params.id;

    const shareToken = request.cookies[`share_${shareId}_token`];

    const share = await this._prisma.share.findUnique({
      where: { id: shareId },
      include: { security: true },
    });

    // If there is no share token the user requests a file directly
    if (!shareToken) {
      if (
        !share ||
        (moment().isAfter(share.expiration) &&
          !moment(share.expiration).isSame(0))
      ) {
        throw new NotFoundException("File not found");
      }

      if (share.security?.password)
        throw new ForbiddenException("This share is password protected");

      if (share.security?.maxViews && share.security.maxViews <= share.views) {
        throw new ForbiddenException(
          "Maximum views exceeded",
          "share_max_views_exceeded",
        );
      }

      await this._prisma.share.update({
        where: { id: share.id },
        data: { views: { increment: 1 } },
      });
      return true;
    } else {
      return super.canActivate(context);
    }
  }
}
