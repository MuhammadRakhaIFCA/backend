import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ReceiptService } from './receipt.service';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs'
import * as path from 'path'
import * as moment from 'moment'
import { diskStorage } from 'multer';


@Controller('api')
export class ReceiptController {
  constructor(private readonly receiptService: ReceiptService) { }

  @Get('receipt/email/:audit_user')
  //@UseGuards(AuthGuard('jwt'))
  async getReceipt(
    @Param('audit_user') audit_user: string,
  ) {
    return await this.receiptService.getReceipt(audit_user)
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

  @Get('receipt/stamp/:status/:audit_user')
  //@UseGuards(AuthGuard('jwt'))
  async getStamp(
    @Param('status') status: string,
    @Param('audit_user') audit_user: string
  ) {
    return this.receiptService.getStamp(status, audit_user);
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

  @Delete('delete-faktur/:doc_no')
  async deleteFaktur(
    @Param('doc_no') doc_no: string
  ){
    return await this.receiptService.deleteFaktur(doc_no)
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
    const tempFilePath = `./uploads/FAKTUR/${file_name}`;

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


  //buat approve or
  @Get('receipt-approve')
  async approve(
    @Query('doc_no') doc_no: string,
    @Query('process_id') process_id: string,
    @Query('approval_user') approval_user: string,
    @Query('approval_remarks') approval_remarks: string,
    @Query('approval_status') approval_status: string,
    @Query('approval_level') approval_level: string,
  ) {
    return this.receiptService.approve(doc_no, process_id, approval_user, approval_remarks, approval_status, +approval_level);
  }
  @Get('receipt-reject')
  async reject(
    @Query('doc_no') doc_no: string,
    @Query('process_id') process_id: string,
    @Query('approval_user') approval_user: string,
  ) {
    return this.receiptService.reject(doc_no, process_id, approval_user);
  }

  @Get('receipt/get-approval-user/:approval_user')
  async getApprovalByUser(
    @Param('approval_user') approval_user: string
  ) {
    return this.receiptService.getApprovalByUser(approval_user);
  }
  @Get('receipt/get-approval-history/:approval_user')
  async getApprovalHistory(
    @Param('approval_user') approval_user: string
  ) {
    return this.receiptService.getApprovalHistory(approval_user);
  }
  @Get('receipt/get-approval-dtl/:process_id')
  async getApprovalDtl(
    @Param('process_id') process_id: string
  ) {
    return this.receiptService.getApprovalDtl(process_id);
  }
  @Post('receipt-submit')
  async submitInvoice(@Body() data: Record<any, any>) {
    return this.receiptService.submitOr(data);
  }
  @Get('receipt-approval-list/:audit_user')
  async getInvoiceAppovelList(@Param('audit_user') audit_user: string) {
    return this.receiptService.getApprovalList(audit_user)
  }
  @Get('receipt-inqueries')
  async getInvoiceInqueries() {
    return this.receiptService.receiptInqueries()
  }
  @Post('upload-extra-file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadFolder = path.join(__dirname, '../../', process.env.ROOT_PDF_FOLDER, 'extraFiles');
          if (!fs.existsSync(uploadFolder)) {
            fs.mkdirSync(uploadFolder, { recursive: true });
          }
          cb(null, uploadFolder);
        },
        filename: (req, file, cb) => {
          const timestamp = moment().format('YYYYMMDDHHmm');
          const newFileName = `${timestamp}_${file.originalname}`;
          cb(null, newFileName);
          },
        }),
      }),
    )
  async uploadExtraFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<any, any>,
  ) {
    const rootFolder = path.resolve(
      __dirname,
      '..',
      '..',
      process.env.ROOT_PDF_FOLDER,
    )
    if (!fs.existsSync(`${rootFolder}/extraFiles`)) {
      fs.mkdirSync(`${rootFolder}/extraFiles`, { recursive: true });
    }
    const { doc_no, process_id, file_type } = body;
    const fileName = file.filename;
    const filePath = file.path;

    return this.receiptService.uploadExtraFile(fileName, filePath, doc_no, process_id, file_type);
  }

  @Delete('delete-extra-file/:file_type')
  async deleteExtraFile(
    @Param('file_type') file_type: string,
    @Query('doc_no') doc_no: string,
    @Query('file_name') file_name: string,
  ){
    return await this.receiptService.deleteExtraFile(file_type, doc_no, file_name)
  }
}
