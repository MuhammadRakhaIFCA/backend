import { Module } from '@nestjs/common';
import { PdfgenerateService } from './pdfgenerate.service';
import { PdfgenerateController } from './pdfgenerate.controller';
import { SqlserverDatabaseModule } from 'src/database/database-sqlserver.module';

@Module({
  imports: [SqlserverDatabaseModule],
  controllers: [PdfgenerateController],
  providers: [PdfgenerateService],
  exports: [PdfgenerateService]
})
export class PdfgenerateModule { }
