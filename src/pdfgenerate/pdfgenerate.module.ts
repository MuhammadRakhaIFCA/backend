import { Module } from '@nestjs/common';
import { PdfgenerateService } from './pdfgenerate.service';
import { PdfgenerateController } from './pdfgenerate.controller';
import { SqlserverDatabaseModule } from 'src/database/database-sqlserver.module';
import { FjiDatabaseModule } from 'src/database/database-fji.module';

@Module({
  imports: [SqlserverDatabaseModule, FjiDatabaseModule],
  controllers: [PdfgenerateController],
  providers: [PdfgenerateService],
  exports: [PdfgenerateService]
})
export class PdfgenerateModule { }
