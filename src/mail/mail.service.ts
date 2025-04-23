import { BadRequestException, Injectable, NotFoundException, RequestTimeoutException } from '@nestjs/common';
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
  
    // Split the email_addr column into an array of strings
    const email_addrs = result[0].email_addr
      ? result[0].email_addr.split(';').map((email: string) => email.trim())
      : [];
  
    const mailConfig = await this.getEmailConfig();
    const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
    const upper_file_type = result[0].invoice_tipe.toUpperCase();
  
    const attachments = await this.buildAttachments(result[0]);
    
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

    // Now loop through using an index to update the existing values
    for (let i = 0; i < email_addrs.length; i++) {
      const email = email_addrs[i];
      const mailOptions = {
        ...baseMailOptions,
        to: email,
        html: this.generateInvoiceTemplate(
          mailConfig.data[0].sender_name,
          mailConfig.data[0].sender_email,
          email, // use the individual email address here
          result[0].doc_no,
          'Receipt'
        ),
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

    // Now loop through using an index to update the existing values
    for (let i = 0; i < email_addrs.length; i++) {
      const email = email_addrs[i];
      const mailOptions = {
        ...baseMailOptions,
        to: email,
        html: this.generateInvoiceTemplate(
          mailConfig.data[0].sender_name,
          mailConfig.data[0].sender_email,
          email, // use the individual email address here
          result[0].doc_no,
          'Invoice'
        ),
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

  async resendEmailInv(doc_no:string, process_id:string, email:string){
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

    const mailOptions: any = {
      from: `${mailConfig.data[0].sender_name} <${mailConfig.data[0].sender_email}>`,
      to: email,
      subject: `INVOICE ${doc_no}`,
      text: "Please find the attached invoice ",
      html: this.generateInvoiceTemplate(
        mailConfig.data[0].sender_name,
        mailConfig.data[0].sender_email,
        result[0].email_addr,
        result[0].doc_no,
        'Invoice'
      ),
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

    return({
      statusCode: status_code,
      message: response_message,
      date:[]
    })
  }
  
  async resendEmailOr(doc_no:string, process_id:string, email:string){
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

    const mailOptions: any = {
      from: `${mailConfig.data[0].sender_name} <${mailConfig.data[0].sender_email}>`,
      to: email,
      subject: `OFFICIAL RECEIPT ${doc_no}`,
      text: "Please find the attached receipt ",
      html: this.generateInvoiceTemplate(
        mailConfig.data[0].sender_name,
        mailConfig.data[0].sender_email,
        result[0].email_addr,
        result[0].doc_no,
        'Receipt'
      ),
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

    return({
      statusCode: status_code,
      message: response_message,
      date:[]
    })
  }

  async requestRegenerateInvoice(
    doc_no:string,
    process_id:string
  ){
    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
        UPDATE mgr.ar_blast_inv SET send_status = 'R'
        WHERE doc_no = '${doc_no}'
        AND process_id = '${process_id}'
        `)
      if (result === 0){
        throw new BadRequestException({
          statusCode: 400,
          message: 'Document not found or already rejected',
          data : []
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
    doc_no:string,
    process_id:string
  ){
    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
        UPDATE mgr.ar_blast_or SET send_status = 'R'
        WHERE doc_no = '${doc_no}'
        AND process_id = '${process_id}'
        `)
      if (result === 0){
        throw new BadRequestException({
          statusCode: 400,
          message: 'Document not found or already rejected',
          data : []
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
      const failedSent:Array<{ count: number }> = await this.fjiDatabase.$queryRawUnsafe(`
        SELECT COUNT(doc_no) as count from mgr.ar_blast_or_log_msg 
          where doc_no = '${doc_no}'
          AND status_code <> 200
          AND send_id = '${send_id}'
        `)

      if (failedSent[0].count === 0){
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

      const failedSent:Array<{ count: number }> = await this.fjiDatabase.$queryRawUnsafe(`
        SELECT COUNT(doc_no) as count from mgr.ar_blast_inv_log_msg 
          where doc_no = '${doc_no}'
          AND status_code <> 200
          AND send_id = '${send_id}'
        `)

      if (failedSent[0].count === 0){
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
      const result:Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
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