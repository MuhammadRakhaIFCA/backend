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
    @Query('name') name: string,
  ) {
    return this.apiInvoiceService.generateSchedule(doc_no, bill_type, meter_type, name);
  }
  @Get('invoice-approve')
  async approve(
    @Query('doc_no') doc_no: string,
    @Query('process_id') process_id: string,
    @Query('approval_user') approval_user: string,
  ) {
    return this.apiInvoiceService.approve(doc_no, process_id, approval_user);
  }
  @Get('invoice-manual-generate')
  async generateManual(
    @Query('doc_no') doc_no: string,
  ) {
    return this.apiInvoiceService.generateManual(doc_no);
  }
  // @Get('invoice-manual-generate/:doc_no')
  // async generateManual(
  //   @Param('doc_no') doc_no: string
  // ) {
  //   return this.apiInvoiceService.generateManualUnused(doc_no);
  // }
  @Get('invoice-proforma-generate')
  async generateProforma(
    @Query('doc_no') doc_no: string
  ) {
    return this.apiInvoiceService.generateProforma(doc_no);
  }
  @Get('get-approval/:process_id')
  async getApproval(
    @Param('process_id') process_id: string
  ) {
    return this.apiInvoiceService.getApproval(process_id);
  }
  @Get('get-approval-dtl/:process_id')
  async getApprovalDtl(
    @Param('process_id') process_id: string
  ) {
    return this.apiInvoiceService.getApprovalDtl(process_id);
  }
  @Get('get-approval-log/:process_id')
  async getApprovalLog(
    @Param('process_id') process_id: string
  ) {
    return this.apiInvoiceService.getApprovalLog(process_id);
  }
}
