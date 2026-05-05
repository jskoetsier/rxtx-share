import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { User } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import * as argon from "argon2";
import { Request, Response } from "express";
import * as moment from "moment";
import { ConfigService } from "src/config/config.service";
import { EmailService } from "src/email/email.service";
import { PrismaService } from "src/prisma/prisma.service";
import { GenericOidcProvider } from "../oauth/provider/genericOidc.provider";
import { OAuthProvider } from "../oauth/provider/oauthProvider.interface";
import { UserService } from "../user/user.service";
import { TokenService } from "./token.service";

const PASSWORD_RESET_TOKEN_LIFETIME_HOURS = 1;

import { AuthRegisterDTO } from "./dto/authRegister.dto";
import { AuthSignInDTO } from "./dto/authSignIn.dto";
import { LdapService } from "./ldap.service";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
    private ldapService: LdapService,
    private userService: UserService,
    private tokenService: TokenService,
    @Inject("OAUTH_PROVIDERS")
    private oAuthProviders: Record<string, OAuthProvider<unknown>>,
  ) {}
  private readonly logger = new Logger(AuthService.name);

  async signUp(dto: AuthRegisterDTO, ip: string) {
    const isFirstUser = (await this.prisma.user.count()) == 0;
    return this.createUser(dto, ip, isFirstUser);
  }

  private async createUser(dto: AuthRegisterDTO, ip: string, isAdmin: boolean) {
    const hash = dto.password ? await argon.hash(dto.password) : null;
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          username: dto.username,
          password: hash,
          isAdmin,
        },
      });

      const { refreshToken, refreshTokenId } =
        await this.tokenService.createRefreshToken(user.id);
      const accessToken = await this.tokenService.createAccessToken(
        user,
        refreshTokenId,
      );

      this.logger.log(`User ${user.email} signed up from IP ${ip}`);
      return { accessToken, refreshToken, user };
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError) {
        if (e.code == "P2002") {
          const duplicatedField: string = e.meta.target[0];
          throw new BadRequestException(
            `A user with this ${duplicatedField} already exists`,
          );
        }
      }
      throw e;
    }
  }

  async signIn(dto: AuthSignInDTO, ip: string) {
    if (!dto.email && !dto.username) {
      throw new BadRequestException("Email or username is required");
    }

    if (!this.config.get("oauth.disablePassword")) {
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [{ email: dto.email }, { username: dto.username }],
        },
      });

      if (user?.password && (await argon.verify(user.password, dto.password))) {
        this.logger.log(
          `Successful password login for user ${user.email} from IP ${ip}`,
        );
        return this.tokenService.generateToken(user);
      }
    }

    if (this.config.get("ldap.enabled")) {
      /*
       * E-mail-like user credentials are passed as the email property
       * instead of the username. Since the username format does not matter
       * when searching for users in LDAP, we simply use the username
       * in whatever format it is provided.
       */
      const ldapUsername = dto.username || dto.email;
      this.logger.debug(`Trying LDAP login for user ${ldapUsername}`);
      const ldapUser = await this.ldapService.authenticateUser(
        ldapUsername,
        dto.password,
      );
      if (ldapUser) {
        const user = await this.userService.findOrCreateFromLDAP(dto, ldapUser);
        this.logger.log(
          `Successful LDAP login for user ${ldapUsername} (${user.id}) from IP ${ip}`,
        );
        return this.tokenService.generateToken(user);
      }
    }

    this.logger.log(
      `Failed login attempt for user ${dto.email || dto.username} from IP ${ip}`,
    );
    throw new UnauthorizedException("Wrong email or password");
  }

  async requestResetPassword(email: string) {
    if (this.config.get("oauth.disablePassword"))
      throw new ForbiddenException("Password sign in is disabled");

    const user = await this.prisma.user.findFirst({
      where: { email },
      include: { resetPasswordToken: true },
    });

    if (!user) return;

    if (user.ldapDN) {
      this.logger.log(
        `Failed password reset request for user ${email} because it is an LDAP user`,
      );
      throw new BadRequestException(
        "This account can't reset its password here. Please contact your administrator.",
      );
    }

    // Delete old reset password token
    if (user.resetPasswordToken) {
      await this.prisma.resetPasswordToken.delete({
        where: { token: user.resetPasswordToken.token },
      });
    }

    const { token } = await this.prisma.resetPasswordToken.create({
      data: {
        expiresAt: moment()
          .add(PASSWORD_RESET_TOKEN_LIFETIME_HOURS, "hour")
          .toDate(),
        user: { connect: { id: user.id } },
      },
    });

    this.emailService.sendResetPasswordEmail(user.email, token);
  }

  async resetPassword(token: string, newPassword: string) {
    if (this.config.get("oauth.disablePassword"))
      throw new ForbiddenException("Password sign in is disabled");

    const user = await this.prisma.user.findFirst({
      where: { resetPasswordToken: { token } },
    });

    if (!user) throw new BadRequestException("Token invalid or expired");

    const newPasswordHash = await argon.hash(newPassword);

    await this.prisma.resetPasswordToken.delete({
      where: { token },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: newPasswordHash },
    });
  }

  async updatePassword(user: User, oldPassword: string, newPassword: string) {
    const isPasswordValid =
      !user.password || (await argon.verify(user.password, oldPassword));

    if (!isPasswordValid) throw new ForbiddenException("Invalid password");

    return this.forceUpdatePassword(user, newPassword);
  }

  async forceUpdatePassword(user: User, newPassword: string) {
    const hash = await argon.hash(newPassword);

    await this.prisma.refreshToken.deleteMany({
      where: { userId: user.id },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hash },
    });

    return this.tokenService.createRefreshToken(user.id);
  }

  async signOut(accessToken: string) {
    const { refreshTokenId } =
      (this.jwtService.decode(accessToken) as {
        refreshTokenId: string;
      }) || {};

    if (refreshTokenId) {
      let oauthIDToken: string | undefined;
      try {
        const refreshToken = await this.prisma.refreshToken.findFirst({
          select: { oauthIDToken: true },
          where: { id: refreshTokenId },
        });
        oauthIDToken = refreshToken?.oauthIDToken;
      } catch (e) {
        if (e.code != "P2025") throw e;
      }
      try {
        await this.prisma.refreshToken.delete({
          where: { id: refreshTokenId },
        });
      } catch (e) {
        if (e.code != "P2025") throw e;
      }

      if (typeof oauthIDToken === "string") {
        const [providerName, idTokenHint] = oauthIDToken.split(":");
        const provider = this.oAuthProviders[providerName];
        let signOutFromProviderSupportedAndActivated = false;
        try {
          signOutFromProviderSupportedAndActivated = this.config.get(
            `oauth.${providerName}-signOut`,
          ) as boolean;
        } catch (_) {
          // Ignore error if the provider is not supported or if the provider sign out is not activated
        }
        if (
          provider instanceof GenericOidcProvider &&
          signOutFromProviderSupportedAndActivated
        ) {
          const configuration = await provider.getConfiguration();
          if (URL.canParse(configuration.end_session_endpoint)) {
            const redirectURI = new URL(configuration.end_session_endpoint);
            redirectURI.searchParams.append(
              "post_logout_redirect_uri",
              this.config.get("general.appUrl"),
            );
            redirectURI.searchParams.append("id_token_hint", idTokenHint);
            redirectURI.searchParams.append(
              "client_id",
              this.config.get(`oauth.${providerName}-clientId`) as string,
            );
            return redirectURI.toString();
          }
        }
      }
    }
  }

  async refreshAccessToken(refreshToken: string) {
    const refreshTokenMetaData = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!refreshTokenMetaData || refreshTokenMetaData.expiresAt < new Date())
      throw new UnauthorizedException();

    return this.tokenService.createAccessToken(
      refreshTokenMetaData.user,
      refreshTokenMetaData.id,
    );
  }

  addTokensToResponse(
    response: Response,
    refreshToken?: string,
    accessToken?: string,
  ) {
    this.tokenService.addTokensToResponse(response, refreshToken, accessToken);
  }

  async getIdOfCurrentUser(request: Request): Promise<string | null> {
    return this.tokenService.getIdOfCurrentUser(request);
  }

  async verifyPassword(user: User, password: string) {
    if (!user.password && this.config.get("ldap.enabled")) {
      return !!this.ldapService.authenticateUser(user.username, password);
    }

    return argon.verify(user.password, password);
  }
}
