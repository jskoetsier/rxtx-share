import { Injectable } from "@nestjs/common";
import * as archiver from "archiver";
import * as fs from "fs";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { SHARE_DIRECTORY } from "../constants";

@Injectable()
export class ShareZipService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async createZip(shareId: string): Promise<void> {
    if (this.configService.get("s3.enabled")) return;

    const path = `${SHARE_DIRECTORY}/${shareId}`;

    const files = await this.prisma.file.findMany({ where: { shareId } });
    const archive = archiver("zip", {
      zlib: { level: this.configService.get("share.zipCompressionLevel") },
    });
    const writeStream = fs.createWriteStream(`${path}/archive.zip`);

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => reject(err);
      archive.on("error", onError);
      writeStream.on("error", onError);
      writeStream.on("close", resolve);

      for (const file of files) {
        archive.append(fs.createReadStream(`${path}/${file.id}`), {
          name: file.name,
        });
      }

      archive.pipe(writeStream);
      archive.finalize().catch(onError);
    });
  }
}
