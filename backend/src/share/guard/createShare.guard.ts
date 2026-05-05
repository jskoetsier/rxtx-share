import { ExecutionContext, Injectable } from "@nestjs/common";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class CreateShareGuard extends JwtGuard {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super(configService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (await super.canActivate(context)) return true;

    const reverseShareTokenId = context.switchToHttp().getRequest()
      .cookies.reverse_share_token;

    if (!reverseShareTokenId) return false;

    const reverseShare = await this.prisma.reverseShare.findUnique({
      where: { token: reverseShareTokenId },
    });

    if (!reverseShare) return false;

    const isExpired = new Date() > reverseShare.shareExpiration;
    const remainingUsesExceeded = reverseShare.remainingUses <= 0;

    return !(isExpired || remainingUsesExceeded);
  }
}
