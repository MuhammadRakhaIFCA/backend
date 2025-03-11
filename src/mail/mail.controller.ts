import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFile, Query } from '@nestjs/common';
import { MailService } from './mail.service';
import { CreateMailDto } from './dto/create-mail.dto';
import { UpdateMailDto } from './dto/update-mail.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateMailEventDto } from './dto/create-mail-event.dto';

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


  @Get('blast-email-inv/:doc_no')
  async blastEmailInv(@Param('doc_no') doc_no: string) {
    return this.mailService.blastEmailInv(doc_no)
  }
  @Get('blast-email-or/:doc_no')
  async blastEmailOr(@Param('doc_no') doc_no: string) {
    return this.mailService.blastEmailOr(doc_no)
  }
  @Get('resend-inv')
  async resendInvoice(
    @Query('doc_no') doc_no: string,
    @Query('email') email: string,
  ){
    return this.mailService.resendEmailInv(doc_no, email)
  }
  @Get('resend-or')
  async resendOR(
    @Query('doc_no') doc_no: string,
    @Query('email') email: string,
  ){
    return this.mailService.resendEmailOr(doc_no, email)
  }
  @Post('edit-config')
  async editConfig(@Body() data: Record<any, any>) {
    return this.mailService.updateEmailConfig(data)
  }
  @Get('config')
  async getConfig() {
    return this.mailService.getEmailConfig()
  }
}
