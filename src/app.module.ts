import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SysusersModule } from './sysusers/sysusers.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { FinpayModule } from './finpay/finpay.module';
import { PeruriModule } from './peruri/peruri.module';
import { UploadModule } from './upload/upload.module';
import { MailModule } from './mail/mail.module';
import { ConfigModule } from '@nestjs/config'
import { PdfgenerateModule } from './pdfgenerate/pdfgenerate.module';
import { ApiInvoiceModule } from './api-invoice/api-invoice.module';
import { ReceiptModule } from './receipt/receipt.module';
import { FjiUserModule } from './fji/fji.module';

@Module({
  imports: [SysusersModule, AuthModule, DatabaseModule, FinpayModule, PeruriModule, UploadModule, MailModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PdfgenerateModule,
    ApiInvoiceModule,
    ReceiptModule,
    FjiUserModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
