import { Module } from "@nestjs/common";
import { FileModule } from "src/file/file.module";
import { ReverseShareController } from "./reverseShare.controller";
import { ReverseShareService } from "./reverseShare.service";

@Module({
  imports: [FileModule],
  controllers: [ReverseShareController],
  providers: [ReverseShareService],
  exports: [ReverseShareService],
})
export class ReverseShareModule {}
