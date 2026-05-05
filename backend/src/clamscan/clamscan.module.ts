import { Module } from "@nestjs/common";
import { FileModule } from "src/file/file.module";
import { ClamScanService } from "./clamscan.service";

@Module({
  imports: [FileModule],
  providers: [ClamScanService],
  exports: [ClamScanService],
})
export class ClamScanModule {}
