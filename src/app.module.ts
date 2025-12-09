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
import { FinpayModule } from './finpay/finpay.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrintDocumentModule } from './print-document/print-document.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [PeruriModule, UploadModule, MailModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PdfgenerateModule,
    ApiInvoiceModule,
    ReceiptModule,
    FjiUserModule,
    AuthModule,
    FinpayModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'), // Serve files from 'uploads' directory
      serveRoot: '/uploads', // Serve files at '/uploads' route
    }),
    PrintDocumentModule,
    WhatsappModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
