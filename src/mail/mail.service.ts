import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException, RequestTimeoutException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer'
import { CreateMailDto } from './dto/create-mail.dto';
import { UpdateMailDto } from './dto/update-mail.dto';
import * as nodemailer from 'nodemailer'
import { ConfigService } from '@nestjs/config';
import ical from 'ical-generator';
import { FjiDatabaseService } from 'src/database/database-fji.service';
import * as moment from 'moment'
import * as crypto from 'crypto';
import * as ftp from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { EmailParams, MailerSend, Recipient, Sender } from 'mailersend';


@Injectable()
export class MailService {

  constructor(private readonly fjiDatabase: FjiDatabaseService) {

  }

  // async download(remoteFilePath: string, localFilePath: string): Promise<void> {
  //   try {
  //     await this.client.downloadTo(localFilePath, remoteFilePath);
  //     console.log('File downloaded successfully');
  //   } catch (error) {
  //     throw new Error(`Failed to download file: ${error.message}`);
  //   }
  // }
  async download(remoteFileUrl: string, localFilePath: string): Promise<void> {
    try {
      await fs.promises.mkdir(path.dirname(localFilePath), { recursive: true });
      const response = await axios.get(remoteFileUrl, { responseType: 'stream' });
      const writer = fs.createWriteStream(localFilePath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      console.log('File downloaded successfully');
    } catch (error) {
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }


  encrypt(text: string): string {
    const ENCRYPTION_KEY = (process.env.ENCRYPTION_KEY).padEnd(16, '0').slice(0, 16); // 16 bytes key
    const IV_LENGTH = 16; // For AES, this is always 16 bytes
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  decrypt(text: string): string {
    const ENCRYPTION_KEY = (process.env.ENCRYPTION_KEY).padEnd(16, '0').slice(0, 16);
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-128-cbc',
      Buffer.from(ENCRYPTION_KEY, 'utf8'),
      iv,
    );

    let decrypted = decipher.update(encryptedText, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private generateNewEmailTemplate(data: Record<any, any>) {
    const {
      doc_no, debtor_name, address1, address2, descs,
      descs_lot, project_name, start_date, end_date, due_date
    } = data

    return `
      <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>E-Invoice</title>
            <style>
              body {
                margin: 40px;
                font-family: "Times New Roman", serif;
                font-size: 16px;
                color: #000;
                max-width: 600px;
                margin: 0 auto;
              }
              .bold { font-weight: bold; }
              a      { color: #0000EE; text-decoration: underline; }

              /* Invoice table now has three columns: label, colon, value */
              .invoice-table {
                margin-top: 20px;
                border-collapse: collapse;
              }
              .invoice-table td {
                vertical-align: top;
                padding: 2px 4px 2px 4px;
              }
              .invoice-table .label {
                width: 140px;
              }
              .invoice-table .colon {
                width: 10px;
                text-align: center;
              }
              .invoice-table .value {
                padding-left: 50px;
              }

              .note {
                margin-top: 20px;
                line-height: 1.5;
                text-align: justify;
              }
              .footer {
                margin-top: 20px;
                line-height: 1.5;
              }
            </style>
          </head>
          <body class="container">
            <p class="bold">Kepada Yth.</p>
            <p class="bold">
              ${debtor_name}<br>
              ${address1} – ${address2}<br>
              DKI JAKARTA
            </p>

            <p class="bold">Bersama ini kami lampirkan e-Invoice :</p>

            <table class="invoice-table">
              <tr>
                <td class="label bold">No. Invoice</td>
                <td class="colon bold">:</td>
                <td class="value bold">${doc_no}</td>
              </tr>
              <tr>
                <td class="label bold">Tagihan</td>
                <td class="colon bold">:</td>
                <td class="value bold">${descs}</td>
              </tr>
              <tr>
                <td class="label bold">Periode</td>
                <td class="colon bold">:</td>
                <td class="value bold">${moment(start_date).format('DD-MMM-YY')} – ${moment(end_date).format('DD-MMM-YY')}</td>
              </tr>
              <tr>
                <td class="label bold">Lokasi</td>
                <td class="colon bold">:</td>
                <td class="value bold">${project_name}</td>
              </tr>
              <tr>
                <td class="label bold">Lot</td>
                <td class="colon bold">:</td>
                <td class="value bold">${descs_lot}</td>
              </tr>
              <tr>
                <td class="label bold">Jatuh tempo</td>
                <td class="colon bold">:</td>
                <td class="value bold">${moment(due_date).format('DD-MMM-YY')}</td>
              </tr>
            </table>

            <p class="note">
              Note : Mohon invoice diperiksa Kembali dan jika ada keberatan kami tunggu maksimal 3 (tiga) hari kerja dari tanggal email ini dan dengan mengirim email ke
              <a href="mailto:tr.property@fji.co.id">tr.property@fji.co.id</a> dengan cc.
              <a href="mailto:arbilling.bm@fji.co.id">arbilling.bm@fji.co.id</a> atau dapat menghubungi Building Management di 021-5151515 dengan TENANT RELATION
            </p>

            <div class="footer">
              <p>Kami mengucapkan terima kasih untuk perhatian dan kerja samanya.
                <br>
                <b>Hormat kami,</b>
              </p>
              <br>
              <br>
              <br>
              <p class="bold">Building Management<br>
                PT. First Jakarta International
              </p>
            </div>
          </body>
        </html>   
    `
  }
  private generateNewEmailTemplateOr(data: Record<any, any>) {
    const {
      doc_no, debtor_name, address1, address2, descs, project_name, doc_date
    } = data

    return `
      <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>E-Receipt</title>
            <style>
              body {
                margin: 40px;
                font-family: "Times New Roman", serif;
                font-size: 16px;
                color: #000;
                max-width: 600px;
                margin: 0 auto;
              }
              .bold { font-weight: bold; }
              a      { color: #0000EE; text-decoration: underline; }

              /* Invoice table now has three columns: label, colon, value */
              .invoice-table {
                margin-top: 20px;
                border-collapse: collapse;
              }
              .invoice-table td {
                vertical-align: top;
                padding: 2px 4px 2px 4px;
              }
              .invoice-table .label {
                width: 140px;
              }
              .invoice-table .colon {
                width: 10px;
                text-align: center;
              }
              .invoice-table .value {
                padding-left: 50px;
              }

              .note {
                margin-top: 20px;
                line-height: 1.5;
                text-align: justify;
              }
              .footer {
                margin-top: 20px;
                line-height: 1.5;
              }
            </style>
          </head>
          <body class="container">
            <p class="bold">Kepada Yth.</p>
            <p class="bold">
              ${debtor_name}<br>
              ${address1} – ${address2}<br>
              DKI JAKARTA
            </p>

            <p class="bold">Bersama ini kami lampirkan e-Receipt :</p>

            <table class="invoice-table">
              <tr>
                <td class="label bold">No. Invoice</td>
                <td class="colon bold">:</td>
                <td class="value bold">${doc_no}</td>
              </tr>
              <tr>
                <td class="label bold">Tagihan</td>
                <td class="colon bold">:</td>
                <td class="value bold">${descs}</td>
              </tr>
              <tr>
                <td class="label bold">Tanggal</td>
                <td class="colon bold">:</td>
                <td class="value bold">${moment(doc_date).format('DD-MMM-YY')}</td>
              </tr>
              <tr>
                <td class="label bold">Lokasi</td>
                <td class="colon bold">:</td>
                <td class="value bold">${project_name}</td>
              </tr>
            </table>

            <p class="note">
              Note : Mohon receipt diperiksa Kembali dan jika ada keberatan kami tunggu maksimal 3 (tiga) hari kerja dari tanggal email ini dan dengan mengirim email ke
              <a href="mailto:tr.property@fji.co.id">tr.property@fji.co.id</a> dengan cc.
              <a href="mailto:arbilling.bm@fji.co.id">arbilling.bm@fji.co.id</a> atau dapat menghubungi Building Management di 021-5151515 dengan TENANT RELATION
            </p>

            <div class="footer">
              <p>Kami mengucapkan terima kasih untuk perhatian dan kerja samanya.
                <br>
                <b>Hormat kami,</b>
              </p>
              <br>
              <br>
              <br>
              <p class="bold">Building Management<br>
                PT. First Jakarta International
              </p>
            </div>
          </body>
        </html>   
    `
  }

  private generateBaseTemplate(type: string, from: string, bodyContent: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 0;
              background-color: #f9f9f9;
              color: #333;
            }
            .email-container {
              max-width: 600px;
              margin: 20px auto;
              background-color: #ffffff;
              border: 1px solid #ddd;
              border-radius: 8px;
              overflow: hidden;
            }
            .email-header {
              background-color: #007BFF;
              color: #ffffff;
              text-align: center;
              padding: 20px;
            }
            .email-header h1 {
              margin: 0;
              font-size: 24px;
            }
            .email-body {
              padding: 20px;
            }
            .email-body p {
              margin: 10px 0;
              line-height: 1.6;
            }
            .email-footer {
              text-align: center;
              font-size: 12px;
              color: #888;
              padding: 10px 20px;
              border-top: 1px solid #ddd;
            }
            .email-footer a {
              color: #007BFF;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="email-header">
              <h1>${type}</h1>
              <h1>${from}</h1>
            </div>
            <div class="email-body">
              ${bodyContent}
            </div>
            <div class="email-footer">
              <p>&copy; ${new Date().getFullYear()} FJI. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private generateInvoiceTemplate(
    senderName: string,
    senderEmail: string,
    recipientEmail: string,
    invoiceNumber: string,
    type: string  // This could be either "Invoice" or "Receipt"
  ): string {
    const content = `
      <p>Dear ${recipientEmail},</p>
      <p>Thank you for your business. Please find the attached ${type.toLowerCase()} for your reference.</p>
      <p><strong>${type} Number:</strong> #${invoiceNumber}</p>
      <p>If you have any questions, feel free to contact us at <a href="mailto:${senderEmail}">${senderEmail}</a>.</p>
      <p>Best regards,<br>${senderName}</p>
    `;
    const title = `${type.toUpperCase()} FROM ${senderName}`;
    return this.generateBaseTemplate(`${type.toUpperCase()} FROM`, senderName, content);
  }

  private generateAccountCreationTemplate(recipientEmail: string): string {
    const content = `
      <p>Dear ${recipientEmail},</p>
      <p>You have created an account. Below are your default login credentials:</p>
      <p><strong>Email:</strong> ${recipientEmail}</p>
      <p><strong>Password:</strong> pass1234</p>
    `;
    const title = "Account Created";
    return this.generateBaseTemplate(title, '', content);
  }


  private async getSmtpTransporter(): Promise<any> {
    const mailConfig = await this.getEmailConfig();
    // const decryptedPassword = this.decrypt(mailConfig.data[0].password)
    return nodemailer.createTransport({
      host: mailConfig.data[0].host, // SMTP server
      port: mailConfig.data[0].port, // Port number
      secure: false, // Use TLS (false for port 587)
      auth: {
        user: mailConfig.data[0].username,
        pass: mailConfig.data[0].password,
      },
      connectionTimeout: 2 * 60 * 1000,
      greetingTimeout: 60 * 1000,
      socketTimeout: 2 * 60 * 1000,
    });
  }

  async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
    cc?: Array<string>,
    bcc?: Array<string>,
    attachments?: Array<{ filename: string; path: string }>,
  ) {

    const mailOptions: any = {
      from: 'FJI <fji@ifca.co.id>',
      to,
      subject,
      text,
      html: '<p>For clients that do not support AMP4EMAIL or amp content is not valid</p>',
      attachments,

    };

    if (cc && cc.length > 0) mailOptions.cc = cc;
    if (bcc && bcc.length > 0) mailOptions.bcc = bcc;

    try {
      const smtptransporter = await this.getSmtpTransporter()
      const info = await smtptransporter.sendMail(mailOptions);

      return {
        statusCode: 201,
        message: 'Email sent successfully',
        data: [{
          messageId: info.messageId,
          envelope: info.envelope,
          accepted: info.accepted,
          rejected: info.rejected,
          pending: info.pending,
          response: info.response,
        }],
      };
    } catch (error) {
      throw new RequestTimeoutException({
        statusCode: 408,
        message: 'failed to send email',
        data: []
      })
    }
  }

  async sendAccountCreationEmail(email: string) {
    const mailConfig = await this.getEmailConfig()
    const mailOptions: any = {
      from: `${mailConfig.data[0].sender_name} <${mailConfig.data[0].sender_email}>`,
      to: email,
      subject: `Account creation`,
      text: 'You have created an account, your default password is pass1234', // Fallback for plain text clients
      html: this.generateAccountCreationTemplate(email)
    }

    let send_status: string
    let status_code: number
    let response_message: string
    const send_date = moment().format('YYYYMMDD HH:mm:ss')
    try {
      const smtptransporter = await this.getSmtpTransporter()
      const info = await smtptransporter.sendMail(mailOptions);
      if (info.accepted.includes(email)) {
        send_status = 'S';
        status_code = 200;
        response_message = 'Email sent successfully';
      }
      else if (info.pending.includes(email)) {
        send_status = 'P';
        status_code = 202;
        response_message = 'Email is pending';
      }
      else if (info.rejected.includes(email)) {
        send_status = 'F';
        status_code = 400;
        response_message = 'Email not accepted by server';
      }
    } catch (error) {
      console.log(error)
      throw new BadRequestException({
        statusCode: 400,
        message: "fail to send account creation email",
        data: []
      })
    }

    return ({
      statusCode: status_code,
      message: response_message,
      data: []
    })
  }

  async mailerSendOr(doc_no: string, process_id: string, sender: string) {
    const mailConfig = await this.getEmailConfig();
    const mailerSend = new MailerSend({
      apiKey: process.env.API_KEY,
    });
    const baseUrl = process.env.FTP_BASE_URL;
    const send_id = Array(6)
      .fill(null)
      .map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26)))
      .join('');

    // Fetch the record for the given doc_no
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_or WHERE doc_no = '${doc_no}' AND process_id = '${process_id}'
    `);

    if (!result || result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No record found',
        data: []
      });
    }
    const email_addrs = result[0].email_addr
      ? result[0].email_addr.split(';').map((email: string) => email.trim())
      : [];
    const sentFrom = new Sender(
      mailConfig.data[0].sender_email,
      mailConfig.data[0].sender_name,
    );
    let info = [];
    for (let i = 0; i < email_addrs.length; i++) {
      const attachments = [];
      const primaryFilename = result[0].file_name_sign ?? result[0].filenames;
      let primaryFileContent: string;
      if (result[0].file_name_sign) {
        const baseUrl = process.env.FTP_BASE_URL
        const fileUrl = `${baseUrl}/SIGNED/RECEIPT/${primaryFilename}`;
        const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        primaryFileContent = Buffer.from(response.data).toString('base64');
      } else {
        // Otherwise, read from local file system
        const primaryFilePath = path.resolve(__dirname, `../../uploads/receipt/${primaryFilename}`);
        primaryFileContent = fs.readFileSync(primaryFilePath).toString('base64');
      }

      attachments.push({
        content: primaryFileContent,
        filename: primaryFilename,
      });

      // Optionally add filenames2
      if (result[0].filenames2) {
        const filePath2 = path.resolve(__dirname, `../../uploads/extraFiles/${result[i].filenames2}`);
        const fileContent2 = fs.readFileSync(filePath2).toString('base64');

        attachments.push({
          content: fileContent2,
          filename: result[0].filenames2,
        });
      }

      // Optionally add filenames3
      if (result[0].filenames3) {
        const filePath3 = path.resolve(__dirname, `../../uploads/FAKTUR/${result[0].filenames3}`);
        const fileContent3 = fs.readFileSync(filePath3).toString('base64');

        attachments.push({
          content: fileContent3,
          filename: result[0].filenames3,
          disposition: attachments
        });
      }
      if (result[0].filenames4) {
        const filePath4 = path.resolve(__dirname, `../../uploads/schedule/${result[0].filenames4}`);
        const fileContent4 = fs.readFileSync(filePath4).toString('base64');

        attachments.push({
          content: fileContent4,
          filename: result[0].filenames4,
          disposition: attachments
        });
      }
      if (result[0].filenames5) {
        const filePath5 = path.resolve(__dirname, `../../uploads/extraFiles/${result[0].filenames5}`);
        const fileContent5 = fs.readFileSync(filePath5).toString('base64');

        attachments.push({
          content: fileContent5,
          filename: result[0].filenames5,
          disposition: attachments
        });
      }
      const emailContent: Array<any> = await this.fjiDatabase.$queryRaw(Prisma.sql`
        SELECT * FROM mgr.v_ar_ledger_gen_or_web
        WHERE entity_cd = ${result[0].entity_cd}
        AND project_no = ${result[0].project_no}
        AND debtor_acct = ${result[0].debtor_acct}
        AND doc_no = ${doc_no}
        `)
      const emailBody = {
        doc_no,
        debtor_name: emailContent[0].debtor_name || '',
        address1: emailContent[0].address1 || '',
        address2: emailContent[0].address2 || '',
        descs: emailContent[0].descs || '',
        descs_lot: emailContent[0].descs_lot || '',
        project_name: emailContent[0].project_name || '',
        start_date: emailContent[0].start_date || '',
        end_date: emailContent[0].end_date || '',
        due_date: emailContent[0].due_date || '',
      }
      console.log(email_addrs[i])
      const emailParams = new EmailParams()
        .setFrom(sentFrom)
        .setTo([new Recipient(email_addrs[i], "Recipient")])
        .setReplyTo(sentFrom)
        .setSubject('This is a Subject')
        .setHtml(
          this.generateNewEmailTemplate(emailBody),
        )
        .setText('This is the text content')
        .setAttachments(attachments);
      const response = await mailerSend.email.send(emailParams)

      if (response.statusCode == 202) {
        const mailersend_id = response.headers['x-message-id']
        info.push(mailersend_id);
        try {
          await this.fjiDatabase.$queryRaw(Prisma.sql`
            UPDATE ar_blast_or SET send_id = ${send_id}
            WHERE doc_no = ${doc_no} AND process_id = ${process_id}
            `)
          await this.fjiDatabase.$queryRaw(Prisma.sql`
            INSERT INTO ar_blast_or_msg_log
            (email_addr, doc_no, status_code, send_status, response_message, send_date, send_id, audit_user, mailersend_id)
            VALUES
            (${email_addrs[i]}, ${result[0].doc_no}, 400, 'pending', 'message not sent', NOW(), ${send_id}, ${sender} ,${mailersend_id})
            `)
        } catch (error) {
          console.log(error)
          throw new BadRequestException({
            statusCode: 400,
            message: "fail to update database",
            data: []
          })
        }
      }
      else if (response.statusCode == 422) {
        info.push(response.body)
      }
    }


    return {
      statusCode: 201,
      message: "email has been processed, please check blast history",
      data: info
    }
  }

  async mailerSendInv(doc_no: string, process_id: string, sender: string) {
    const mailConfig = await this.getEmailConfig();
    const mailerSend = new MailerSend({
      apiKey: process.env.API_KEY,
    });
    const baseUrl = process.env.FTP_BASE_URL;
    const send_id = Array(6)
      .fill(null)
      .map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26)))
      .join('');

    // Fetch the record for the given doc_no
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_inv WHERE doc_no = '${doc_no}' AND process_id = '${process_id}'
    `);

    if (!result || result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No record found',
        data: []
      });
    }
    const email_addrs = result[0].email_addr
      ? result[0].email_addr.split(';').map((email: string) => email.trim())
      : [];
    const sentFrom = new Sender(
      mailConfig.data[0].sender_email,
      mailConfig.data[0].sender_name,
    );
    let info = [];
    for (let i = 0; i < email_addrs.length; i++) {
      const attachments = [];
      const primaryFilename = result[0].file_name_sign ?? result[0].filenames;
      let primaryFileContent: string;
      if (result[0].file_name_sign) {
        const baseUrl = process.env.FTP_BASE_URL
        const fileUrl = `${baseUrl}/SIGNED/${result[0].invoice_tipe}/${primaryFilename}`;
        const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        primaryFileContent = Buffer.from(response.data).toString('base64');
      } else {
        // Otherwise, read from local file system
        const primaryFilePath = path.resolve(__dirname, `../../uploads/${result[0].invoice_tipe}/${primaryFilename}`);
        primaryFileContent = fs.readFileSync(primaryFilePath).toString('base64');
      }

      attachments.push({
        content: primaryFileContent,
        filename: primaryFilename,
      });

      // Optionally add filenames2
      if (result[0].filenames2) {
        const filePath2 = path.resolve(__dirname, `../../uploads/${result[i].invoice_tipe}/${result[i].filenames2}`);
        const fileContent2 = fs.readFileSync(filePath2).toString('base64');

        attachments.push({
          content: fileContent2,
          filename: result[0].filenames2,
        });
      }

      // Optionally add filenames3
      if (result[0].filenames3) {
        const filePath3 = path.resolve(__dirname, `../../uploads/FAKTUR/${result[0].filenames3}`);
        const fileContent3 = fs.readFileSync(filePath3).toString('base64');

        attachments.push({
          content: fileContent3,
          filename: result[0].filenames3,
          disposition: attachments
        });
      }
      if (result[0].filenames4) {
        const filePath4 = path.resolve(__dirname, `../../uploads/schedule/${result[0].filenames4}`);
        const fileContent4 = fs.readFileSync(filePath4).toString('base64');

        attachments.push({
          content: fileContent4,
          filename: result[0].filenames4,
          disposition: attachments
        });
      }
      if (result[0].filenames5) {
        const filePath5 = path.resolve(__dirname, `../../uploads/extraFiles/${result[0].filenames5}`);
        const fileContent5 = fs.readFileSync(filePath5).toString('base64');

        attachments.push({
          content: fileContent5,
          filename: result[0].filenames5,
          disposition: attachments
        });
      }
      let emailContent: Array<any>
      if (result[0].invoice_tipe === "schedule") {
        emailContent = await this.fjiDatabase.$queryRaw(Prisma.sql`
          SELECT * FROM mgr.v_ar_ledger_sch_inv_web
          WHERE entity_cd = ${result[0].entity_cd}
          AND project_no = ${result[0].project_no}
          AND debtor_acct = ${result[0].debtor_acct}
          AND doc_no = ${doc_no}
        `)
      }
      else if (result[0].invoice_tipe === "manual") {
        emailContent = await this.fjiDatabase.$queryRaw(Prisma.sql`
          SELECT * FROM mgr.v_ar_inv_entry_post_manual_web
          WHERE entity_cd = ${result[0].entity_cd}
          AND project_no = ${result[0].project_no}
          AND debtor_acct = ${result[0].debtor_acct}
          AND doc_no = ${doc_no}
        `)
      }
      else if (result[0].invoice_tipe === "proforma") {
        emailContent = await this.fjiDatabase.$queryRaw(Prisma.sql`
          SELECT * FROM mgr.v_ar_inv_proforma_web
          WHERE entity_cd = ${result[0].entity_cd}
          AND project_no = ${result[0].project_no}
          AND debtor_acct = ${result[0].debtor_acct}
          AND doc_no = ${doc_no}
        `)
      }
      const emailBody = {
        doc_no,
        debtor_name: emailContent[0].debtor_name || '',
        address1: emailContent[0].address1 || '',
        address2: emailContent[0].address2 || '',
        descs: emailContent[0].descs || '',
        descs_lot: emailContent[0].descs_lot || '',
        project_name: emailContent[0].project_name || '',
        start_date: emailContent[0].start_date || '',
        end_date: emailContent[0].end_date || '',
        due_date: emailContent[0].due_date || '',
      }
      console.log(email_addrs[i])
      const emailParams = new EmailParams()
        .setFrom(sentFrom)
        .setTo([new Recipient(email_addrs[i], "Recipient")])
        .setReplyTo(sentFrom)
        .setSubject('This is a Subject')
        .setHtml(
          this.generateNewEmailTemplate(emailBody)
        )
        .setText('This is the text content')
        .setAttachments(attachments);
      const response = await mailerSend.email.send(emailParams)

      if (response.statusCode == 202) {
        const mailersend_id = response.headers['x-message-id']
        info.push(mailersend_id);
        try {
          await this.fjiDatabase.$queryRaw(Prisma.sql`
            UPDATE ar_blast_inv SET send_id = ${send_id}
            WHERE doc_no = ${doc_no} AND process_id = ${process_id}
            `)
          await this.fjiDatabase.$queryRaw(Prisma.sql`
            INSERT INTO ar_blast_inv_msg_log
            (email_addr, doc_no, status_code, send_status, response_message, send_date, send_id, audit_user, mailersend_id)
            VALUES
            (${email_addrs[i]}, ${result[0].doc_no}, 400, 'pending', 'message not sent', NOW(), ${send_id}, ${sender} ,${mailersend_id})
            `)
        } catch (error) {
          console.log(error)
          throw new BadRequestException({
            statusCode: 400,
            message: "fail to update database",
            data: []
          })
        }
      }
      else if (response.statusCode == 422) {
        info.push(response.body)
      }
    }


    return {
      statusCode: 201,
      message: "email has been processed, please check blast history",
      data: info
    }
  }

  async blastEmailOr(doc_no: string, process_id: string, sender: string) {
    const baseUrl = process.env.FTP_BASE_URL;
    const send_id = Array(6)
      .fill(null)
      .map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26)))
      .join('');

    // Fetch the record for the given doc_no
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_or WHERE doc_no = '${doc_no}' AND process_id = '${process_id}'
    `);

    if (!result || result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No record found',
        data: []
      });
    }

    const emailContent: Array<any> = await this.fjiDatabase.$queryRaw(Prisma.sql`
      SELECT * FROM mgr.v_ar_ledger_gen_or_web
      WHERE entity_cd = ${result[0].entity_cd}
      AND project_no = ${result[0].project_no}
      AND debtor_acct = ${result[0].debtor_acct}
      AND doc_no = ${doc_no}
      `)
    // Split the email_addr column into an array of strings
    const email_addrs = result[0].email_addr
      ? result[0].email_addr.split(';').map((email: string) => email.trim())
      : [];

    const emailToSendCount: number = email_addrs.length
    try {
      const completedTransaction: Array<any> = await this.fjiDatabase.$queryRaw(Prisma.sql`
              SELECT * FROM mgr.finpay_transaction
              WHERE status_payment = 'COMPLETED'
              AND type_topup = 'E'
              AND company_cd = 'GQCINV'
            `)
      const invoiceEmailSent = await this.fjiDatabase.$queryRaw(Prisma.sql`
              SELECT count(rowID) as count FROM mgr.ar_blast_inv_log_msg
            `)
      const receiptEmailSent = await this.fjiDatabase.$queryRaw(Prisma.sql`
              SELECT count(rowID) as count FROM mgr.ar_blast_or_log_msg
            `)
      const totalTopup = completedTransaction.length > 0
        ? completedTransaction.reduce((sum, item) => sum + Number(item.order_qty), 0)
        : 0;

      const totalEmailSent: number =
        (invoiceEmailSent[0]?.count || 0) + (receiptEmailSent[0]?.count || 0);

      if (totalTopup - totalEmailSent < emailToSendCount) {
        throw new BadRequestException({
          statusCode: 400,
          message: "You don't have enough quota, please top up first",
          data: {
            totalEmailSent,
            totalTopup
          }
        })
      }

    } catch (error) {
      throw new InternalServerErrorException({
        statusCode: 500,
        message: 'fail to get email quota',
        data: error
      })
    }

    const mailConfig = await this.getEmailConfig();
    const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
    // const upper_file_type = result[0].invoice_tipe.toUpperCase();

    // const attachments = await this.buildAttachments(result[0]);

    let signedFileAttachment;
    if (result[0].file_name_sign) {
      try {
        const response = await axios.get(
          `${baseUrl}/SIGNED/GQCINV/RECEIPT/${result[0].file_name_sign}`,
          { responseType: 'arraybuffer' }
        );
        signedFileAttachment = {
          filename: result[0].file_name_sign,
          content: Buffer.from(response.data),
        };
      } catch (error) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'fail to get signed file',
          data: []
        });
      }
    }

    // Base mail options (common for all emails)
    const baseMailOptions: any = {
      from: `${mailConfig.data[0].sender_name} <${mailConfig.data[0].sender_email}>`,
      subject: `OFFICIAL RECEIPT ${doc_no}`,
      text: "text",
      attachments: [
        ...(result[0].file_name_sign
          ? [signedFileAttachment]
          : [{
            filename: result[0].filenames,
            path: `${rootFolder}/${result[0].invoice_tipe}/${result[0].filenames}`,
          }]
        ),
        ...(result[0].filenames2
          ? [{
            filename: result[0].filenames2,
            path: `${rootFolder}/extraFiles/${result[0].filenames2}`,
          }]
          : []),
        ...(result[0].filenames3
          ? [{
            filename: result[0].filenames3,
            path: `${rootFolder}/FAKTUR/${result[0].filenames3}`,
          }]
          : []),
      ],
    };

    // Prepare arrays to hold the status for each email sent
    let send_statuses: string[] = [];
    let status_codes: number[] = [];
    let response_messages: string[] = [];
    let send_dates: string[] = [];

    // Pre-fill the arrays with default values for each email address
    for (let i = 0; i < email_addrs.length; i++) {
      status_codes[i] = 401;
      response_messages[i] = "fail to login to smpt";
      send_dates[i] = moment().format('YYYYMMDD HH:mm:ss')
      send_statuses[i] = 'F';
    }

    let smtptransporter: any = null;
    try {
      smtptransporter = await this.getSmtpTransporter();
    } catch (error) {
      console.error("Failed to get SMTP transporter:", error);
    }
    const emailBody = {
      doc_no,
      debtor_name: emailContent[0].name || '',
      address1: emailContent[0].address1 || '',
      address2: emailContent[0].address2 || '',
      descs: emailContent[0].descs || '',
      project_name: emailContent[0].project_name || '',
      doc_date: emailContent[0].doc_date || '',
    }
    for (let i = 0; i < email_addrs.length; i++) {
      const email = email_addrs[i];
      const mailOptions = {
        ...baseMailOptions,
        to: email,
        html: this.generateNewEmailTemplateOr(emailBody),
      };

      // Update the send date for this email at the current index
      send_dates[i] = moment().format('YYYYMMDD HH:mm:ss');

      try {
        const info = await smtptransporter.sendMail(mailOptions);
        if (info.accepted.includes(email)) {
          send_statuses[i] = 'S';
          status_codes[i] = 200;
          response_messages[i] = 'Email sent successfully';
        } else if (info.pending.includes(email)) {
          send_statuses[i] = 'P';
          status_codes[i] = 202;
          response_messages[i] = 'Email is pending';
        } else if (info.rejected.includes(email)) {
          send_statuses[i] = 'F';
          status_codes[i] = 400;
          response_messages[i] = 'Email not accepted by server';
        } else {
          // Fallback if the email address is not in any list
          send_statuses[i] = 'F';
          status_codes[i] = 400;
          response_messages[i] = 'Email not accepted by server';
        }
      } catch (error) {
        console.log(error);
        send_statuses[i] = 'F';
        status_codes[i] = 408;
        response_messages[i] = 'Email not accepted by server';
      }
    }


    let final_send_status: string;
    if (send_statuses.every(status => status === 'S')) {
      final_send_status = 'S';
    } else if (send_statuses.includes('F')) {
      final_send_status = 'F';
    }
    await this.updateArBlastOrTable(
      doc_no,
      moment().format('YYYYMMDD HH:mm:ss'),
      final_send_status,
      send_id,
      result[0].entity_cd,
      result[0].project_no,
      result[0].debtor_acct,
      result[0].invoice_tipe,
      process_id
    );

    // Loop through the email addresses to insert a log for each email
    for (let i = 0; i < email_addrs.length; i++) {
      console.log("send date : " + send_dates[i])
      await this.insertToOrMsgLog(
        result[0].entity_cd,
        result[0].project_no,
        result[0].debtor_acct,
        email_addrs[i],
        doc_no,
        status_codes[i],
        response_messages[i],
        send_id,
        sender,
        send_dates[i],
      );
    }

    // If any email resulted in a timeout (status code 408), throw an exception
    // if (status_codes.includes(408)) {
    //   throw new RequestTimeoutException({
    //     statusCode: 408,
    //     message: 'failed to send email',
    //     data: []
    //   });
    // }

    return {
      statusCode: 200,
      message: "email has been processed, please check blast history",
      data: result[0]
    };
  }

  // async checkFileExists(filePath: string): Promise<{ error: boolean; message: string }> {
  //   try {
  //     const response = await axios.head(filePath);
  //     console.log(response)

  //     if (response.status === 200) {
  //       return { error: false, message: 'File exists' };
  //     }
  //   } catch (error) {
  //     return { error: true, message: 'Unable to process email, because the file does not exist' };
  //   }

  //   return { error: true, message: 'Unable to process email, because the file does not exist' };
  // }

  async blastEmailInv(doc_no: string, process_id: string, sender: string) {
    const baseUrl = process.env.FTP_BASE_URL;
    const send_id = Array(6)
      .fill(null)
      .map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26)))
      .join('');

    // Fetch the record for the given doc_no
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_inv WHERE doc_no = '${doc_no}' AND process_id = '${process_id}'
    `);

    if (!result || result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No record found',
        data: []
      });
    }



    // Split the email_addr column into an array of strings
    const email_addrs = result[0].email_addr
      ? result[0].email_addr.split(';').map((email: string) => email.trim())
      : [];

    const emailToSendCount: number = email_addrs.length
    try {
      const completedTransaction: Array<any> = await this.fjiDatabase.$queryRaw(Prisma.sql`
              SELECT * FROM mgr.finpay_transaction
              WHERE status_payment = 'COMPLETED'
              AND type_topup = 'E'
              AND company_cd = 'GQCINV'
            `)
      const invoiceEmailSent = await this.fjiDatabase.$queryRaw(Prisma.sql`
              SELECT count(rowID) as count FROM mgr.ar_blast_inv_log_msg
            `)
      const receiptEmailSent = await this.fjiDatabase.$queryRaw(Prisma.sql`
              SELECT count(rowID) as count FROM mgr.ar_blast_or_log_msg
            `)
      const totalTopup = completedTransaction.length > 0
        ? completedTransaction.reduce((sum, item) => sum + Number(item.order_qty), 0)
        : 0;

      const totalEmailSent: number =
        (invoiceEmailSent[0]?.count || 0) + (receiptEmailSent[0]?.count || 0);

      if (totalTopup - totalEmailSent < emailToSendCount) {
        throw new BadRequestException({
          statusCode: 400,
          message: "You don't have enough quota, please top up first",
          data: {
            totalEmailSent,
            totalTopup
          }
        })
      }

    } catch (error) {
      throw new InternalServerErrorException({
        statusCode: 500,
        message: 'fail to get email quota',
        data: error
      })
    }

    let emailContent: Array<any>
    if (result[0].invoice_tipe === "schedule") {
      emailContent = await this.fjiDatabase.$queryRaw(Prisma.sql`
        SELECT * FROM mgr.v_ar_ledger_sch_inv_web
        WHERE entity_cd = ${result[0].entity_cd}
        AND project_no = ${result[0].project_no}
        AND debtor_acct = ${result[0].debtor_acct}
        AND doc_no = ${doc_no}
      `)
    }
    else if (result[0].invoice_tipe === "manual") {
      emailContent = await this.fjiDatabase.$queryRaw(Prisma.sql`
        SELECT * FROM mgr.v_ar_inv_entry_post_manual_web
        WHERE entity_cd = ${result[0].entity_cd}
        AND project_no = ${result[0].project_no}
        AND debtor_acct = ${result[0].debtor_acct}
        AND doc_no = ${doc_no}
      `)
    }
    else if (result[0].invoice_tipe === "proforma") {
      emailContent = await this.fjiDatabase.$queryRaw(Prisma.sql`
        SELECT * FROM mgr.v_ar_inv_proforma_web
        WHERE entity_cd = ${result[0].entity_cd}
        AND project_no = ${result[0].project_no}
        AND debtor_acct = ${result[0].debtor_acct}
        AND doc_no = ${doc_no}
      `)
    }

    const mailConfig = await this.getEmailConfig();
    const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
    const upper_file_type = result[0].invoice_tipe.toUpperCase();

    let signedFileAttachment;
    if (result[0].file_name_sign) {
      try {
        const response = await axios.get(
          `${baseUrl}/SIGNED/GQCINV/${upper_file_type}/${result[0].file_name_sign}`,
          { responseType: 'arraybuffer' }
        );
        signedFileAttachment = {
          filename: result[0].file_name_sign,
          content: Buffer.from(response.data),
        };
      } catch (error) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'fail to get signed file',
          data: []
        });
      }
    }

    // Base mail options (common for all emails)
    const baseMailOptions: any = {
      from: `${mailConfig.data[0].sender_name} <${mailConfig.data[0].sender_email}>`,
      subject: `INVOICE ${doc_no}`,
      text: "text",
      attachments: [
        ...(result[0].file_name_sign
          ? [signedFileAttachment]
          : [{
            filename: result[0].filenames,
            path: `${rootFolder}/${result[0].invoice_tipe}/${result[0].filenames}`,
          }]
        ),
        ...(result[0].filenames2
          ? [{
            filename: result[0].filenames2,
            path: `${rootFolder}/${result[0].invoice_tipe}/${result[0].filenames2}`,
          }]
          : []),
        ...(result[0].filenames3
          ? [{
            filename: result[0].filenames3,
            path: `${rootFolder}/FAKTUR/${result[0].filenames3}`,
          }]
          : []),
        ...(result[0].filenames4
          ? [{
            filename: result[0].filenames4,
            path: `${rootFolder}/${result[0].invoice_tipe}/${result[0].filenames4}`,
          }]
          : []),
        ...(result[0].filenames5
          ? [{
            filename: result[0].filenames5,
            path: `${rootFolder}/extraFiles/${result[0].filenames5}`,
          }]
          : []),
      ],
    };

    // Prepare arrays to hold the status for each email sent
    let send_statuses: string[] = [];
    let status_codes: number[] = [];
    let response_messages: string[] = [];
    let send_dates: string[] = [];
    let mailersend_id: string[] = []

    // Pre-fill the arrays with default values for each email address
    for (let i = 0; i < email_addrs.length; i++) {
      status_codes[i] = 401;
      response_messages[i] = "fail to login to smpt";
      send_dates[i] = moment().format('YYYYMMDD HH:mm:ss')
      send_statuses[i] = 'F';
      mailersend_id[i] = ''
    }

    let smtptransporter: any = null;
    try {
      smtptransporter = await this.getSmtpTransporter();
    } catch (error) {
      console.error("Failed to get SMTP transporter:", error);
    }


    // Now loop through using an index to update the existing values
    const emailBody = {
      doc_no,
      debtor_name: emailContent[0].debtor_name || '',
      address1: emailContent[0].address1 || '',
      address2: emailContent[0].address2 || '',
      descs: emailContent[0].descs || '',
      descs_lot: emailContent[0].descs_lot || '',
      project_name: emailContent[0].project_name || '',
      start_date: emailContent[0].start_date || '',
      end_date: emailContent[0].end_date || '',
      due_date: emailContent[0].due_date || '',
    }
    for (let i = 0; i < email_addrs.length; i++) {
      const email = email_addrs[i];
      const mailOptions = {
        ...baseMailOptions,
        to: email,
        html: this.generateNewEmailTemplate(emailBody),
      };

      // Update the send date for this email at the current index
      send_dates[i] = moment().format('YYYYMMDD HH:mm:ss');

      try {
        const info = await smtptransporter.sendMail(mailOptions);
        if (info.accepted.includes(email)) {
          send_statuses[i] = 'S';
          status_codes[i] = 200;
          response_messages[i] = 'Email sent successfully';
          mailersend_id[i] = info.response.match(/queued as ([a-zA-Z0-9]+)/)?.[1] || '';
        } else if (info.pending.includes(email)) {
          send_statuses[i] = 'P';
          status_codes[i] = 202;
          response_messages[i] = 'Email is pending';
          mailersend_id[i] = info.response.match(/queued as ([a-zA-Z0-9]+)/)?.[1] || '';
        } else if (info.rejected.includes(email)) {
          send_statuses[i] = 'F';
          status_codes[i] = 400;
          response_messages[i] = 'Email not accepted by server';
        } else {
          // Fallback if the email address is not in any list
          send_statuses[i] = 'F';
          status_codes[i] = 400;
          response_messages[i] = 'Email not accepted by server';
        }
      } catch (error) {
        console.log(error);
        send_statuses[i] = 'F';
        status_codes[i] = 408;
        response_messages[i] = 'Email not accepted by server';
      }
    }


    let final_send_status: string;
    if (send_statuses.every(status => status === 'S')) {
      final_send_status = 'S';
    } else if (send_statuses.includes('F')) {
      final_send_status = 'F';
    }
    await this.updateArBlastInvTable(
      doc_no,
      moment().format('YYYYMMDD HH:mm:ss'),
      final_send_status,
      send_id,
      result[0].entity_cd,
      result[0].project_no,
      result[0].debtor_acct,
      result[0].invoice_tipe,
      result[0].process_id
    );

    // Loop through the email addresses to insert a log for each email
    for (let i = 0; i < email_addrs.length; i++) {
      console.log("mailersend id : " + mailersend_id[i])
      await this.insertToInvMsgLog(
        result[0].entity_cd,
        result[0].project_no,
        result[0].debtor_acct,
        email_addrs[i],
        doc_no,
        status_codes[i],
        response_messages[i],
        send_id,
        sender,
        moment(result[0].audit_date).format('YYYYMMDD HH:mm:ss'),
        send_dates[i]
      );
    }

    // If any email resulted in a timeout (status code 408), throw an exception
    // if (status_codes.includes(408)) {
    //   throw new RequestTimeoutException({
    //     statusCode: 408,
    //     message: 'failed to send email',
    //     data: []
    //   });
    // }

    return {
      statusCode: 200,
      message: "email has been processed, please check blast history",
      data: result[0]
    };
  }

  async resendMailersendInv(doc_no: string, process_id: string, email: string) {
    console.log("resending invoice to email : " + email)
    const mailerSend = new MailerSend({
      apiKey: process.env.API_KEY,
    });
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_inv 
      WHERE doc_no = '${doc_no}'
      AND process_id = '${process_id}'
      `);

    if (!result || result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No record found',
        data: []
      });
    }

    const baseUrl = process.env.FTP_BASE_URL
    const upper_file_type = result[0].invoice_tipe.toUpperCase();
    const mailConfig = await this.getEmailConfig()
    const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)

    const attachments = [];
    const primaryFilename = result[0].file_name_sign ?? result[0].filenames;
    const primaryFilePath = path.resolve(__dirname, `../../uploads/${result[0].invoice_tipe}/${primaryFilename}`);
    const primaryFileContent = fs.readFileSync(primaryFilePath).toString('base64');

    attachments.push({
      content: primaryFileContent,
      filename: primaryFilename,
    });

    // Optionally add filenames2
    if (result[0].filenames2) {
      const filePath2 = path.resolve(__dirname, `../../uploads/${result[0].invoice_tipe}/${result[0].filenames2}`);
      const fileContent2 = fs.readFileSync(filePath2).toString('base64');

      attachments.push({
        content: fileContent2,
        filename: result[0].filenames2,
      });
    }

    // Optionally add filenames3
    if (result[0].filenames3) {
      const filePath3 = path.resolve(__dirname, `../../uploads/FAKTUR/${result[0].filenames3}`);
      const fileContent3 = fs.readFileSync(filePath3).toString('base64');

      attachments.push({
        content: fileContent3,
        filename: result[0].filenames3,
        disposition: attachments
      });
    }
    if (result[0].filenames4) {
      const filePath4 = path.resolve(__dirname, `../../uploads/schedule/${result[0].filenames4}`);
      const fileContent4 = fs.readFileSync(filePath4).toString('base64');

      attachments.push({
        content: fileContent4,
        filename: result[0].filenames4,
        disposition: attachments
      });
    }
    if (result[0].filenames5) {
      const filePath5 = path.resolve(__dirname, `../../uploads/extraFiles/${result[0].filenames5}`);
      const fileContent5 = fs.readFileSync(filePath5).toString('base64');

      attachments.push({
        content: fileContent5,
        filename: result[0].filenames5,
        disposition: attachments
      });
    }
    let emailContent: Array<any>
    if (result[0].invoice_tipe === "schedule") {
      emailContent = await this.fjiDatabase.$queryRaw(Prisma.sql`
        SELECT * FROM mgr.v_ar_ledger_sch_inv_web
        WHERE entity_cd = ${result[0].entity_cd}
        AND project_no = ${result[0].project_no}
        AND debtor_acct = ${result[0].debtor_acct}
        AND doc_no = ${doc_no}
      `)
    }
    else if (result[0].invoice_tipe === "manual") {
      emailContent = await this.fjiDatabase.$queryRaw(Prisma.sql`
        SELECT * FROM mgr.v_ar_inv_entry_post_manual_web
        WHERE entity_cd = ${result[0].entity_cd}
        AND project_no = ${result[0].project_no}
        AND debtor_acct = ${result[0].debtor_acct}
        AND doc_no = ${doc_no}
      `)
    }
    else if (result[0].invoice_tipe === "proforma") {
      emailContent = await this.fjiDatabase.$queryRaw(Prisma.sql`
        SELECT * FROM mgr.v_ar_inv_proforma_web
        WHERE entity_cd = ${result[0].entity_cd}
        AND project_no = ${result[0].project_no}
        AND debtor_acct = ${result[0].debtor_acct}
        AND doc_no = ${doc_no}
      `)
    }
    const sentFrom = new Sender(
      mailConfig.data[0].sender_email,
      mailConfig.data[0].sender_name,
    );
    const emailBody = {
      doc_no,
      debtor_name: emailContent[0].debtor_name || '',
      address1: emailContent[0].address1 || '',
      address2: emailContent[0].address2 || '',
      descs: emailContent[0].descs || '',
      descs_lot: emailContent[0].descs_lot || '',
      project_name: emailContent[0].project_name || '',
      start_date: emailContent[0].start_date || '',
      end_date: emailContent[0].end_date || '',
      due_date: emailContent[0].due_date || '',
    }

    try {
      const emailParams = new EmailParams()
        .setFrom(sentFrom)
        .setTo([new Recipient(email, "Recipient")])
        .setReplyTo(sentFrom)
        .setSubject('This is a Subject')
        .setHtml(
          this.generateNewEmailTemplate(emailBody),
        )
        .setText('This is the text content')
        .setAttachments(attachments);
      const response = await mailerSend.email.send(emailParams)
      const mailersend_id = response.headers['x-message-id']
      await this.fjiDatabase.$executeRaw(Prisma.sql`
        UPDATE mgr.ar_blast_inv_msg_log
          SET 
            mailersend_id = ${mailersend_id},
            audit_date = GETDATE()
          WHERE
            send_id = ${result[0].send_id} 
      `)
    } catch (error) {
      console.log(error)
      throw new BadRequestException({
        statusCode: 400,
        message: "fail to resend invoice email",
        data: []
      })
    }

    // try {
    //   await this.updateInvMsgLog(email, doc_no, 200, "response_message", result[0].send_id)
    // } catch (error) {
    //   throw error
    // }

    return ({
      statusCode: 200,
      message: "success resending email",
      date: []
    })
  }

  async resendMailersendOr(doc_no: string, process_id: string, email: string) {
    console.log("resending receipt to email : " + email)
    const mailerSend = new MailerSend({
      apiKey: process.env.API_KEY,
    });
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_or 
      WHERE doc_no = '${doc_no}'
      AND process_id = '${process_id}'
      `);

    if (!result || result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No record found',
        data: []
      });
    }

    const baseUrl = process.env.FTP_BASE_URL
    const upper_file_type = result[0].invoice_tipe.toUpperCase();
    const mailConfig = await this.getEmailConfig()
    const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)

    const attachments = [];
    const primaryFilename = result[0].file_name_sign ?? result[0].filenames;
    const primaryFilePath = path.resolve(__dirname, `../../uploads/receipt/${primaryFilename}`);
    const primaryFileContent = fs.readFileSync(primaryFilePath).toString('base64');

    attachments.push({
      content: primaryFileContent,
      filename: primaryFilename,
    });

    // Optionally add filenames2
    if (result[0].filenames2) {
      const filePath2 = path.resolve(__dirname, `../../uploads/extraFiles/${result[0].filenames2}`);
      const fileContent2 = fs.readFileSync(filePath2).toString('base64');

      attachments.push({
        content: fileContent2,
        filename: result[0].filenames2,
      });
    }

    // Optionally add filenames3
    if (result[0].filenames3) {
      const filePath3 = path.resolve(__dirname, `../../uploads/FAKTUR/${result[0].filenames3}`);
      const fileContent3 = fs.readFileSync(filePath3).toString('base64');

      attachments.push({
        content: fileContent3,
        filename: result[0].filenames3,
        disposition: attachments
      });
    }
    if (result[0].filenames4) {
      const filePath4 = path.resolve(__dirname, `../../uploads/schedule/${result[0].filenames4}`);
      const fileContent4 = fs.readFileSync(filePath4).toString('base64');

      attachments.push({
        content: fileContent4,
        filename: result[0].filenames4,
        disposition: attachments
      });
    }
    if (result[0].filenames5) {
      const filePath5 = path.resolve(__dirname, `../../uploads/extraFiles/${result[0].filenames5}`);
      const fileContent5 = fs.readFileSync(filePath5).toString('base64');

      attachments.push({
        content: fileContent5,
        filename: result[0].filenames5,
        disposition: attachments
      });
    }
    const emailContent: Array<any> = await this.fjiDatabase.$queryRaw(Prisma.sql`
      SELECT * FROM mgr.v_ar_ledger_gen_or_web
        WHERE entity_cd = ${result[0].entity_cd}
        AND project_no = ${result[0].project_no}
        AND debtor_acct = ${result[0].debtor_acct}
        AND doc_no = ${doc_no}
      `)
    const sentFrom = new Sender(
      mailConfig.data[0].sender_email,
      mailConfig.data[0].sender_name,
    );
    const emailBody = {
      doc_no,
      debtor_name: emailContent[0].debtor_name || '',
      address1: emailContent[0].address1 || '',
      address2: emailContent[0].address2 || '',
      descs: emailContent[0].descs || '',
      descs_lot: emailContent[0].descs_lot || '',
      project_name: emailContent[0].project_name || '',
      start_date: emailContent[0].start_date || '',
      end_date: emailContent[0].end_date || '',
      due_date: emailContent[0].due_date || '',
    }

    try {
      const emailParams = new EmailParams()
        .setFrom(sentFrom)
        .setTo([new Recipient(email, "Recipient")])
        .setReplyTo(sentFrom)
        .setSubject('This is a Subject')
        .setHtml(
          this.generateNewEmailTemplate(emailBody),
        )
        .setText('This is the text content')
        .setAttachments(attachments);
      const response = await mailerSend.email.send(emailParams)
      const mailersend_id = response.headers['x-message-id']
      await this.fjiDatabase.$executeRaw(Prisma.sql`
        UPDATE mgr.ar_blast_or_msg_log
          SET 
            mailersend_id = ${mailersend_id},
            audit_date = GETDATE()
          WHERE
            send_id = ${result[0].send_id} 
      `)
    } catch (error) {
      console.log(error)
      throw new BadRequestException({
        statusCode: 400,
        message: "fail to resend receipt email",
        data: []
      })
    }

    // try {
    //   await this.updateInvMsgLog(email, doc_no, 200, "response_message", result[0].send_id)
    // } catch (error) {
    //   throw error
    // }

    return ({
      statusCode: 200,
      message: "success resending email",
      date: []
    })
  }

  async resendEmailInv(doc_no: string, process_id: string, email: string) {
    console.log("resending invoice to email : " + email)
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_inv 
      WHERE doc_no = '${doc_no}'
      AND process_id = '${process_id}'
      `);

    if (!result || result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No record found',
        data: []
      });
    }

    const baseUrl = process.env.FTP_BASE_URL
    const upper_file_type = result[0].invoice_tipe.toUpperCase();
    const mailConfig = await this.getEmailConfig()
    const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)

    let attachment
    if (result[0].file_name_sign) {
      try {
        const response = await axios.get(`${baseUrl}/SIGNED/GQCINV/${upper_file_type}/${result[0].file_name_sign}`, { responseType: 'arraybuffer' });
        attachment = {
          filename: result[0].file_name_sign,
          content: Buffer.from(response.data),
        };
      } catch (error) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'fail to download signed file',
          data: []
        })
      }
    }
    let emailContent: Array<any>
    if (result[0].invoice_tipe === "schedule") {
      emailContent = await this.fjiDatabase.$queryRaw(Prisma.sql`
        SELECT * FROM mgr.v_ar_ledger_sch_inv_web
        WHERE entity_cd = ${result[0].entity_cd}
        AND project_no = ${result[0].project_no}
        AND debtor_acct = ${result[0].debtor_acct}
        AND doc_no = ${doc_no}
      `)
    }
    else if (result[0].invoice_tipe === "manual") {
      emailContent = await this.fjiDatabase.$queryRaw(Prisma.sql`
        SELECT * FROM mgr.v_ar_inv_entry_post_manual_web
        WHERE entity_cd = ${result[0].entity_cd}
        AND project_no = ${result[0].project_no}
        AND debtor_acct = ${result[0].debtor_acct}
        AND doc_no = ${doc_no}
      `)
    }
    else if (result[0].invoice_tipe === "proforma") {
      emailContent = await this.fjiDatabase.$queryRaw(Prisma.sql`
        SELECT * FROM mgr.v_ar_inv_proforma_web
        WHERE entity_cd = ${result[0].entity_cd}
        AND project_no = ${result[0].project_no}
        AND debtor_acct = ${result[0].debtor_acct}
        AND doc_no = ${doc_no}
      `)
    }

    const emailBody = {
      doc_no,
      debtor_name: emailContent[0].debtor_name || '',
      address1: emailContent[0].address1 || '',
      address2: emailContent[0].address2 || '',
      descs: emailContent[0].descs || '',
      descs_lot: emailContent[0].descs_lot || '',
      project_name: emailContent[0].project_name || '',
      start_date: emailContent[0].start_date || '',
      end_date: emailContent[0].end_date || '',
      due_date: emailContent[0].due_date || '',
    }
    const mailOptions: any = {
      from: `${mailConfig.data[0].sender_name} <${mailConfig.data[0].sender_email}>`,
      to: email,
      subject: `INVOICE ${doc_no}`,
      text: "Please find the attached invoice ",
      html: this.generateNewEmailTemplate(emailBody),
      attachments: [
        ...(result[0].file_name_sign
          ? [
            attachment,
          ]
          : [
            {
              filename: result[0].filenames,
              path: `${rootFolder}/${result[0].invoice_tipe}/${result[0].filenames}`,
            }
          ]),
        ...(result[0].filenames3
          ? [
            {
              filename: result[0].filenames3,
              path: `${rootFolder}/FAKTUR/${result[0].filenames3}`,
            },
          ]
          : []),
        ...(result[0].filenames4
          ? [
            {
              filename: result[0].filenames4,
              path: `${rootFolder}/${result[0].invoice_tipe}/${result[0].filenames4}`,
            },
          ]
          : []),
        ...(result[0].filenames5
          ? [
            {
              filename: result[0].filenames5,
              path: `${rootFolder}/extraFiles/${result[0].filenames5}`,
            },
          ]
          : []),
      ],
    };


    let send_status: string
    let status_code: number
    let response_message: string
    const send_date = moment().format('YYYYMMDD HH:mm:ss');
    try {
      const smtptransporter = await this.getSmtpTransporter()
      const info = await smtptransporter.sendMail(mailOptions);
      console.log(info)
      if (info.accepted.includes(email)) {
        send_status = 'S';
        status_code = 200;
        response_message = 'Email sent successfully';
      }
      else if (info.rejected.includes(email)) {
        send_status = 'F';
        status_code = 400;
        response_message = 'Email not accepted by server';
      }
    } catch (error) {
      console.log(error)
      send_status = 'F';
      status_code = 408;
      response_message = 'Email not accepted by server';
    }

    try {
      await this.updateInvMsgLog(email, doc_no, status_code, response_message, result[0].send_id)
    } catch (error) {
      throw error
    }

    return ({
      statusCode: status_code,
      message: response_message,
      date: []
    })
  }

  async resendEmailOr(doc_no: string, process_id: string, email: string) {
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_or WHERE doc_no = '${doc_no}'
      AND process_id = '${process_id}'
      `);

    if (!result || result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No record found',
        data: []
      });
    }

    const baseUrl = process.env.FTP_BASE_URL
    const mailConfig = await this.getEmailConfig()
    const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)

    let attachment
    if (result[0].file_name_sign) {
      try {
        const response = await axios.get(`${baseUrl}/SIGNED/GQCINV/RECEIPT/${result[0].file_name_sign}`, { responseType: 'arraybuffer' });
        attachment = {
          filename: result[0].file_name_sign,
          content: Buffer.from(response.data),
        };
      } catch (error) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'fail to download signed file',
          data: []
        })
      }
    }

    const emailContent: Array<any> = await this.fjiDatabase.$queryRaw(Prisma.sql`
        SELECT * FROM mgr.v_ar_ledger_gen_or_web
        WHERE entity_cd = ${result[0].entity_cd}
        AND project_no = ${result[0].project_no}
        AND debtor_acct = ${result[0].debtor_acct}
        AND doc_no = ${doc_no}
      `)

    const emailBody = {
      doc_no,
      debtor_name: emailContent[0].name || '',
      address1: emailContent[0].address1 || '',
      address2: emailContent[0].address2 || '',
      descs: emailContent[0].descs || '',
      project_name: emailContent[0].project_name || '',
      doc_date: emailContent[0].doc_date || '',
    }

    const mailOptions: any = {
      from: `${mailConfig.data[0].sender_name} <${mailConfig.data[0].sender_email}>`,
      to: email,
      subject: `OFFICIAL RECEIPT ${doc_no}`,
      text: "Please find the attached receipt ",
      html: this.generateNewEmailTemplateOr(emailBody),
      attachments: [
        ...(result[0].file_name_sign
          ? [
            attachment,
          ]
          : [
            {
              filename: result[0].filenames,
              path: `${rootFolder}/receipt/${result[0].filenames}`,
            }
          ]),
        ...(result[0].filenames2
          ? [
            {
              filename: result[0].filenames2,
              path: `${rootFolder}/extraFiles/${result[0].filenames2}`,
            },
          ]
          : []),
        ...(result[0].filenames3
          ? [
            {
              filename: result[0].filenames3,
              path: `${rootFolder}/FAKTUR/${result[0].filenames3}`,
            },
          ]
          : []),
      ],
    };


    let send_status: string
    let status_code: number
    let response_message: string
    const send_date = moment().format('YYYYMMDD HH:mm:ss');
    try {
      const smtptransporter = await this.getSmtpTransporter()
      const info = await smtptransporter.sendMail(mailOptions);
      if (info.accepted.includes(email)) {
        send_status = 'S';
        status_code = 200;
        response_message = 'Email sent successfully';
      }
      else if (info.rejected.includes(email)) {
        send_status = 'F';
        status_code = 400;
        response_message = 'Email not accepted by server';
      }
    } catch (error) {
      console.log(error)
      send_status = 'F';
      status_code = 408;
      response_message = 'Email not accepted by server';
    }

    try {
      await this.updateOrMsgLog(email, doc_no, status_code, response_message, result[0].send_id)
    } catch (error) {
      throw error
    }

    return ({
      statusCode: status_code,
      message: response_message,
      date: []
    })
  }

  async mailerSendCallbackInv(body: Record<any, any>) {
    const { type, data } = body;
    const { email: emailData, recipient, type: status } = data;
    const { id: recipientId, email: recipientEmail } = recipient;
    const { id: messageId } = emailData.message
    let statusCode = 200

    if (!status || status === 'soft_bounced' || status === 'hard_bounced') {
      statusCode = 400;
    }

    let firstSucceeded = false;
    let secondSucceeded = false;

    try {
      await this.fjiDatabase.$executeRaw(Prisma.sql`
        UPDATE ar_blast_inv_msg_log
          SET 
            response_message = ${status}, 
            statusCode = ${statusCode}, 
            audit_date = NOW()
          WHERE mailersend_id = ${messageId}
          AND email_addr = ${recipientEmail}
      `);
      firstSucceeded = true;
    } catch (error) {
      console.error("Failed to update ar_blast_inv_msg_log:", error);
    }

    try {
      await this.fjiDatabase.$executeRaw(Prisma.sql`
        UPDATE ar_blast_or_msg_log
          SET 
            response_message = ${status}, 
            statusCode = ${statusCode}, 
            audit_date = NOW()
          WHERE mailersend_id = ${messageId}
          AND email_addr = ${recipientEmail}
      `);
      secondSucceeded = true;
    } catch (error) {
      console.error("Failed to update ar_blast_or_msg_log:", error);
    }

    if (!firstSucceeded && !secondSucceeded) {
      throw new BadRequestException({
        statusCode: 400,
        message: "Fail to update msg_log"
      });
    }


    return {
      statusCode: 201,
      message: "status updated successfuly",
      data: []
    }
  }

  async mailerSendCallbackOr(body: Record<any, any>) {
    const { type, data } = body;
    const { email: emailData, recipient, type: status } = data;
    const { id: recipientId, email: recipientEmail } = recipient;
    const { id: messageId } = emailData.message
    let statusCode = 200

    if (!status || status === 'soft_bounced' || status === 'hard_bounced') {
      statusCode = 400;
    }

    try {
      const response = await this.fjiDatabase.$executeRaw(Prisma.sql`
          UPDATE ar_blast_or_msg_log
            SET 
              response_message = ${status}, 
              statusCode = ${statusCode}, 
              audit_date = NOW()
            WHERE mailersend_id = ${messageId}
            AND email_addr = ${recipientEmail}
        `)
    } catch (error) {
      console.log(error)
      throw new BadRequestException({
        statusCode: 400,
        message: "fail to update or_msg_log"
      })
    }

    return {
      statusCode: 201,
      message: "status updated successfuly",
      data: []
    }
  }

  async requestRegenerateInvoice(
    doc_no: string,
    process_id: string
  ) {
    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
        UPDATE mgr.ar_blast_inv SET send_status = 'R'
        WHERE doc_no = '${doc_no}'
        AND process_id = '${process_id}'
        `)
      if (result === 0) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Document not found or already rejected',
          data: []
        })
      }
      return ({
        statusCode: 200,
        message: 'Invoice cancelled successfully',
        data: []
      })
    } catch (error) {
      throw error
    }
  }
  async requestRegenerateReceipt(
    doc_no: string,
    process_id: string
  ) {
    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
        UPDATE mgr.ar_blast_or SET send_status = 'R'
        WHERE doc_no = '${doc_no}'
        AND process_id = '${process_id}'
        `)
      if (result === 0) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Document not found or already rejected',
          data: []
        })
      }
      return ({
        statusCode: 200,
        message: 'receipt cancelled successfully',
        data: []
      })
    } catch (error) {
      throw error
    }
  }

  async completeInvoice(body: Record<any,any>){
    const {doc_no, process_id} = body
    try {
      await this.fjiDatabase.$executeRaw(Prisma.sql`
        UPDATE mgr.ar_blast_inv 
          SET send_status = 'C'
        WHERE
          doc_no = ${doc_no}
          AND process_id = ${process_id}
        `)
    } catch (error) {
      throw new InternalServerErrorException({
        statusCode: 500,
        message: "fail to complete invoice",
        data: []
      })
    }

    return {
      statusCode: 200,
      message: "success completing invoice",
      data: []
    }
  }

  async completeReceipt(body: Record<any,any>){
    const {doc_no, process_id} = body
    try {
      await this.fjiDatabase.$executeRaw(Prisma.sql`
        UPDATE mgr.ar_blast_or 
          SET send_status = 'C'
        WHERE
          doc_no = ${doc_no}
          AND process_id = ${process_id}
        `)
    } catch (error) {
      throw new InternalServerErrorException({
        statusCode: 500,
        message: "fail to complete receipt",
        data: []
      })
    }
    return {
      statusCode: 200,
      message: "success completing receipt",
      data: []
    }
  }

  async updateArBlastInvTable(
    doc_no: string, send_date: string, send_status: string, send_id: string,
    entity_cd: string, project_no: string, debtor_acct: string, invoice_tipe: string,
    process_id: string
  ) {

    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
        UPDATE mgr.ar_blast_inv SET send_id = '${send_id}', send_date = '${send_date}',
        send_status = '${send_status}'
        WHERE
        entity_cd = '${entity_cd}'
        AND project_no = '${project_no}'
        AND debtor_acct = '${debtor_acct}'
        AND invoice_tipe = '${invoice_tipe}'
        AND doc_no = '${doc_no}'
        AND process_id = '${process_id}'
        `)


    } catch (error) {
      console.log(error)
      throw new BadRequestException({
        status: 400,
        message: 'Error updating ar_blast_inv table',
        data: []
      })
    }
  }
  async updateArBlastOrTable(
    doc_no: string, send_date: string, send_status: string, send_id: string,
    entity_cd: string, project_no: string, debtor_acct: string, invoice_tipe: string,
    process_id
  ) {
    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
        UPDATE mgr.ar_blast_or SET send_id = '${send_id}', send_date = '${send_date}',
        send_status = '${send_status}'
        WHERE
        entity_cd = '${entity_cd}'
        AND project_no = '${project_no}'
        AND debtor_acct = '${debtor_acct}'
        AND invoice_tipe = '${invoice_tipe}'
        AND doc_no = '${doc_no}'
        AND process_id = '${process_id}'
        `)

    } catch (error) {
      console.log(error)
      throw new BadRequestException({
        status: 400,
        message: 'Error updating ar_blast_or table',
        data: []
      })
    }
  }

  async insertToOrMsgLog(
    entity_cd: string, project_no: string, debtor_acct: string, email_addr: string,
    doc_no: string, status_code: number, response_message: string,
    send_id: string, audit_user: string, send_date: string
  ) {
    try {
      console.log(send_date)
      const result = await this.fjiDatabase.$executeRawUnsafe(`
        INSERT INTO mgr.ar_blast_or_log_msg
        (entity_cd, project_no, debtor_acct, email_addr, doc_no, status_code, response_message,
        send_date, send_id, audit_user, audit_date)
        VALUES
        ('${entity_cd}', '${project_no}', '${debtor_acct}', '${email_addr}',
        '${doc_no}', ${status_code}, '${response_message}', '${send_date}', '${send_id}',
        '${audit_user}', GETDATE())
        `)
      if (result === 0) {
        throw new BadRequestException({
          status: 400,
          message: 'Failed to insert to mgr.ar_blast_or_log_msg table',
          data: []
        })
      }
    } catch (error) {
      console.log(error)
      if (error instanceof BadRequestException) {
        throw error;
      }
    }
  }
  async insertToInvMsgLog(
    entity_cd: string, project_no: string, debtor_acct: string, email_addr: string,
    doc_no: string, status_code: number, response_message: string,
    send_id: string, audit_user: string, audit_date: string, send_date: string
  ) {
    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
        INSERT INTO mgr.ar_blast_inv_log_msg
        (entity_cd, project_no, debtor_acct, email_addr, doc_no, status_code, response_message,
        send_date, send_id, audit_user, audit_date)
        VALUES
        ('${entity_cd}', '${project_no}', '${debtor_acct}', '${email_addr}',
        '${doc_no}', ${status_code}, '${response_message}', GETDATE(), '${send_id}',
        '${audit_user}', GETDATE())
        `)
      if (result === 0) {
        throw new BadRequestException({
          status: 400,
          message: 'Failed to insert to mgr.ar_blast_inv_log_msg table',
          data: []
        })
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
    }
  }

  async updateOrMsgLog(
    email_addr: string, doc_no: string, status_code: number,
    response_message: string, send_id: string
  ) {
    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
        UPDATE mgr.ar_blast_or_log_msg
          SET 
            status_code = '${status_code}', audit_date = GETDATE(),
            response_message = '${response_message}', send_date = GETDATE()
          WHERE
            email_addr = '${email_addr}'
            AND doc_no = '${doc_no}'
            AND send_id = '${send_id}'
        `)
      if (result === 0) {
        throw new BadRequestException({
          status: 400,
          message: 'Failed to update mgr.ar_blast_inv_log_msg table',
          data: []
        })
      }
      const failedSent: Array<{ count: number }> = await this.fjiDatabase.$queryRawUnsafe(`
        SELECT COUNT(doc_no) as count from mgr.ar_blast_or_log_msg 
          where doc_no = '${doc_no}'
          AND status_code <> 200
          AND send_id = '${send_id}'
        `)

      if (failedSent[0].count === 0) {
        await this.fjiDatabase.$executeRawUnsafe(`
          UPDATE mgr.ar_blast_or SET send_status = 'S'
          WHERE doc_no = '${doc_no}'
          AND send_id = '${send_id}'
        `)
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
    }
  }
  async updateInvMsgLog(
    email_addr: string, doc_no: string, status_code: number,
    response_message: string, send_id: string
  ) {
    console.log("updating inv_msg_log : " + response_message)
    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
        UPDATE mgr.ar_blast_inv_log_msg
          SET 
            status_code = '${status_code}', audit_date = GETDATE(),
            response_message = '${response_message}', send_date = GETDATE()
          WHERE
            email_addr = '${email_addr}'
            AND doc_no = '${doc_no}'
            AND send_id = '${send_id}'
        `)
      if (result === 0) {
        throw new BadRequestException({
          status: 400,
          message: 'Failed to update mgr.ar_blast_inv_log_msg table',
          data: []
        })
      }

      const failedSent: Array<{ count: number }> = await this.fjiDatabase.$queryRawUnsafe(`
        SELECT COUNT(doc_no) as count from mgr.ar_blast_inv_log_msg 
          where doc_no = '${doc_no}'
          AND status_code <> 200
          AND send_id = '${send_id}'
        `)

      if (failedSent[0].count === 0) {
        await this.fjiDatabase.$executeRawUnsafe(`
          UPDATE mgr.ar_blast_inv SET send_status = 'S'
          WHERE doc_no = '${doc_no}'
          AND send_id = '${send_id}'
        `)
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
    }
  }

  async updateEmailConfig(data: Record<any, any>) {
    console.log(data)
    const {
      driver, host, port, username, password,
      encryption, sender_name, sender_email, audit_user
    } = data


    try {
      const encryptedPassword = this.encrypt(password)
      const prevConfig: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
        SELECT * FROM mgr.email_configuration
        `)
      if (prevConfig.length > 0) {
        const result = await this.fjiDatabase.$executeRawUnsafe(`
          UPDATE mgr.email_configuration 
          SET 
          driver = '${driver}', host = '${host}', port = '${port}',
          username = '${username}', password = '${encryptedPassword}', encryption = '${encryption}',
          sender_name = '${sender_name}', sender_email = '${sender_email}',
          audit_user = '${audit_user}', audit_date = GETDATE()
          `)
        if (result === 0) {
          throw new BadRequestException({
            status: 400,
            message: 'Failed to update email configuration',
            data: []
          })
        }
      } else {
        const result = await this.fjiDatabase.$executeRawUnsafe(`
          INSERT INTO mgr.email_configuration
          (driver, host, port, username, password, encryption, sender_name, sender_email,
          audit_user, audit_date)
          VALUES
          ('${driver}', '${host}', '${port}', '${username}', '${encryptedPassword}', '${encryption}', 
           '${sender_name}', '${sender_email}', '${audit_user}', GETDATE())
          `)
        if (result === 0) {
          throw new BadRequestException({
            status: 400,
            message: 'Failed to insert to mgr.email_configuration table',
            data: []
          })
        }
      }
    } catch (error) {
      console.log(error)
      throw new BadRequestException(error.response)
    }

    return ({
      statusCode: 200,
      message: 'Email configuration updated successfully',
      data: []
    })
  }

  async getEmailConfig() {
    try {
      const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
        SELECT * FROM mgr.email_configuration
        `)
      if (result.length > 0) {
        result[0].password = this.decrypt(result[0].password);
      }
      return ({
        statusCode: 200,
        message: 'succesfully get email configuration',
        data: result
      })
    } catch (error) {
      throw new NotFoundException({
        status: 404,
        message: 'Email configuration not found',
        data: []
      })
    }

  }

  async getBase64FromUrl(url: string): Promise<string> {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data).toString('base64');
  }

  async buildAttachments(result: any): Promise<{ filename: string, content: string }[]> {
    const attachments: { filename: string, content: string }[] = [];
    const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
    const baseUrl = process.env.FTP_BASE_URL
    const upper_file_type = result[0].invoice_tipe.toUpperCase();
    // Main attachment (signed file or local fallback)
    if (result.file_name_sign) {
      const url = `${baseUrl}/SIGNED/GQCINV/${upper_file_type}/${result.file_name_sign}`;
      const content = await this.getBase64FromUrl(url);

      attachments.push({
        filename: result.file_name_sign,
        content,
      });
    } else if (result.filenames) {
      const pathToFile = path.resolve(
        `${rootFolder}/${result.invoice_tipe}/${result.filenames}`
      );
      const content = fs.readFileSync(pathToFile).toString('base64');

      attachments.push({
        filename: result.filenames,
        content,
      });
    }

    // Optional: filenames2
    if (result.filenames2) {
      const pathToFile = path.resolve(`${rootFolder}/extraFiles/${result.filenames2}`);
      const content = fs.readFileSync(pathToFile).toString('base64');

      attachments.push({
        filename: result.filenames2,
        content,
      });
    }

    // Optional: filenames3
    if (result.filenames3) {
      const pathToFile = path.resolve(`${rootFolder}/FAKTUR/${result.filenames3}`);
      const content = fs.readFileSync(pathToFile).toString('base64');

      attachments.push({
        filename: result.filenames3,
        content,
      });
    }

    return attachments;
  }

}