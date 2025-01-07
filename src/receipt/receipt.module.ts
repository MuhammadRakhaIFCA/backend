import { Module } from '@nestjs/common';
import { ReceiptService } from './receipt.service';
import { ReceiptController } from './receipt.controller';
import { SqlserverDatabaseModule } from 'src/database/database-sqlserver.module';
import { HttpModule } from '@nestjs/axios';
import { PdfgenerateModule } from 'src/pdfgenerate/pdfgenerate.module';
import { FjiDatabaseModule } from 'src/database/database-fji.module';

@Module({
  imports: [SqlserverDatabaseModule, HttpModule, PdfgenerateModule, FjiDatabaseModule],
  controllers: [ReceiptController],
  providers: [ReceiptService],
})
export class ReceiptModule { }
