import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ClamScanModule } from "src/clamscan/clamscan.module";
import { EmailModule } from "src/email/email.module";
import { FileModule } from "src/file/file.module";
import { ReverseShareModule } from "src/reverseShare/reverseShare.module";
import { ShareController } from "./share.controller";
import { ShareService } from "./share.service";
import { ShareAccessService } from "./shareAccess.service";
import { ShareCreationService } from "./shareCreation.service";
import { ShareNotificationService } from "./shareNotification.service";
import { ShareZipService } from "./shareZip.service";

@Module({
  imports: [
    JwtModule.register({}),
    EmailModule,
    ClamScanModule,
    ReverseShareModule,
    FileModule,
  ],
  controllers: [ShareController],
  providers: [
    ShareService,
    ShareAccessService,
    ShareCreationService,
    ShareNotificationService,
    ShareZipService,
  ],
  exports: [ShareService, ShareAccessService, ShareCreationService],
})
export class ShareModule {}
