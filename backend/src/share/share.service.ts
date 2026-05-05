import { Injectable } from "@nestjs/common";
import { Share, User } from "@prisma/client";
import { CreateShareDTO } from "./dto/createShare.dto";
import { ShareAccessService } from "./shareAccess.service";
import { ShareCreationService } from "./shareCreation.service";

@Injectable()
export class ShareService {
  constructor(
    private shareAccessService: ShareAccessService,
    private shareCreationService: ShareCreationService,
  ) {}

  async create(share: CreateShareDTO, user?: User, reverseShareToken?: string) {
    return this.shareCreationService.create(share, user, reverseShareToken);
  }

  async complete(id: string, reverseShareToken?: string) {
    return this.shareCreationService.complete(id, reverseShareToken);
  }

  async revertComplete(id: string) {
    return this.shareCreationService.revertComplete(id);
  }

  async getShares() {
    return this.shareAccessService.getShares();
  }

  async getSharesByUser(userId: string) {
    return this.shareAccessService.getSharesByUser(userId);
  }

  async get(id: string) {
    return this.shareAccessService.get(id);
  }

  async getMetaData(id: string) {
    return this.shareAccessService.getMetaData(id);
  }

  async removeOwnShare(shareId: string) {
    return this.shareCreationService.removeOwnShare(shareId);
  }

  async removeShareAsAdmin(shareId: string) {
    return this.shareCreationService.removeShareAsAdmin(shareId);
  }

  async isShareCompleted(id: string) {
    return this.shareCreationService.isShareCompleted(id);
  }

  async isShareIdAvailable(id: string) {
    return this.shareCreationService.isShareIdAvailable(id);
  }

  async increaseViewCount(share: Share) {
    return this.shareAccessService.increaseViewCount(share);
  }

  async getShareToken(shareId: string, password: string) {
    return this.shareAccessService.getShareToken(shareId, password);
  }

  async generateShareToken(shareId: string) {
    return this.shareAccessService.generateShareToken(shareId);
  }

  async verifyShareToken(shareId: string, token: string) {
    return this.shareAccessService.verifyShareToken(shareId, token);
  }
}
