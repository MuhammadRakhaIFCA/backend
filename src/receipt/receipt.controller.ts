import { BadRequestException, Body, Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ReceiptService } from './receipt.service';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs'

@Controller('api')
export class ReceiptController {
  constructor(private readonly receiptService: ReceiptService) { }

  @Get('receipt/email')
  //@UseGuards(AuthGuard('jwt'))
  async getReceipt() {
    return await this.receiptService.getReceipt()
  }

  @Get('receipt/email-detail/:doc_no')
  //@UseGuards(AuthGuard('jwt'))
  async getReceiptDetail(@Param('doc_no') doc_no: string) {
    return this.receiptService.getReceiptDetail(doc_no);
  }
  @Post('receipt/email-history')
  // @UseGuards(AuthGuard('jwt'))
  async getHistory(@Body() data: Record<any, any>) {
    return this.receiptService.getHistory(data);
  }
  @Get('receipt/email-history-detail/:email_addr/:doc_no')
  async getHistoryDetail(
    @Param('email_addr') email_addr: string,
    @Param('doc_no') doc_no: string,
  ) {
    return this.receiptService.getHistoryDetail(email_addr, doc_no);
  }

  @Get('receipt/stamp/:status')
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
  @Post('receipt/stamp-history')
  //@UseGuards(AuthGuard('jwt'))
  async getStampHistory(
    @Body() data: Record<any, any>
  ) {
    return this.receiptService.getStampHistory(data);
  }

  @Post('receipt/get')
  async getOR(
    @Body() data: Record<any, any>
  ) {
    return this.receiptService.getOR(data);
  }
  @Get('receipt/generate')
  async generateOR(
    @Query('doc_no') doc_no: string,
    @Query('audit_user') audit_user: string,
  ) {
    return this.receiptService.generateOR(doc_no, audit_user);
  }

  @Post('upload-faktur/:doc_no')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFaktur(
    @UploadedFile() file: Express.Multer.File,
    @Param('doc_no') doc_no: string
  ) {
    const filePath = `${file.path}`;
    // const filePath = `${file.path}FAKTUR`; 
    const fileName = file.originalname;
    console.log("path : " + file.path)
    console.log(fileName)
    console.log("doc no : " + doc_no)

    return await this.receiptService.uploadFaktur(filePath, fileName, doc_no);
  }

  @Post('upload-faktur-base64/:doc_no')
  async uploadFakturBase64(
    @Body() body: { base64: string; file_name: string },
    @Param('doc_no') doc_no: string
  ) {
    const { base64, file_name } = body;

    // Decode the base64 string into a buffer
    const fileBuffer = Buffer.from(base64, 'base64');

    // Define a temporary file path to save the decoded file
    const tempFilePath = `D:/FAKTUR/${file_name}`;

    // Save the buffer to a temporary file
    await fs.promises.writeFile(tempFilePath, fileBuffer);

    try {
      return await this.receiptService.uploadFaktur(tempFilePath, file_name, doc_no);
    } catch (error) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Failed to process the base64 file',
        data: [error],
      });
    }
  }

}
