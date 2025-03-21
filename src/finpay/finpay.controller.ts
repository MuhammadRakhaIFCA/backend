import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FinpayService } from './finpay.service';
import { PaymentDto } from './dto/payment.dto';
import { NotificationCallbackDto } from './dto/notification-callback.dto';

@Controller('api/finpay')
export class FinpayController {
  constructor(private readonly finpayService: FinpayService) { }

  @Post('initiate-pay')
  async pay(@Body() dto: PaymentDto) {
    return await this.finpayService.initiatePay(dto)
  }

  @Post('notification')
  async notificationCallback(@Body() dto: NotificationCallbackDto) {
    return await this.finpayService.notificationCallback(dto)
  }

  @Get('get-transaction/:type_topup')
  async getTransaction(
    @Param('type_topup') type_topup: string
  ) {
    return await this.finpayService.getTransaction(type_topup)
  }
}
