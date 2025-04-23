import { BadRequestException, Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiInvoiceService } from './api-invoice.service';
import { AuthGuard } from '@nestjs/passport';
import { generateDto } from './dto/generate.dto';
import { Response } from 'express';

@Controller('api')
export class ApiInvoiceController {
  constructor(private readonly apiInvoiceService: ApiInvoiceService) { }

  @Get('invoice/stamp/:status/:audit_user')
  async getStamp(
    @Param('status') status: string,
    @Param('audit_user') audit_user: string
  ) {
    return this.apiInvoiceService.getStamp(status, audit_user)
  }

  @Post('invoice/stamp-history')
  async getStampHistory(
    @Body() data: Record<any, any>
  ) {
    return this.apiInvoiceService.getStampHistory(data)
  }

  @Get('invoice/email/:audit_user')
  //@UseGuards(AuthGuard('jwt'))
  async getInvoice(@Param('audit_user') audit_user: string) {
    return this.apiInvoiceService.getInvoice(audit_user);
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
    @Query('related_class') related_class: string,
    @Query('read_date') read_date: string,
  ) {
    return this.apiInvoiceService.generateSchedule(doc_no, bill_type, meter_type, name, related_class, read_date);
  }
  @Get('invoice-approve')
  async approve(
    @Query('doc_no') doc_no: string,
    @Query('process_id') process_id: string,
    @Query('approval_user') approval_user: string,
    @Query('approval_remarks') approval_remarks: string,
    @Query('approval_status') approval_status: string,
    @Query('approval_level') approval_level: string,
  ) {
    return this.apiInvoiceService.approve(doc_no, process_id, approval_user, approval_remarks, approval_status, +approval_level);
  }
  @Get('invoice-reject')
  async reject(
    @Query('doc_no') doc_no: string,
    @Query('process_id') process_id: string,
    @Query('approval_user') approval_user: string,
  ) {
    return this.apiInvoiceService.reject(doc_no, process_id, approval_user);
  }
  @Get('invoice-manual-generate')
  async generateManual(
    @Query('doc_no') doc_no: string,
    @Query('related_class') related_class: string,
    @Query('name') name: string,
  ) {
    return this.apiInvoiceService.generateManual(doc_no, name, related_class);
  }
  @Get('invoice-proforma-generate')
  async generateProforma(
    @Query('doc_no') doc_no: string,
    @Query('related_class') related_class: string,
    @Query('name') name: string,
  ) {
    return this.apiInvoiceService.generateProforma(doc_no, name, related_class);
  }
  @Get('get-approval/:process_id')
  async getApproval(
    @Param('process_id') process_id: string
  ) {
    return this.apiInvoiceService.getApproval(process_id);
  }
  @Get('get-approval-user/:approval_user')
  async getApprovalByUser(
    @Param('approval_user') approval_user: string
  ) {
    return this.apiInvoiceService.getApprovalByUser(approval_user);
  }
  @Get('get-approval-history/:approval_user')
  async getApprovalHistory(
    @Param('approval_user') approval_user: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.apiInvoiceService.getApprovalHistory(approval_user, startDate, endDate);
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

  @Get('download')
  async downloadPdfsAsZip(
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
  ) {
    return await this.apiInvoiceService.downloadStampedInvoice(start_date, end_date)
  }
  @Get('download-or')
  async downloadOrPdfsAsZip(
    @Query('start_date') start_date: string,
    @Query('end_date') end_date: string,
  ) {
    return await this.apiInvoiceService.downloadStampedOr(start_date, end_date)
  }

  @Post('invoice-submit')
  async submitInvoice(@Body() data: Record<any, any>) {
    return this.apiInvoiceService.submitInvoice(data);
  }

  @Delete('invoice-delete/:doc_no/:process_id')
  async deleteInvoice(@Param('doc_no') doc_no: string, @Param('process_id') process_id: string) {
    return this.apiInvoiceService.deleteInvoice(doc_no, process_id)
  }
  @Get('invoice-approval-list/:audit_user')
  async getInvoiceAppovelList(@Param('audit_user') audit_user: string) {
    return this.apiInvoiceService.getApprovalList(audit_user)
  }

  @Post('invoice/blast-cancel')
  async cancelApprovedInvoice(@Body() data:Record<any,any>){
    const {doc_no, process_id} = data
    return this.apiInvoiceService.cancelApprovedInvoice(doc_no, process_id)
  }


  @Get('invoice-inqueries')
  async getInvoiceInqueries() {
    return this.apiInvoiceService.invoiceInqueries()
  }
}
