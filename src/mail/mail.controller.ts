import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFile } from '@nestjs/common';
import { MailService } from './mail.service';
import { CreateMailDto } from './dto/create-mail.dto';
import { UpdateMailDto } from './dto/update-mail.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateMailEventDto } from './dto/create-mail-event.dto';

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) { }

  @Post('')
  @UseInterceptors(FileInterceptor('file'))
  async sendMail(@UploadedFile() file: Express.Multer.File, @Body() body: CreateMailEventDto) {
    const { to, subject, text, startDate, endDate, html } = body;
    const attachments = file
      ? [
        {
          filename: file.originalname,
          path: file.path,
        },
      ]
      : [];

    return await this.mailService.sendEmailEvent(to, subject, text, startDate, endDate, html, attachments);

  }

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


}
