import { Module } from '@nestjs/common';
import { PdfgenerateService } from './pdfgenerate.service';
import { PdfgenerateController } from './pdfgenerate.controller';
import { FjiDatabaseModule } from 'src/database/database-fji.module';

@Module({
  imports: [FjiDatabaseModule],
  controllers: [PdfgenerateController],
  providers: [PdfgenerateService],
  exports: [PdfgenerateService]
})
export class PdfgenerateModule { }
