import { Module } from '@nestjs/common';
import { ReceiptService } from './receipt.service';
import { ReceiptController } from './receipt.controller';
import { SqlserverDatabaseModule } from 'src/database/database-sqlserver.module';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from 'src/database/database.module';
import { PdfgenerateModule } from 'src/pdfgenerate/pdfgenerate.module';

@Module({
  imports: [SqlserverDatabaseModule, HttpModule, DatabaseModule, PdfgenerateModule],
  controllers: [ReceiptController],
  providers: [ReceiptService],
})
export class ReceiptModule { }
