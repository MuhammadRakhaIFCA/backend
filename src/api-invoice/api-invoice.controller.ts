import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiInvoiceService } from './api-invoice.service';
import { AuthGuard } from '@nestjs/passport';
import { generateDto } from './dto/generate.dto';

@Controller('api')
export class ApiInvoiceController {
  constructor(private readonly apiInvoiceService: ApiInvoiceService) { }

  @Get('invoice/email')
  //@UseGuards(AuthGuard('jwt'))
  async getInvoice() {
    return this.apiInvoiceService.getInvoice();
  }
  @Get('invoice/email-detail/:doc_no')
  //@UseGuards(AuthGuard('jwt'))
  async getInvoiceDetail(@Param('doc_no') doc_no: string) {
    return this.apiInvoiceService.getInvoiceDetail(doc_no);
  }
  @Post('invoice/email-history')
  //@UseGuards(AuthGuard('jwt'))
  async getHistory(@Body() data: Record<any, any>) {
    return this.apiInvoiceService.getHistory(data);
  }
  @Get('invoice/email-history-detail/:email_addr/:doc_no')
  //@UseGuards(AuthGuard('jwt'))
  async getHistoryDetail(
    @Param('email_addr') emailAddr: string,
    @Param('doc_no') docNo: string
  ) {
    return this.apiInvoiceService.getHistoryDetail(emailAddr, docNo);
  }

  @Post('invoice-schedule')
  async getScheduleInvoiceData(
    @Body() data: generateDto
  ) {
    return this.apiInvoiceService.getSchedule(data);
  }
  @Post('invoice-manual')
  async getManualInvoiceData(
    @Body() data: generateDto
  ) {
    return this.apiInvoiceService.getManual(data);
  }
  @Post('invoice-proforma')
  async getProformaInvoiceData(
    @Body() data: generateDto
  ) {
    return this.apiInvoiceService.getProforma(data);
  }
  // @Get('invoice-proforma')
  // async getProformaInvoiceData(
  //   @Query('startDate') startDate: string,
  //   @Query('endDate') endDate: string
  // ) {
  //   const data: generateDto = { startDate, endDate }; 
  //   return this.apiInvoiceService.getProforma(data);
  // }

  @Get('invoice-schedule-generate')
  async generateSchedule(
    @Query('doc_no') doc_no: string,
    @Query('bill_type') bill_type: string,
    @Query('meter_type') meter_type: string,
    @Query('doc_amt') doc_amt: string,
  ) {
    return this.apiInvoiceService.generateSchedule(doc_no, bill_type, meter_type);
  }
  @Get('invoice-manual-generate/:doc_no')
  async generateManual(
    @Param('doc_no') doc_no: string
  ) {
    return this.apiInvoiceService.generateManual(doc_no);
  }
  @Get('invoice-proforma-generate/:doc_no')
  async generateProforma(
    @Body('doc_no') doc_no: string
  ) {
    return this.apiInvoiceService.generateProforma(doc_no);
  }
}
