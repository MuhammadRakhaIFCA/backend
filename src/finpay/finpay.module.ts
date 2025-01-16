import { Module } from '@nestjs/common';
import { FinpayService } from './finpay.service';
import { FinpayController } from './finpay.controller';
import { FjiDatabaseModule } from 'src/database/database-fji.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [FjiDatabaseModule, HttpModule],
  controllers: [FinpayController],
  providers: [FinpayService],
})
export class FinpayModule { }
