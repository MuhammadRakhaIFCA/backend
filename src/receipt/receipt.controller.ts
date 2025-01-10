import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ReceiptService } from './receipt.service';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('api/receipt')
export class ReceiptController {
  constructor(private readonly receiptService: ReceiptService) { }

  @Get('email')
  //@UseGuards(AuthGuard('jwt'))
  async getReceipt() {
    return await this.receiptService.getReceipt()
  }

  @Get('email-detail/:doc_no')
  //@UseGuards(AuthGuard('jwt'))
  async getReceiptDetail(@Param('doc_no') doc_no: string) {
    return this.receiptService.getReceiptDetail(doc_no);
  }
  @Post('email-history')
  // @UseGuards(AuthGuard('jwt'))
  // async getHistory(@Body() data: Record<any, any>) {
  //   return this.receiptService.getHistory(data);
  // }
  @Get('email-history-detail/:email_addr/:doc_no')
  async getHistoryDetail(
    @Param('email_addr') email_addr: string,
    @Param('doc_no') doc_no: string,
  ) {
    return this.receiptService.getHistoryDetail(email_addr, doc_no);
  }

  @Get('stamp/:status')
  //@UseGuards(AuthGuard('jwt'))
  async getStamp(@Param('status') status: string) {
    return this.receiptService.getStamp(status);
  }
  // @Post('stamp')
  // async getStamps(@Body() data: Record<any, any>) {
  //   return this.receiptService.getStamps(data)
  // }
  // @Get('generate/:doc_no')
  // async generateReceipt(@Param('doc_no') doc_no: string) {
  //   return this.receiptService.generateReceipt(doc_no);
  // }
  @Post('stamp-history')
  //@UseGuards(AuthGuard('jwt'))
  async getStampHistory(
    @Body() data: Record<any, any>
  ) {
    return this.receiptService.getStampHistory(data);
  }

  @Post('get')
  async getOR(
    @Body() data: Record<any, any>
  ) {
    return this.receiptService.getOR(data);
  }
  @Get('generate')
  async generateOR(
    @Query('doc_no') doc_no: string,
  ) {
    return this.receiptService.generateOR(doc_no);
  }

  @Post('upload-faktur/:doc_no')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFaktur(
    @UploadedFile() file: Express.Multer.File,
    @Param('doc_no') doc_no: string
  ) {
    const filePath = file.path; //
    const fileName = file.originalname;

    return await this.receiptService.uploadFaktur(filePath, fileName, doc_no);
  }
}
