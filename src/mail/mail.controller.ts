import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFile, Query } from '@nestjs/common';
import { MailService } from './mail.service';
import { CreateMailDto } from './dto/create-mail.dto';
import { UpdateMailDto } from './dto/update-mail.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateMailEventDto } from './dto/create-mail-event.dto';
import { diskStorage } from 'multer';
import * as path from 'path'

@Controller('api/mail')
export class MailController {
  constructor(private readonly mailService: MailService) { }


  @Post('send')
  @UseInterceptors(FileInterceptor('file'))
  async sendEmail(@UploadedFile() file: Express.Multer.File, @Body() body: { to: string; subject: string; text: string; html?: string; cc?: Array<string>, bcc?: Array<string> }) {
    const { to, subject, text, html, cc, bcc } = body;
    const attachments = file
      ? [
        {
          filename: file.originalname,
          path: file.path,
        },
      ]
      : [];

    return await this.mailService.sendEmail(to, subject, text, html, cc, bcc, attachments);
  }

  // @Post('test-checkfile')
  // async checkFile(@Body() data: Record<any, any>) {
  //   return this.mailService.checkFileExists("https://nfsdev.property365.co.id:4422/SIGNED/GQCINV/MANUAL/IN24000538_signed.pdf")
  // }


  @Get('blast-email-inv/:doc_no/:process_id/:sender')
  async blastEmailInv(
    @Param('doc_no') doc_no: string,
    @Param('process_id') process_id: string,
    @Param('sender') sender: string
  ) {
    return this.mailService.blastEmailInv(doc_no, process_id, sender)
  }
  @Get('blast-email-or/:doc_no/:process_id/:sender')
  async blastEmailOr(
    @Param('doc_no') doc_no: string,
    @Param('process_id') process_id: string,
    @Param('sender') sender: string
  ) {
    return this.mailService.blastEmailOr(doc_no, process_id, sender)
  }
  @Get('resend-inv')
  async resendInvoice(
    @Query('doc_no') doc_no: string,
    @Query('process_id') process_id: string,
    @Query('email') email: string,
  ){
    return this.mailService.resendEmailInv(doc_no, process_id, email)
  }
  @Get('resend-or')
  async resendOR(
    @Query('doc_no') doc_no: string,
    @Query('process_id') process_id: string,
    @Query('email') email: string,
  ){
    return this.mailService.resendEmailOr(doc_no, process_id, email)
  }
  @Post('callback-inv')
  async mailersendInvCallback(@Body() data: Record<any, any>){
    return this.mailService.mailerSendCallbackInv(data)
  }
  @Post('callback-or')
  async mailersendOrCallback(@Body() data: Record<any, any>){
    return this.mailService.mailerSendCallbackOr(data)
  }
  @Post('edit-config')
  async editConfig(@Body() data: Record<any, any>) {
    return this.mailService.updateEmailConfig(data)
  }
  @Get('config')
  async getConfig() {
    return this.mailService.getEmailConfig()
  }
  @Post('request-regenerate-invoice')
  async requestRegenerateInvoice(
    @Body() body: Record<any, any>
  ){
    const {doc_no, process_id} = body
    return this.mailService.requestRegenerateInvoice(doc_no, process_id)
  }
  @Post('request-regenerate-receipt')
  async requestRegenerateReceipt(
    @Body() body: Record<any, any>
  ){
    const {doc_no, process_id} = body
    return this.mailService.requestRegenerateReceipt(doc_no, process_id)
  }

}
