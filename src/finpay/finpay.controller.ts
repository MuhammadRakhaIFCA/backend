import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FinpayService } from './finpay.service';
import { PaymentDto } from './dto/payment.dto';
import { NotificationCallbackDto } from './dto/notification-callback.dto';

@Controller('finpay')
export class FinpayController {
  constructor(private readonly finpayService: FinpayService) { }

  @Get('')
  async initiate() {
    return await this.finpayService.initiate()
  }

  @Get(':orderId')
  async getStatus(@Param('orderId') orderId: string) {
    return await this.finpayService.checkStatus(orderId)
  }
  @Post('')
  async pay(@Body() dto: PaymentDto) {
    return await this.finpayService.pay(dto)
  }

  @Post('notification')
  async notificationCallback(@Body() dto: NotificationCallbackDto) {
    return await this.finpayService.notificationCallback(dto)
  }


}
