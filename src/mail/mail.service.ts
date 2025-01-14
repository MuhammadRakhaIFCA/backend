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

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly fjiDatabase: FjiDatabaseService) {
    // Initialize the transporter
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD
      },
    });
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

  private generateEmailTemplate(
    senderName: string,
    senderEmail: string,
    recipientEmail: string,
    invoiceNumber: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
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
              <h1>Invoice from ${senderName}</h1>
            </div>
            <div class="email-body">
              <p>Dear ${recipientEmail},</p>
              <p>Thank you for your business. Please find the attached invoice for your reference.</p>
              <p><strong>Invoice Number:</strong> #${invoiceNumber}</p>
              <p>If you have any questions, feel free to contact us at <a href="mailto:${senderEmail}">${senderEmail}</a>.</p>
              <p>Best regards,<br>${senderName}</p>
            </div>
            <div class="email-footer">
              <p>&copy; ${new Date().getFullYear()} ${senderName}. All rights reserved.</p>
              <p><a href="#">Unsubscribe</a> | <a href="#">Privacy Policy</a></p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private async getSmtpTransporter(): Promise<any> {
    const mailConfig = await this.getEmailConfig();
    const decryptedPassword = this.decrypt(mailConfig.data[0].password)
    return nodemailer.createTransport({
      host: mailConfig.data[0].host, // SMTP server
      port: mailConfig.data[0].port, // Port number
      secure: false, // Use TLS (false for port 587)
      auth: {
        user: mailConfig.data[0].username,
        pass: decryptedPassword,
      },
    });
  }
  // private async smtptransporter = nodemailer.createTransport({
  //   host: await this.getEmailConfig.data.host,
  //   // host: 'smtp.gmail.com',  // SMTP server
  //   port: this.mailConfig[0].port,               // Port number
  //   secure: false,           // Use TLS (false for port 587)
  //   auth: {
  //     user: this.mailConfig[0].username,
  //     pass: this.mailConfig[0].password
  //     // user: process.env.MAIL_USER,
  //     // pass: process.env.MAIL_PASSWORD
  //   },

  // });
  // async sendMail() {
  //   await this.mailerService.sendMail({
  //     to: "muhammadrakha3995@email.com",
  //     from: process.env.MAIL_USER,
  //     subject: 'Welcome to Nice App! Confirm your Email',
  //     template: './confirmation', // `.hbs` extension is appended automatically
  //     context: { // ✏️ filling curly brackets with content
  //       name: "user",
  //       url: "example.com/auth/confirm",
  //     },
  //   });
  // }

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

  private message = {
    from: process.env.MAIL_USER,
    to: 'muhammadrakha3995@gmail.com',
    subject: 'List Message',
    text: 'I hope no-one unsubscribes from this list!',
    list: {
      // List-Help: <mailto:admin@example.com?subject=help>
      help: 'admin@example.com?subject=help',
      // List-Unsubscribe: <http://example.com> (Comment)
      unsubscribe: {
        url: 'http://example.com',
        comment: 'Comment'
      },
      // List-Subscribe: <mailto:admin@example.com?subject=subscribe>
      // List-Subscribe: <http://example.com> (Subscribe)
      subscribe: [
        'admin@example.com?subject=subscribe',
        {
          url: 'http://example.com',
          comment: 'Subscribe'
        }
      ],
      // List-Post: <http://example.com/post>, <mailto:admin@example.com?subject=post> (Post)
      post: [
        [
          'http://example.com/post',
          {
            url: 'admin@example.com?subject=post',
            comment: 'Post'
          }
        ]
      ]
    }
  }



  private generateIcalEvent(
    organizer: { name: string, email: string },
    attendeesList: Array<{ name: string, email: string }>,
    startDate: Date,
    endDate: Date
  ): string {
    const calendar = ical({ name: 'My Calendar' });

    // Add an event to the calendar
    calendar.createEvent({
      start: new Date(startDate),
      end: new Date(endDate),
      // start: new Date('2024-12-03T10:00:00'), 
      // end: new Date('2024-12-03T12:00:00'),   
      summary: 'Team Meeting',
      description: 'Discuss project updates',
      location: 'Zoom',
      organizer: { name: organizer.name, email: organizer.email },
      attendees: attendeesList.map((attendee) => ({
        name: attendee.name,
        email: attendee.email,
      })),
    });

    return calendar.toString();
  }


  async sendEmailEvent(
    to: string,
    subject: string,
    text: string,
    startDate: Date,
    endDate: Date,
    html?: string,
    attachments?: Array<{ filename: string; path: string }>,
  ) {
    try {
      //await this.smtptransporter.sendMail(this.message);
      const content = this.generateIcalEvent(
        {
          name: 'Rakha',
          email: process.env.MAIL_USER,
        },
        [
          {
            name: 'John',
            email: 'john@example.com',
          },
          {
            name: 'Jane',
            email: 'jane@example.com',
          }
        ],
        startDate,
        endDate
      );
      const smtptransporter = await this.getSmtpTransporter()
      await smtptransporter.sendMail({
        from: {
          name: "custom name",
          address: "user1@gmail.com",
        },
        replyTo: `"User1" <user1@gmail.com>`,
        to,
        subject,
        text,
        html,
        attachments,
        icalEvent: {
          filename: 'invitation.ics',
          method: 'request', // 'request' for inviting attendees
          content,           // iCal content
        },
      });
      return ({
        statusCode: 201,
        message: 'Email sent successfully',
        data: []
      })
    } catch (error) {
      throw new RequestTimeoutException({
        statusCode: 408,
        message: 'failed to send email',
        data: []
      })
    }
  }

  async blastEmailOr(doc_no: string) {

    const send_id = Array(6)
      .fill(null)
      .map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26)))
      .join('');

    // Fetch the record for the given doc_no
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_or WHERE doc_no = '${doc_no}'
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

    const mailConfig = await this.getEmailConfig()
    const rootFolder = process.env.ROOT_PDF_FOLDER

    const mailOptions: any = {
      from: `${mailConfig.data[0].sender_name} <${mailConfig.data[0].sender_email}>`,
      to: result[0].email_addr,
      subject: `OR ${doc_no}`,
      text: "Please find the attached invoice.", // Fallback for plain text clients
      html: this.generateEmailTemplate(
        mailConfig.data[0].sender_name,
        mailConfig.data[0].sender_email,
        result[0].email_addr,
        result[0].doc_no,
      ),
      attachments: [
        {
          filename: result[0].filenames,
          path: `${rootFolder}receipt/${result[0].filenames}`,
        },
        ...(result[0].filenames3
          ? [
            {
              filename: result[0].filenames3,
              path: `${rootFolder}FAKTUR/${result[0].filenames3}`,
            },
          ]
          : []),
      ],
    };


    let send_status: string
    let status_code: number
    let response_message: string
    const send_date = moment().format('YYYYMMDD');
    try {
      const smtptransporter = await this.getSmtpTransporter()
      const info = await smtptransporter.sendMail(mailOptions);
      if (info.accepted.includes(result[0].email_addr)) {
        send_status = 'S';
        status_code = 200;
        response_message = 'Email sent successfully';
      }
      else if (info.pending.includes(result[0].email_addr)) {
        send_status = 'P';
        status_code = 202;
        response_message = 'Email is pending';
      }
      else if (info.rejected.includes(result[0].email_addr)) {
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

    // Update the ar_blast_inv table
    await this.updateArBlastOrTable(
      doc_no,
      moment().format('YYYYMMDD'),
      send_status,
      send_id,
      result[0].entity_cd,
      result[0].project_no,
      result[0].debtor_acct,
      result[0].invoice_tipe
    );

    if (status_code === 408) {
      throw new RequestTimeoutException({
        statusCode: 408,
        message: 'failed to send email',
        data: []
      })
    }

    // Loop through email_addrs and call insertToMsgLog for each email
    for (const email of email_addrs) {
      console.log(email)
      await this.insertToOrMsgLog(
        result[0].entity_cd,
        result[0].project_no,
        result[0].debtor_acct,
        email, // Use the current email from the array
        doc_no,
        status_code,
        response_message,
        send_date,
        send_id,
        result[0].audit_user,
        moment(result[0].audit_date).format('YYYYMMDD')
      );
    }

    return {
      statusCode: 200,
      message: "blast email successful",
      data: result[0]
    }
  }
  async blastEmailInv(doc_no: string) {
    const send_id = Array(6)
      .fill(null)
      .map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26)))
      .join('');

    // Fetch the record for the given doc_no
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_inv WHERE doc_no = '${doc_no}'
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

    const mailConfig = await this.getEmailConfig()
    const rootFolder = process.env.ROOT_PDF_FOLDER

    const mailOptions: any = {
      from: `${mailConfig.data[0].sender_name} <${mailConfig.data[0].sender_email}>`,
      to: result[0].email_addr,
      subject: `invoice ${doc_no}`,
      text: "text",
      html: this.generateEmailTemplate(
        mailConfig.data[0].sender_name,
        mailConfig.data[0].sender_email,
        result[0].email_addr,
        result[0].doc_no,
      ),
      attachments: [
        {
          filename: result[0].filenames,
          path: `${rootFolder}${result[0].invoice_tipe}/${result[0].filenames}`,
        },
        ...(result[0].filenames2
          ? [
            {
              filename: result[0].filenames2,
              path: `${rootFolder}${result[0].invoice_tipe}/${result[0].filenames2}`,
            },
          ]
          : []),
        ...(result[0].filenames3
          ? [
            {
              filename: result[0].filenames3,
              path: `${rootFolder}FAKTUR/${result[0].filenames3}`,
            },
          ]
          : []),
      ],
    };

    let send_status: string
    let status_code: number
    let response_message: string
    const send_date = moment().format('YYYYMMDD');
    try {
      const smtptransporter = await this.getSmtpTransporter()
      const info = await smtptransporter.sendMail(mailOptions);
      if (info.accepted.includes(result[0].email_addr)) {
        send_status = 'S';
        status_code = 200;
        response_message = 'Email sent successfully';
      }
      else if (info.pending.includes(result[0].email_addr)) {
        send_status = 'P';
        status_code = 202;
        response_message = 'Email is pending';
      }
      else if (info.rejected.includes(result[0].email_addr)) {
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

    // Update the ar_blast_inv table
    await this.updateArBlastInvTable(
      doc_no,
      moment().format('YYYYMMDD'),
      send_status,
      send_id,
      result[0].entity_cd,
      result[0].project_no,
      result[0].debtor_acct,
      result[0].invoice_tipe
    );

    // Loop through email_addrs and call insertToMsgLog for each email
    for (const email of email_addrs) {
      await this.insertToInvMsgLog(
        result[0].entity_cd,
        result[0].project_no,
        result[0].debtor_acct,
        email, // Use the current email from the array
        doc_no,
        status_code,
        response_message,
        send_date,
        send_id,
        result[0].audit_user,
        moment(result[0].audit_date).format('YYYYMMDD')
      );
    }
    return {
      statusCode: 200,
      message: "blast email successful",
      data: result[0]
    }
  }


  async updateArBlastInvTable(
    doc_no: string, send_date: string, send_status: string, send_id: string,
    entity_cd: string, project_no: string, debtor_acct: string, invoice_tipe: string
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
    entity_cd: string, project_no: string, debtor_acct: string, invoice_tipe: string
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
    send_date: string, send_id: string, audit_user: string, audit_date: string
  ) {
    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
        INSERT INTO mgr.ar_blast_or_log_msg
        (entity_cd, project_no, debtor_acct, email_addr, doc_no, status_code, response_message,
        send_date, send_id, audit_user, audit_date)
        VALUES
        ('${entity_cd}', '${project_no}', '${debtor_acct}', '${email_addr}',
        '${doc_no}', ${status_code}, '${response_message}', '${send_date}', '${send_id}',
        '${audit_user}', '${audit_date}')
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
    send_date: string, send_id: string, audit_user: string, audit_date: string
  ) {
    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
        INSERT INTO mgr.ar_blast_inv_log_msg
        (entity_cd, project_no, debtor_acct, email_addr, doc_no, status_code, response_message,
        send_date, send_id, audit_user, audit_date)
        VALUES
        ('${entity_cd}', '${project_no}', '${debtor_acct}', '${email_addr}',
        '${doc_no}', ${status_code}, '${response_message}', '${send_date}', '${send_id}',
        '${audit_user}', '${audit_date}')
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
      const result = await this.fjiDatabase.$queryRawUnsafe(`
        SELECT * FROM mgr.email_configuration
        `)
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
}