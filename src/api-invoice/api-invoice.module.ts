import { Module } from '@nestjs/common';
import { ApiInvoiceService } from './api-invoice.service';
import { ApiInvoiceController } from './api-invoice.controller';
import { SqlserverDatabaseModule } from 'src/database/database-sqlserver.module';
import { HttpModule } from '@nestjs/axios';
import { PdfgenerateModule } from 'src/pdfgenerate/pdfgenerate.module';

@Module({
  imports: [SqlserverDatabaseModule, HttpModule, PdfgenerateModule],
  controllers: [ApiInvoiceController],
  providers: [ApiInvoiceService],
})
export class ApiInvoiceModule { }
