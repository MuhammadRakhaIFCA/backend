import { Module } from '@nestjs/common';
import { ApiInvoiceService } from './api-invoice.service';
import { ApiInvoiceController } from './api-invoice.controller';
//import { SqlserverDatabaseModule } from 'src/database/database-sqlserver.module';
import { HttpModule } from '@nestjs/axios';
import { PdfgenerateModule } from 'src/pdfgenerate/pdfgenerate.module';
import { FjiDatabaseModule } from 'src/database/database-fji.module';

@Module({
  imports: [HttpModule, PdfgenerateModule, FjiDatabaseModule
    // SqlserverDatabaseModule, 
  ],
  controllers: [ApiInvoiceController],
  providers: [ApiInvoiceService],
})
export class ApiInvoiceModule { }
