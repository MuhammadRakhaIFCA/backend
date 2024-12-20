import { Module } from '@nestjs/common';
import { FinpayService } from './finpay.service';
import { FinpayController } from './finpay.controller';
import { HttpModule } from '@nestjs/axios'
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [HttpModule, DatabaseModule],
  controllers: [FinpayController],
  providers: [FinpayService],
})
export class FinpayModule { }
