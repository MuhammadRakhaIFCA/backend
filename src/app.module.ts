import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PeruriModule } from './peruri/peruri.module';
import { UploadModule } from './upload/upload.module';
import { MailModule } from './mail/mail.module';
import { ConfigModule } from '@nestjs/config'
import { PdfgenerateModule } from './pdfgenerate/pdfgenerate.module';
import { ApiInvoiceModule } from './api-invoice/api-invoice.module';
import { ReceiptModule } from './receipt/receipt.module';
import { FjiUserModule } from './fji/fji.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [PeruriModule, UploadModule, MailModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PdfgenerateModule,
    ApiInvoiceModule,
    ReceiptModule,
    FjiUserModule,
    AuthModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
