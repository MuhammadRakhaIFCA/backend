import { BadRequestException, Injectable, NotFoundException, RequestTimeoutException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer'
import { CreateMailDto } from './dto/create-mail.dto';
import { UpdateMailDto } from './dto/update-mail.dto';
import * as nodemailer from 'nodemailer'
import { ConfigService } from '@nestjs/config';
import ical from 'ical-generator';
import { FjiDatabaseService } from 'src/database/database-fji.service';
import * as moment from 'moment'

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

  private smtptransporter = nodemailer.createTransport({
    host: 'smtp.mailersend.net',
    // host: 'smtp.gmail.com',  // SMTP server
    port: 587,               // Port number
    secure: false,           // Use TLS (false for port 587)
    auth: {
      user: 'MS_S5HjWQ@ifca.co.id',
      pass: 'spnk1sLn4Z81k7Ec'
      // user: process.env.MAIL_USER,
      // pass: process.env.MAIL_PASSWORD
    },

  });
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
      from: 'Ноде Майлер <foobar@example.com>',
      to,
      subject,
      text,
      html: '<p>For clients that do not support AMP4EMAIL or amp content is not valid</p>',
      attachments,

    };

    if (cc && cc.length > 0) mailOptions.cc = cc;
    if (bcc && bcc.length > 0) mailOptions.bcc = bcc;

    try {
      await this.transporter.sendMail(mailOptions);
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
      await this.smtptransporter.sendMail({
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

  async blastEmail(doc_no: string) {
    const send_id = Array(6)
      .fill(null)
      .map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26)))
      .join('');

    // Fetch the record for the given doc_no
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_inv WHERE doc_no = '${doc_no}'
    `);

    if (!result || result.length === 0) {
      throw new Error(`No record found for doc_no: ${doc_no}`);
    }

    // Split the email_addr column into an array of strings
    const email_addrs = result[0].email_addr
      ? result[0].email_addr.split(';').map((email: string) => email.trim())
      : [];

    const send_status = 'S';
    const status_code = 200;
    const response_message = "email sent successfully";
    const send_date = moment().format('YYYYMMDD');

    // Update the ar_blast_inv table
    await this.updateArBlastTable(
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
      await this.insertToMsgLog(
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
        result[0].audit_date
      );
    }
  }


  async updateArBlastTable(
    doc_no: string, send_date: string, send_status: string, send_id: string,
    entity_cd: string, project_no: string, debtor_acct: string, invoice_tipe: string
  ) {

    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
        UPDATE mgr.ar_blast_inv SET send_id = '${send_id}', send_date = '${send_date}',
        send_status = '${send_status}'
        WHERE
        entity_cd = '${entity_cd}',
        project_no = '${project_no}',
        debtor_acct = '${debtor_acct}',
        invoice_tipe = '${invoice_tipe}',
        doc_no = '${doc_no}'
        `)


    } catch (error) {

    }
  }

  async insertToMsgLog(
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
        '${audit_user}', '${audit_date}'
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
      const prevConfig: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
        SELECT * FROM mgr.email_configuration
        `)
      if (prevConfig.length > 0) {
        const result = await this.fjiDatabase.$executeRawUnsafe(`
          UPDATE mgr.email_configuration 
          SET 
          driver = '${driver}', host = '${host}', port = '${port}',
          username = '${username}', password = '${password}', encryption = '${encryption}',
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
          ('${driver}', '${host}', '${port}', '${username}', '${password}', '${encryption}', 
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