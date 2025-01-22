import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as moment from 'moment';
// import { SqlserverDatabaseService } from 'src/database/database-sqlserver.service';
import { PdfgenerateService } from 'src/pdfgenerate/pdfgenerate.service';
import { generateDto } from './dto/generate.dto';
import * as ftp from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';
import { FjiDatabaseService } from 'src/database/database-fji.service';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import * as AdmZip from 'adm-zip';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ApiInvoiceService {
  private client: ftp.Client;
  constructor(
    //private readonly sqlserver: SqlserverDatabaseService,
    private readonly fjiDatabase: FjiDatabaseService,
    private readonly httpService: HttpService,
    private readonly pdfService: PdfgenerateService,
  ) {
    this.client = new ftp.Client();
    this.client.ftp.verbose = true;
  }
  async connect(): Promise<void> {
    console.log(this.client.closed);
    if (this.client.closed) {
      console.log('Reconnecting to FTP server...');
      await this.client.access({
        host: process.env.FTP_HOST,
        user: process.env.FTP_USERNAME,
        password: process.env.FTP_PASSWORD,
        secure: false,
        port: 21,
      });
    }
    console.log('Connected to FTP server.');
  }
  async download(remoteFilePath: string, localFilePath: string): Promise<void> {
    try {
      await this.client.downloadTo(localFilePath, remoteFilePath);
      console.log('File downloaded successfully');
    } catch (error) {
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }
  async upload(localFilePath: string, remoteFilePath: string): Promise<void> {
    try {
      if (!fs.existsSync(localFilePath)) {
        throw new Error(`Local file does not exist: ${localFilePath}`);
      }
      const remoteDirPath = path.dirname(remoteFilePath);
      await this.client.ensureDir(remoteDirPath);
      await this.client.uploadFrom(localFilePath, remoteFilePath);
      console.log('File uploaded successfully');
    } catch (error) {
      throw new Error(`Failed to upload file: ${error.message}`);
      throw new BadRequestException(error);
    }
  }

  async disconnect() {
    try {
      this.client.close();
      console.log('Disconnected from FTP server');
    } catch (err) {
      console.error('Failed to disconnect', err);
      throw err;
    }
  }
  async getInvoice() {
    try {
      const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT abia.*, debtor_name = name FROM mgr.ar_blast_inv abia 
                INNER JOIN mgr.ar_debtor ad 
                ON abia.debtor_acct = ad.debtor_acct
                AND abia.entity_cd = ad.entity_cd
                AND abia.project_no = ad.project_no
                WHERE doc_amt <= 5000000
                AND file_status_sign IS NULL
                AND send_id IS NULL
               OR (doc_amt >= 5000000 AND status_process_sign IN ('N', null) AND send_id IS NULL)
               OR (doc_amt >= 5000000 AND file_status_sign IN ('S') AND send_id IS NULL)

                `);
      if (!result || result.length === 0) {
        throw new NotFoundException({
          statusCode: 404,
          message: 'No invoice yet',
          data: [],
        });
      }

      return {
        statusCode: 200,
        message: 'invoice retrieved successfully',
        data: result,
      };
    } catch (error) {
      throw new NotFoundException(error.response);
    }
  }

  async getInvoiceDetail(doc_no: string) {
    try {
      const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT abia.*, debtor_name = name FROM mgr.ar_blast_inv abia 
                INNER JOIN mgr.ar_debtor ad 
                ON abia.debtor_acct = ad.debtor_acct
                AND abia.entity_cd = ad.entity_cd
                AND abia.project_no = ad.project_no
                WHERE send_id IS NULL
                AND doc_no = '${doc_no}'
            `);
      if (!result || result.length === 0) {
        throw new NotFoundException({
          statusCode: 404,
          message: 'No invoice yet',
          data: [],
        });
      }
      return {
        statusCode: 200,
        message: 'invoice detail retrieved successfully',
        data: result,
      };
    } catch (error) {
      throw new NotFoundException(error.response);
    }
  }

  async getHistory(data: Record<any, any>) {
    const { startDate, endDate, status } = data;
    try {
      const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT abia.*, debtor_name = name FROM mgr.ar_blast_inv abia 
                INNER JOIN mgr.ar_debtor ad 
                ON abia.debtor_acct = ad.debtor_acct
                AND abia.entity_cd = ad.entity_cd
                AND abia.project_no = ad.project_no
                WHERE send_id IS NOT NULL 
                AND year(send_date)*10000+month(send_date)*100+day(send_date) >= '${startDate}' 
                AND year(send_date)*10000+month(send_date)*100+day(send_date) <= '${endDate}'
                AND send_status = '${status}'
                ORDER BY send_date DESC
            `);
      if (!result || result.length === 0) {
        throw new NotFoundException({
          statusCode: 404,
          message: 'No history yet',
          data: [],
        });
      }
      return {
        statusCode: 200,
        message: 'history retrieved successfully',
        data: result,
      };
    } catch (error) {
      throw new NotFoundException(error.response);
    }
  }

  async getHistoryDetail(email_addr: string, doc_no: string) {
    try {
      const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT abia.*, debtor_name = name FROM mgr.ar_blast_inv abia 
                INNER JOIN mgr.ar_debtor ad 
                ON abia.debtor_acct = ad.debtor_acct
                AND abia.entity_cd = ad.entity_cd
                AND abia.project_no = ad.project_no
                WHERE doc_no = '${doc_no}'
                AND email_addr LIKE '%${email_addr}%'
            `);
      if (!result || result.length === 0) {
        throw new NotFoundException({
          statusCode: 404,
          message: 'history not found',
          data: [],
        });
      }
      return {
        statusCode: 200,
        message: 'detail retrieved successfully',
        data: result,
      };
    } catch (error) {
      throw new NotFoundException(error.response);
    }
  }

  async generateSchedule(
    doc_no: string,
    bill_type: string,
    meter_type: string,
    name: string,
    related_class: string,
  ) {
    if (
      this.isEmpty(doc_no) ||
      this.isEmpty(name) ||
      this.isEmpty(related_class)
    ) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'doc_no, name and related_class must be filled',
        data: [],
      });
    }
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            select * from mgr.v_ar_ledger_sch_inv_web 
            where doc_no = '${doc_no}' 
            and bill_type = '${bill_type}'
            `);
    if (result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'invoice data not found',
        data: [],
      });
    }
    const pdfBody = {
      debtor_acct: result[0].debtor_acct,
      debtor_name: result[0].debtor_name,
      address1: result[0].address1,
      address2: result[0].address2,
      address3: result[0].address3,
      post_cd: result[0].post_cd,
      trx_type: result[0].trx_type,
      doc_no: doc_no,
      doc_date: result[0].doc_date,
      due_date: result[0].due_date,
      descs: result[0].descs,
      descs_lot: result[0]?.descs_lot || '',
      descs_info: result[0]?.notes,
      start_date: result[0].start_date,
      end_date: result[0].end_date,
      currency_cd: result[0].currency_cd,
      base_amt: result[0].base_amt,
      tax_amt: result[0].tax_amt,
      tax_scheme: result[0].tax_shceme,
      tax_rate: result[0].tax_rate,
      pph_rate: result[0].pph_rate,
      line1: result[0]?.line1 || '-',
      signature: result[0].signature,
      designation: result[0].designation,
      bank_name_rp: result[0].bank_name_rp,
      bank_name_usd: result[0].bank_name_usd || '',
      account_rp: result[0].account_rp,
      account_usd: result[0]?.account_usd || '',
      alloc_amt: result[0]?.alloc_amt,
      notes: result[0].notes,
      sequence_no: result[0].sequence_no,
      group_cd: result[0].group_cd,
      inv_group: result[0].inv_group,
      bill_type,
      meter_type,
      formid: result[0].formid,
      type: "schedule"
    };

    try {
      await this.pdfService.generatePdfSchedule(pdfBody);
      let filenames = `${doc_no}.pdf`;
      let filenames2 = '';
      if (bill_type === 'E' && meter_type === 'G') {
        await this.pdfService.generateReferenceG(
          doc_no,
          result[0].debtor_acct,
          result[0].doc_date,
        );
        filenames2 = `fji_reference_g_${doc_no}.pdf`;
      } else if (bill_type === 'V') {
        await this.pdfService.generateReferenceV(
          doc_no,
          result[0].debtor_acct,
          result[0].doc_date,
          result[0].project_no,
          result[0].entity_cd
        );
        filenames2 = `fji_reference_v_${doc_no}.pdf`;
      } else if (bill_type === 'E' && meter_type === 'W') {
        await this.pdfService.generateReferenceW(
          doc_no,
          result[0].debtor_acct,
          result[0].doc_date,
        );
        filenames2 = `fji_reference_w_${doc_no}.pdf`;
      } else if (bill_type === 'E' && meter_type === 'E') {
        await this.pdfService.generateReferenceE(
          doc_no,
          result[0].debtor_acct,
          result[0].doc_date,
        );
        filenames2 = `fji_reference_e_${doc_no}.pdf`;
      }
      const process_id = Array(6)
        .fill(null)
        .map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26)))
        .join('');
      const approvalBody = {
        entity_cd: result[0].entity_cd,
        project_no: result[0].project_no,
        debtor_acct: result[0].debtor_acct,
        email_addr: 'm.rakha@ifca.co.id',
        bill_type,
        doc_no,
        related_class,
        doc_date: moment(result[0].doc_date).format('DD MMM YYYY'),
        descs: result[0].descs,
        doc_amt: result[0].base_amt,
        filenames,
        filenames2,
        process_id,
        audit_user: name,
        invoice_tipe: 'schedule',
        currency_cd: result[0].currency_cd,
      };
      const approve = await this.addToApproval(approvalBody);
      console.log(approve)
      if (approve.statusCode == 400) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Failed to add to approve',
          data: [],
        });
      }

    } catch (error) {
      return error.response;
    } finally {
      // await this.fjiDatabase.$executeRawUnsafe(`
      //     INSERT INTO mgr.ar_blast_inv
      //     (entity_cd, entity_name, project_no, project_name, debtor_acct, email_addr, gen_date,
      //      bill_type, doc_no, doc_date, descs, doc_amt, tax_invoice_no, filenames, filenames2,
      //      filenames3, filenames4, file_names_sign, file_token, file_serial_number, file_status,
      //      gen_flag, send_status, send_date, audit_user, audit_date)
      //      VALUES
      //     ('${result[0].entity_cd}', '${entity_name}', '${result[0].project_no}', '${project_name}', '${result[0].debtor_acct}',
      //       '${result[0].email_addr}', GETDATE(), '${bill_type}', '${result[0].doc_no}', '${result[0].doc_date}', '${result[0].descs}',
      //       '${result[0].doc_amt}', '${tax_invoice_no}', '${doc_no}.pdf', null, null, null, null, null, null, 'pending',
      //       null, null, null, mgr, null
      //     )
      //     `)
    }

    return {
      statusCode: 201,
      message: 'pdf generated successfuly',
      data: [{ path: `/UNSIGNED/GQCINV/SCHEDULE/${doc_no}.pdf` }],
    };
  }

  async generateManual(doc_no: string, name: string, related_class: string) {
    if (
      this.isEmpty(doc_no) ||
      this.isEmpty(name) ||
      this.isEmpty(related_class)
    ) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'doc_no, name and related_class must be filled',
        data: [],
      });
    }
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_ar_inv_entry_post_manual_web
            WHERE doc_no = '${doc_no}' 
            `);
    if (result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'invoice data not found',
        data: [],
      });
    }
    const pdfBody = {
      debtor_name: result[0].debtor_name,
      address1: result[0].address1,
      address2: result[0].address2,
      address3: result[0].address3,
      post_cd: result[0].post_cd,
      trx_type: result[0].trx_type,
      doc_no: doc_no,
      doc_date: result[0].doc_date,
      due_date: result[0].due_date,
      descs: result[0].descs,
      descs_info: result[0]?.descs_info || '',
      start_date: result[0].start_date,
      end_date: result[0].end_date,
      currency_cd: result[0].currency_cd,
      base_amt: result[0].base_amt,
      tax_amt: result[0].tax_amt,
      tax_scheme: result[0].tax_shceme,
      tax_rate: result[0].tax_rate,
      pph_rate: result[0].pph_rate,
      line1: result[0]?.line1 || '-',
      signature: result[0].signature,
      designation: result[0].designation,
      bank_name_rp: result[0].bank_name_rp,
      bank_name_usd: result[0].bank_name_usd || '',
      account_rp: result[0].account_rp,
      account_usd: result[0]?.account_usd || '',
      alloc_amt: result[0]?.alloc_amt,
      notes: result[0].notes,
      sequence_no: result[0].sequence_no,
      group_cd: result[0].group_cd,
      inv_group: result[0].inv_group,
      formid: result[0].formid,
      type: "manual"
    };

    try {
      await this.pdfService.generatePdfManual(pdfBody);
    } catch (error) {
      return error.response;
    }

    const process_id = Array(6)
      .fill(null)
      .map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26)))
      .join('');
    const approvalBody = {
      entity_cd: result[0].entity_cd,
      project_no: result[0].project_no,
      debtor_acct: result[0].debtor_acct,
      email_addr: 'm.rakha@ifca.co.id',
      bill_type: null,
      doc_no,
      related_class,
      doc_date: moment(result[0].doc_date).format('DD MMM YYYY'),
      descs: result[0].descs,
      doc_amt: result[0].base_amt,
      filenames: `${doc_no}.pdf`,
      filenames2: null,
      process_id,
      audit_user: name,
      invoice_tipe: 'manual',
      currency_cd: result[0].currency_cd,
    };
    const approve = await this.addToApproval(approvalBody);
    if (approve.statusCode == 400) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Failed to add to approve',
        data: [],
      });
    }

    const getType = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.m_type_invoice WHERE type_cd = '${related_class}'
            `);
    const getTypeDtl: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT * FROM mgr.m_type_invoice_dtl WHERE type_id = ${getType[0].type_id} AND job_task LIKE '%Approval Lvl%'
            `);

    for (const row of getTypeDtl) {
      // Extract approval level from "Approval Lvl X"
      const approvalLevelMatch = row.job_task.match(/Approval Lvl (\d+)/);
      const approvalLevel = approvalLevelMatch
        ? parseInt(approvalLevelMatch[1], 10)
        : null;

      const getUser = await this.fjiDatabase.$queryRawUnsafe(`
                    SELECT * FROM mgr.m_user WHERE user_id = ${row.user_id}
                `);

      const approvalDtlBody = {
        entity_cd: result[0].entity_cd,
        project_no: result[0].project_no,
        debtor_acct: result[0].debtor_acct,
        approval_level: approvalLevel,
        approval_user: getUser[0].email,
        approval_status: 'P',
        approval_remarks: '',
        doc_no,
        process_id,
        audit_user: name,
      };

      const approvalDtl = await this.addToApprovalDtl(approvalDtlBody);
      if (approvalDtl.statusCode == 400) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Failed to add to approvals',
          data: [],
        });
      }

      // if (approvalLevel === 1) {
      //   const approvalLogBody = {
      //     entity_cd: result[0].entity_cd,
      //     project_no: result[0].project_no,
      //     debtor_acct: result[0].debtor_acct,
      //     email_addr: getUser[0].email,
      //     status_code: 200,
      //     response_message: 'email sent successfully',
      //     send_date: moment().format('DD MMM YYYY'),
      //     doc_no,
      //     process_id,
      //     audit_user: name,
      //   };

      //   const approvalLog = await this.addToApprovalLog(approvalLogBody);
      //   if (approvalLog.statusCode == 400) {
      //     throw new BadRequestException({
      //       statusCode: 400,
      //       message: 'Failed to add to approval log',
      //       data: [],
      //     });
      //   }
      // }
    }

    return {
      statusCode: 201,
      message: 'pdf generated successfuly',
      data: [{ path: `/UNSIGNED/GQCINV/MANUAL/${doc_no}.pdf` }],
    };
  }
  private isEmpty(value: any): boolean {
    if (value === undefined || value === null || value === '') {
      return true;
    }
    return false;
  }

  async generateProforma(doc_no: string, name: string, related_class: string) {
    if (
      this.isEmpty(doc_no) ||
      this.isEmpty(name) ||
      this.isEmpty(related_class)
    ) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'doc_no, name and related_class must be filled',
        data: [],
      });
    }
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
           SELECT * FROM mgr.v_ar_inv_proforma_web
            WHERE doc_no = '${doc_no}'
            `);
    if (result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'invoice data not found',
        data: [],
      });
    }
    const pdfBody = {
      tradeName: result[0].trade_name,
      address1: result[0].address1,
      address2: result[0].address2,
      address3: result[0].address3,
      docNo: doc_no,
      docDate: result[0].doc_date,
      dueDate: result[0].due_date,
      taxDesc: result[0].tax_descs,
      taxRate: result[0].tax_rate,
      startDate: result[0]?.start_date,
      endDate: result[0]?.end_date,
      currencyCd: result[0].currency_cd,
      baseAmount: result[0].fbase_amt,
      taxAmount: result[0].ftax_amt,
      docAmount: result[0].fdoc_amt,
      bankNameRp: result[0]?.bank_name_rp || '',
      bankNameUsd: result[0]?.bank_name_usd || '',
      acctRp: result[0]?.account_rp || '',
      acctUsd: result[0]?.account_usd || '',
      signature: result[0].signature,
    };

    await this.pdfService.generatePdfProforma(pdfBody);

    const process_id = Array(6)
      .fill(null)
      .map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26)))
      .join('');
    const approvalBody = {
      entity_cd: result[0].entity_cd,
      project_no: result[0].project_no,
      debtor_acct: result[0].debtor_acct,
      email_addr: 'm.rakha@ifca.co.id',
      bill_type: null,
      doc_no,
      related_class,
      doc_date: moment(result[0].doc_date).format('DD MMM YYYY'),
      descs: result[0].descs,
      doc_amt: result[0].fdoc_amt,
      filenames: `${doc_no}.pdf`,
      filenames2: null,
      process_id,
      audit_user: name,
      invoice_tipe: 'proforma',
      currency_cd: result[0].currency_cd,
    };
    console.log('currency cd = ' + result[0].currency_cd);
    const approve = await this.addToApproval(approvalBody);
    if (approve.statusCode == 400) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Failed to add to approve',
        data: [],
      });
    }


    return {
      statusCode: 201,
      message: 'pdf generated successfuly',
      data: [{ path: `/UNSIGNED/GQCINV/PROFORMA/${doc_no}.pdf` }],
    };
  }

  async getSchedule(data: generateDto) {
    const { startDate, endDate, auditUser } = data;
    try {
      console.log(startDate, endDate);
      const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_ar_ledger_gen_bill_sch_web
            INNER JOIN mgr.v_assign_approval_level
            ON mgr.v_ar_ledger_gen_bill_sch_web.related_class = mgr.v_assign_approval_level.type_cd
            WHERE year(doc_date)*10000+month(doc_date)*100+day(doc_date) >= '${startDate}' 
              AND year(doc_date)*10000+month(doc_date)*100+day(doc_date) <= '${endDate}'
              AND doc_no NOT IN ( SELECT doc_no FROM mgr.ar_blast_inv_approval ) 
              AND mgr.v_assign_approval_level.email = '${auditUser}'
              AND mgr.v_assign_approval_level.job_task = 'Maker' 
            `);
      if (!result || result.length === 0) {
        throw new NotFoundException({
          statusCode: 404,
          message: 'No data',
          data: [],
        });
      }

      return {
        statusCode: 200,
        message: 'data retrieved',
        data: result,
      };
    } catch (error) {
      throw new NotFoundException(error.response);
    }
  }

  async getManual(data: generateDto) {
    const { startDate, endDate, auditUser } = data;
    try {
      const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
          SELECT * FROM mgr.v_ar_ledger_gen_inv_manual_web m
          INNER JOIN mgr.v_assign_approval_level
          ON m.related_class = mgr.v_assign_approval_level.type_cd
          WHERE year(doc_date)*10000+month(doc_date)*100+day(doc_date) >= '${startDate}' 
          AND year(doc_date)*10000+month(doc_date)*100+day(doc_date) <= '${endDate}'
          AND doc_no NOT IN ( SELECT doc_no FROM mgr.ar_blast_inv_approval ) 
          AND mgr.v_assign_approval_level.email = '${auditUser}'
          AND mgr.v_assign_approval_level.job_task = 'Maker' 
          `);
      if (!result || result.length === 0) {
        throw new NotFoundException({
          statusCode: 404,
          message: 'No data',
          data: [],
        });
      }

      return {
        statusCode: 200,
        message: 'data retrieved',
        data: result,
      };
    } catch (error) {
      throw new NotFoundException(error.response);
    }
  }

  async getProforma(data: generateDto) {
    const { startDate, endDate, auditUser } = data;
    try {
      const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
          SELECT * FROM mgr.v_ar_ledger_gen_inv_proforma_web m
          INNER JOIN mgr.v_assign_approval_level
          ON m.related_class = mgr.v_assign_approval_level.type_cd
          WHERE year(doc_date)*10000+month(doc_date)*100+day(doc_date) >= '${startDate}' 
          AND year(doc_date)*10000+month(doc_date)*100+day(doc_date) <= '${endDate}'
          AND doc_no NOT IN ( SELECT doc_no FROM mgr.ar_blast_inv_approval ) 
          AND mgr.v_assign_approval_level.email = '${auditUser}'
          AND mgr.v_assign_approval_level.job_task = 'Maker'  
                `);
      if (!result || result.length === 0) {
        throw new NotFoundException({
          statusCode: 404,
          message: 'No data',
          data: [],
        });
      }

      return {
        statusCode: 200,
        message: 'data retrieved',
        data: result,
      };
    } catch (error) {
      throw new NotFoundException(error.response);
    }
  }

  async approve(
    doc_no: string,
    process_id: string,
    approval_user: string,
    approval_remarks: string,
    approval_status: string,
  ) {
    if (
      this.isEmpty(doc_no) ||
      this.isEmpty(process_id) ||
      this.isEmpty(approval_user) ||
      (approval_status !== 'A' && approval_status !== 'R' && approval_status !== 'C')
    ) {
      throw new BadRequestException({
        statusCode: 400,
        message:
          "doc_no and process_id can't be empty, approval status must be A or R or C",
        data: [],
      });
    }
    let approval_remark = null;
    if (!this.isEmpty(approval_remarks)) {
      approval_remark = "'" + approval_remarks + "'";
    }
    console.log('approval remark = ' + approval_remark);
    const approvalTable = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.ar_blast_inv_approval
            WHERE process_id = '${process_id}' AND doc_no = '${doc_no}'
            `);
    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
                UPDATE mgr.ar_blast_inv_approval_dtl
                SET approval_status = '${approval_status}', approval_date = GETDATE(), 
                approval_remarks = ${approval_remark}
                WHERE doc_no = '${doc_no}' AND process_id = '${process_id}' 
                AND approval_user = '${approval_user}'
                
                `);
      if (result === 0) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'you already approved this document ',
          data: [],
        });
      }
      if (approval_status === 'R') {
        try {
          await this.fjiDatabase.$executeRawUnsafe(`
                        UPDATE mgr.ar_blast_inv_approval SET status_approve = '${approval_status}'
                        WHERE process_id = '${process_id}' 
                        `);
        } catch (error) {
          throw new BadRequestException({
            statusCode: 400,
            message: 'fail to update database to R',
            data: [],
          });
        }
        return {
          statusCode: 200,
          message: 'document rejected',
          data: [],
        };
      }
      const log = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT * FROM mgr.ar_blast_inv_approval_log_msg 
                WHERE doc_no = '${doc_no}' AND process_id = '${process_id}' 
                `);
      const getNextApproveUser: Array<any> = await this.fjiDatabase
        .$queryRawUnsafe(`
                    SELECT approval_user, approval_level FROM mgr.ar_blast_inv_approval_dtl
                    WHERE doc_no = '${doc_no}' AND process_id = '${process_id}' AND approval_status = 'P' 
                    ORDER BY approval_level ASC 
                    `);
      if (getNextApproveUser.length === 0) {
        const gen_date = moment(approvalTable[0].gen_date).format('YYYYMMDD')
        const doc_date = moment(approvalTable[0].doc_date).format('YYYYMMDD')
        const audit_date = moment(approvalTable[0].audit_date).format('YYYYMMDD')
        try {
          const result = await this.fjiDatabase.$executeRawUnsafe(`
            UPDATE mgr.ar_blast_inv_approval SET status_approve = '${approval_status}'
            WHERE process_id = '${process_id}' 
            `);
          // const insert = await this.fjiDatabase.$executeRawUnsafe(`
          //   INSERT INTO mgr.ar_blast_inv
          //   (entity_cd, project_no, debtor_acct, email_addr, gen_date, bill_type, doc_no,
          //   doc_date, descs, currency_cd, doc_amt, tax_invoice_no, invoice_tipe, filenames,
          //   filenames2, process_id, audit_user, audit_date)
          //   VALUES
          //   ('${approvalTable[0].entity_cd}', '${approvalTable[0].project_no}', '${approvalTable[0].debtor_acct}',
          //   '${approvalTable[0].email_addr}', '${gen_date}', '${approvalTable[0].bill_type}',
          //   '${doc_no}', '${doc_date}', '${approvalTable[0].descs}', '${approvalTable[0].currency_cd}',
          //   ${approvalTable[0].doc_amt}, null, '${approvalTable[0].invoice_tipe}',
          //   '${approvalTable[0].filenames}', '${approvalTable[0].filenames2}', '${process_id}',
          //   '${approvalTable[0].audit_user}', '${audit_date}')
          //   `);
          const insert = await this.fjiDatabase.$executeRaw(Prisma.sql`
            INSERT INTO mgr.ar_blast_inv
            (entity_cd, project_no, debtor_acct, email_addr, gen_date, bill_type, doc_no, related_class,
            doc_date, descs, currency_cd, doc_amt, invoice_tipe, filenames,
            filenames2, process_id, audit_user, audit_date)
            VALUES
            (${approvalTable[0].entity_cd}, ${approvalTable[0].project_no}, ${approvalTable[0].debtor_acct},
            ${approvalTable[0].email_addr}, ${gen_date}, ${approvalTable[0].bill_type},
            ${doc_no}, ${approvalTable[0].related_class}, ${doc_date}, ${approvalTable[0].descs}, ${approvalTable[0].currency_cd},
            ${approvalTable[0].doc_amt}, ${approvalTable[0].invoice_tipe},
            ${approvalTable[0].filenames}, ${approvalTable[0].filenames2}, ${process_id},
            ${approvalTable[0].audit_user}, GETDATE())
            `);

          if (result === 0 || insert === 0) {
            throw new BadRequestException({
              statusCode: 400,
              message: 'failed to insert to database',
              data: [],
            });
          }
        } catch (error) {
          console.log(error)
          throw new BadRequestException({
            statusCode: 400,
            message: 'failed to insert to database',
            data: [],
          });
        }
        return {
          statusCode: 200,
          message: 'Approval successful',
          data: [],
        };
      }
      const approval_level = getNextApproveUser[0].approval_level;
      console.log('approval_level' + approval_level);
      const approval_progress = await this.fjiDatabase.$executeRawUnsafe(`
                UPDATE mgr.ar_blast_inv_approval 
                SET progress_approval = ${approval_level}
                WHERE process_id = '${process_id}' AND doc_no = '${doc_no}'
                `);
      if (approval_progress === 0) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'failed to update database',
          data: [],
        });
      }
      // const nextEmail = getNextApproveUser[0].approval_user
      // const approvalLogBody = {
      //     entity_cd: log[0].entity_cd,
      //     project_no: log[0].project_no,
      //     debtor_acct: log[0].debtor_acct,
      //     email_addr: nextEmail,
      //     status_code: 200,
      //     response_message: "email sent successuly",
      //     send_date: moment().format('DD MMM YYYY'),
      //     doc_no,
      //     process_id,
      //     audit_user: log[0].audit_user
      // }
      // console.log(approvalLogBody)
      // const approvalLog = await this.addToApprovalLog(approvalLogBody)
      // if (approvalLog.statusCode == 400) {
      //     throw new BadRequestException({
      //         statusCode: 400,
      //         message: 'Failed to add to approval log',
      //         data: [],
      //     })
      // }
    } catch (error) {
      throw new BadRequestException(error.response);
    }

    return {
      statusCode: 200,
      message: 'Approval successful',
      data: [],
    };
  }

  async reject(doc_no: string, process_id: string, approval_user: string) {
    try {
      const resultdtl = await this.fjiDatabase.$executeRawUnsafe(`
                UPDATE mgr.ar_blast_inv_approval_dtl
                SET approval_status = 'R', approval_date = GETDATE()
                WHERE doc_no = '${doc_no}' AND process_id = '${process_id}' 
                AND approval_user = '${approval_user}'
                AND approval_status != 'A' AND approval_status != 'R'
                `);
      const result = await this.fjiDatabase.$executeRawUnsafe(`
                    UPDATE mgr.ar_blast_inv_approval SET status_approve = 'R'
                    WHERE process_id = '${process_id}' 
                    `);
      if (result === 0) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'failed to update database',
          data: [],
        });
      }
      if (resultdtl === 0) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'you already approved or rejected this document',
          data: [],
        });
      }
    } catch (error) {
      throw new BadRequestException(error.response);
    }
    return {
      statusCode: 200,
      message: 'invoice rejected',
      data: [],
    };
  }

  async getApprovalList(audit_user: string) {
    try {
      const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
        SELECT abia.*,debtor_name = ad.name FROM mgr.ar_blast_inv_approval abia
        INNER JOIN mgr.ar_debtor ad 
        ON abia.debtor_acct = ad.debtor_acct
        AND abia.entity_cd = ad.entity_cd
        AND abia.project_no = ad.project_no
        where progress_approval = 0
        and abia.audit_user = '${audit_user}'
        AND doc_no NOT LIKE 'OR%'
          AND doc_no NOT LIKE 'SP%'
          AND doc_no NOT LIKE 'OF%'
        ORDER BY gen_date DESC
        `)
      return {
        statusCode: 200,
        message: 'get list successful',
        data: result
      }
    } catch (error) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'Approval list not found',
        data: [],
      })
    }
  }

  async deleteInvoice(doc_no: string, process_id: string) {
    if (this.isEmpty(doc_no)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'doc_no',
        data: [],
      })
    }
    try {
      const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
        DELETE FROM mgr.ar_blast_inv_approval 
         WHERE doc_no = '${doc_no}' AND progress_approval = 0 AND process_id = '${process_id}'
         `);
    } catch (error) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'delete failed',
        data: [],
      })
    }
    return {
      statusCode: 200,
      message: 'delete successful',
      data: [],
    }
  }

  async submitInvoice(data: Record<any, any>) {
    const { doc_no, process_id, audit_user, related_class
    } = data;
    if (this.isEmpty(doc_no) || this.isEmpty(process_id) || this.isEmpty(audit_user) || this.isEmpty(related_class)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'doc_no, process_id, audit_user, related_class cannot be empty',
        data: [],
      })
    }
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_inv_approval 
       WHERE doc_no = '${doc_no}'
       `);
    const getType = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.m_type_invoice WHERE type_cd = '${related_class}'
      `);
    const getTypeDtl: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
          SELECT * FROM mgr.m_type_invoice_dtl WHERE type_id = ${getType[0].type_id} AND job_task LIKE '%Approval Lvl%'
      `);

    let approval_level: number = 0
    for (const row of getTypeDtl) {
      approval_level += 1
      // Extract approval level from "Approval Lvl X"
      const approvalLevelMatch = row.job_task.match(/Approval Lvl (\d+)/);
      const approvalLevel = approvalLevelMatch
        ? parseInt(approvalLevelMatch[1], 10)
        : null;

      const getUser = await this.fjiDatabase.$queryRawUnsafe(`
              SELECT * FROM mgr.m_user WHERE user_id = ${row.user_id}
          `);

      const approvalDtlBody = {
        entity_cd: result[0].entity_cd,
        project_no: result[0].project_no,
        debtor_acct: result[0].debtor_acct,
        approval_level: approvalLevel,
        approval_user: getUser[0].email,
        approval_status: 'P',
        approval_remarks: '',
        doc_no,
        process_id,
        audit_user: audit_user,
      };

      const approvalDtl = await this.addToApprovalDtl(approvalDtlBody);
      if (approvalDtl.statusCode == 400) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Failed to add to approvals',
          data: [],
        });
      }

      // if (approvalLevel === 1) {
      //   const approvalLogBody = {
      //     entity_cd: result[0].entity_cd,
      //     project_no: result[0].project_no,
      //     debtor_acct: result[0].debtor_acct,
      //     email_addr: getUser[0].email,
      //     status_code: 200,
      //     response_message: 'email sent successfully',
      //     send_date: moment().format('DD MMM YYYY'),
      //     doc_no,
      //     process_id,
      //     audit_user: name,
      //   };

      //   const approvalLog = await this.addToApprovalLog(approvalLogBody);
      //   if (approvalLog.statusCode == 400) {
      //     throw new BadRequestException({
      //       statusCode: 400,
      //       message: 'Failed to add to approval log',
      //       data: [],
      //     });
      //   }
      // }
    }
    await this.fjiDatabase.$executeRawUnsafe(`
      UPDATE mgr.ar_blast_inv_approval set approval_lvl = ${approval_level}, status_approve = 'P', progress_approval = 1
      WHERE process_id = '${process_id}' AND doc_no = '${doc_no}'
      `)

    return {
      statusCode: 200,
      message: 'invoice submitted',
      data: []
    }

  }

  async addToApproval(data: Record<any, any>) {
    const {
      entity_cd,
      project_no,
      debtor_acct,
      email_addr,
      bill_type,
      doc_no,
      related_class,
      doc_date,
      descs,
      doc_amt,
      filenames,
      filenames2,
      process_id,
      audit_user,
      invoice_tipe,
      currency_cd,
    } = data;

    try {
      const result = await this.fjiDatabase.$executeRaw(Prisma.sql`
                    INSERT INTO mgr.ar_blast_inv_approval 
                    (entity_cd, project_no, debtor_acct, email_addr, 
                    gen_date, bill_type, doc_no, related_class, doc_date, descs, doc_amt, filenames, filenames2, gen_flag, process_id, 
                    audit_user, audit_date, invoice_tipe, status_approve, progress_approval, currency_cd)
                    VALUES 
                    (${entity_cd}, ${project_no}, ${debtor_acct}, ${email_addr}, GETDATE(), 
                    ${bill_type}, ${doc_no}, ${related_class},${doc_date}, ${descs}, ${doc_amt}, ${filenames}, 
                    ${filenames2}, 'Y', ${process_id}, ${audit_user}, GETDATE(), ${invoice_tipe},
                    null, 0, ${currency_cd})
                `);
      console.log(result)
    } catch (error) {
      console.log(error);
      return {
        statusCode: 400,
        message: 'Failed to add to approve',
        data: [error],
      };
    }

    return {
      statusCode: 200,
      message: 'Added to approve',
      data: [],
    };
  }

  async addToApprovalDtl(data: Record<any, any>) {
    const {
      entity_cd,
      project_no,
      debtor_acct,
      approval_level,
      approval_user,
      approval_status,
      approval_remarks,
      doc_no,
      process_id,
      audit_user,
    } = data;

    try {
      let approval_remark = null;
      if (!this.isEmpty(approval_remarks)) {
        approval_remark = "'" + approval_remarks + "'";
      }
      const result = await this.fjiDatabase.$executeRawUnsafe(`
                INSERT INTO mgr.ar_blast_inv_approval_dtl 
                (entity_cd, project_no, debtor_acct, 
                doc_no, process_id, approval_level, approval_user, approval_status, approval_remarks,
                audit_user)
                VALUES 
                ('${entity_cd}', '${project_no}', '${debtor_acct}', 
                '${doc_no}', '${process_id}', '${approval_level}', '${approval_user}', 
                '${approval_status}', ${approval_remark}, '${audit_user}')
            `);

      const update = await this.fjiDatabase.$executeRawUnsafe(`
                UPDATE mgr.ar_blast_inv_approval SET approval_lvl = ${approval_level}
                WHERE process_id = '${process_id}' AND entity_cd = '${entity_cd}'
                AND project_no = '${project_no}' AND debtor_acct = '${debtor_acct}'
                `);
      console.log(update);
      if (result === 0) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Failed to add to approve dtl',
          data: [],
        });
      }
    } catch (error) {
      return {
        statusCode: 400,
        message: 'Failed to add to approve dtl',
        data: [],
      };
    }

    return {
      statusCode: 200,
      message: 'Added to approve dtl',
      data: [],
    };
  }

  async addToApprovalLog(data: Record<any, any>) {
    const {
      entity_cd,
      project_no,
      debtor_acct,
      email_addr,
      status_code,
      response_message,
      send_date,
      doc_no,
      process_id,
      audit_user,
    } = data;

    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
                INSERT INTO mgr.ar_blast_inv_approval_log_msg  
                (entity_cd, project_no, debtor_acct, email_addr,
                doc_no, status_code, response_message, send_date, process_id, 
                audit_user, audit_date)
                VALUES 
                ('${entity_cd}', '${project_no}', '${debtor_acct}', 
                '${email_addr}', '${doc_no}', '${status_code}', '${response_message}', '${send_date}', '${process_id}',
                '${audit_user}', GETDATE())
                `);
      console.log(result);
      if (result === 0) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Failed to add to approve log',
          data: [],
        });
      }
    } catch (error) {
      return {
        statusCode: 400,
        message: 'Failed to add to approve log',
        data: [],
      };
    }

    return {
      statusCode: 200,
      message: 'Added to approve log',
      data: [],
    };
  }

  async getApproval(process_id: string) {
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT mgr.ar_blast_inv_approval.rowID,
                mgr.ar_blast_inv_approval.entity_cd,
                mgr.cf_entity.entity_name,
                mgr.ar_blast_inv_approval.project_no,
                project_name = mgr.pl_project.descs,
                mgr.ar_blast_inv_approval.debtor_acct,
                debtor_name = mgr.ar_debtor.name,
                mgr.ar_blast_inv_approval.email_addr,
                mgr.ar_blast_inv_approval.gen_date,
                mgr.ar_blast_inv_approval.doc_no,
                mgr.ar_blast_inv_approval.doc_date,
                mgr.ar_blast_inv_approval.descs,
                mgr.ar_blast_inv_approval.currency_cd,
                mgr.ar_blast_inv_approval.doc_amt,
                mgr.ar_blast_inv_approval.filenames,
                mgr.ar_blast_inv_approval.filenames2,
                mgr.ar_blast_inv_approval.filenames3,
                mgr.ar_blast_inv_approval.filenames4,
                mgr.ar_blast_inv_approval.invoice_tipe,
                mgr.ar_blast_inv_approval.audit_user FROM mgr.ar_blast_inv_approval 
            INNER JOIN mgr.cf_entity  
                ON mgr.ar_blast_inv_approval.entity_cd = mgr.cf_entity.entity_cd  
            INNER JOIN mgr.pl_project  
                ON mgr.ar_blast_inv_approval.entity_cd = mgr.pl_project.entity_cd
                AND mgr.ar_blast_inv_approval.project_no = mgr.pl_project.project_no
            INNER JOIN mgr.ar_debtor  
                ON mgr.ar_blast_inv_approval.entity_cd = mgr.ar_debtor.entity_cd  
                AND mgr.ar_blast_inv_approval.project_no = mgr.ar_debtor.project_no  
                AND mgr.ar_blast_inv_approval.debtor_acct = mgr.ar_debtor.debtor_acct 
            WHERE process_id = '${process_id}'
            `);
    if (result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No approval data found',
        data: [],
      });
    }
    return {
      statusCode: 200,
      message: 'Approval data found',
      data: result,
    };
  }
  async getApprovalByUser(approval_user: string) {
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
        SELECT * FROM mgr.v_inv_approval
        WHERE approval_user = '${approval_user}'
          AND approval_status = 'P'
          AND doc_no NOT LIKE 'OR%'
          AND doc_no NOT LIKE 'SP%'
          AND doc_no NOT LIKE 'OF%'
        ORDER BY gen_date DESC
    `);

    if (result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No approval detail data found',
        data: [],
      });
    }
    return {
      statusCode: 200,
      message: 'Approval detail data found',
      data: result,
    };
  }
  async getApprovalHistory(approval_user: string) {
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.ar_blast_inv_approval_dtl
            WHERE approval_user = '${approval_user}'
            AND approval_status != 'P'
            AND doc_no NOT LIKE 'OR%'
            AND doc_no NOT LIKE 'SP%'
            AND doc_no NOT LIKE 'OF%'
            ORDER BY approval_date DESC
            `);
    if (result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No approval detail data found',
        data: [],
      });
    }
    return {
      statusCode: 200,
      message: 'Approval detail data found',
      data: result,
    };
  }
  async getApprovalDtl(process_id: string) {
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.ar_blast_inv_approval_dtl
            WHERE process_id = '${process_id}'
            `);
    if (result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No approval detail data found',
        data: [],
      });
    }
    return {
      statusCode: 200,
      message: 'Approval detail data found',
      data: result,
    };
  }
  async getApprovalLog(process_id: string) {
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.ar_blast_inv_approval_log_msg
            WHERE process_id = '${process_id}'
            `);
    if (result.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: 'No approval log data found',
        data: [],
      });
    }
    return {
      statusCode: 200,
      message: 'Approval log data found',
      data: result,
    };
  }

  async getStamp(status: string) {
    let file_status = '';
    if (status === 'S') {
      file_status = 'IS NULL AND send_id IS NULL';
    } else if (status === 'F') {
      file_status = "IN ('P', 'A', 'F')";
    } else {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid Status. Status must be either S or F ',
        data: [],
      });
    }
    try {
      const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT abia.*, debtor_name = name FROM mgr.ar_blast_inv abia 
                INNER JOIN mgr.ar_debtor ad 
                ON abia.debtor_acct = ad.debtor_acct
                AND abia.entity_cd = ad.entity_cd
                AND abia.project_no = ad.project_no
                WHERE doc_amt >= 5000000 
                AND file_status_sign ${file_status}
            `);
      if (!result || result.length === 0) {
        console.log(result.length);
        throw new NotFoundException({
          statusCode: 404,
          message: 'No stamp yet ',
          data: [],
        });
      }
      return {
        statusCode: 200,
        message: 'stamp retrieved successfully',
        data: result,
      };
    } catch (error) {
      throw new NotFoundException(error.response);
    }
  }

  async getStampHistory(data: Record<any, any>) {
    const { company_cd, startDate, endDate } = data;
    if (
      this.isEmpty(company_cd) &&
      this.isEmpty(startDate) &&
      this.isEmpty(endDate)
    ) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Company CD, Start Date and End Date are required',
        data: [],
      });
    }
    try {
      const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
               SELECT * FROM mgr.peruri_stamp_file_log WHERE company_cd = '${company_cd}' 
                AND file_type != 'receipt'
                AND year(audit_date)*10000+month(audit_date)*100+day(audit_date) >= '${startDate}' 
                AND year(audit_date)*10000+month(audit_date)*100+day(audit_date) <= '${endDate}'
                ORDER BY audit_date DESC
            `);
      if (!result || result.length === 0) {
        console.log(result.length);
        throw new NotFoundException({
          statusCode: 404,
          message: 'No stamp history yet ',
          data: [],
        });
      }
      return {
        statusCode: 200,
        message: 'stamp history retrieved successfully',
        data: result,
      };
    } catch (error) {
      console.log(error)
      throw new NotFoundException(error.response);
    }
  }

  async downloadStampedInvoice(start_date: string, end_date: string) {
    if (this.isEmpty(start_date) || this.isEmpty(end_date)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Start Date and End Date are required',
        data: [],
      });
    }
    const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)
    const ftpBaseUrl = process.env.FTP_BASE_URL
    try {
      const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
               SELECT * FROM mgr.ar_blast_inv
               WHERE year(gen_date)*10000+month(gen_date)*100+day(gen_date) >= ${start_date}
               AND year(gen_date)*10000+month(gen_date)*100+day(gen_date) <= ${end_date}
                `);
      if (result.length === 0) {
        throw new NotFoundException({
          statusCode: 404,
          message: 'No stamped file yet',
          data: [],
        });
      }

      const zip = new AdmZip();
      for (let i = 0; i < result.length; i++) {
        const filenames = `${result[i].filenames.slice(0, -4)}_signed.pdf`;
        const invoice_tipe = result[i].invoice_tipe.toUpperCase();
        const fileUrl = `${ftpBaseUrl}SIGNED/GQCINV/${invoice_tipe}/${filenames}`;
        try {
          // Download the PDF file
          const response = await firstValueFrom(this.httpService.get(fileUrl, { responseType: 'arraybuffer' }));
          console.log("in try : " + fileUrl)
          zip.addFile(filenames, Buffer.from(response.data));
        } catch (error) {
          console.log("in catch : " + fileUrl)
          continue;
        }
      }

      const localFolderPath = `${rootFolder}/download/`;
      const zipFileName = `stamped_${start_date}_to_${end_date}.zip`;
      const zipFilePath = `${localFolderPath}${zipFileName}`;
      const remoteFolderPath = `/SIGNED/GQCINV/DOWNLOAD/`;
      const remoteZipPath = `${remoteFolderPath}${zipFileName}`;
      console.log("ftp zip path : " + remoteZipPath)
      await this.connect();

      if (!fs.existsSync(localFolderPath)) {
        fs.mkdirSync(localFolderPath, { recursive: true });
      }
      zip.writeZip(zipFilePath);

      await this.client.ensureDir(remoteFolderPath);

      try {

        await this.client.ensureDir(remoteFolderPath);
        await this.upload(zipFilePath, remoteZipPath);
      } catch (error) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Failed to upload file',
          data: [],
        })
      } finally {
        await this.disconnect();
      }
      return ({
        statusCode: 200,
        message: 'Stamped invoice downloaded successfully',
        data: `${ftpBaseUrl}${remoteZipPath}`
      })
    } catch (error) {
      console.log(error)
      throw new BadRequestException(error.response);
    }
  }
  async downloadStampedOr(start_date: string, end_date: string) {
    if (this.isEmpty(start_date) || this.isEmpty(end_date)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Start Date and End Date are required',
        data: [],
      });
    }
    const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)
    const ftpBaseUrl = process.env.FTP_BASE_URL
    try {
      const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
               SELECT * FROM mgr.ar_blast_or
               WHERE year(gen_date)*10000+month(gen_date)*100+day(gen_date) >= ${start_date}
               AND year(gen_date)*10000+month(gen_date)*100+day(gen_date) <= ${end_date}
                `);
      if (result.length === 0) {
        throw new NotFoundException({
          statusCode: 404,
          message: 'No stamped file yet ',
          data: [],
        });
      }

      const zip = new AdmZip();
      for (let i = 0; i < result.length; i++) {
        const filenames = `${result[i].filenames.slice(0, -4)}_signed.pdf`;
        const invoice_tipe = result[i].invoice_tipe.toUpperCase();
        const fileUrl = `${ftpBaseUrl}SIGNED/GQCINV/${invoice_tipe}/${filenames}`;
        try {
          // Download the PDF file
          const response = await firstValueFrom(this.httpService.get(fileUrl, { responseType: 'arraybuffer' }));
          console.log("in try : " + fileUrl)
          zip.addFile(filenames, Buffer.from(response.data));
        } catch (error) {
          console.log("in catch : " + fileUrl)
          continue;
        }
      }

      const localFolderPath = `${rootFolder}/download/`;
      const zipFileName = `stamped_${start_date}_to_${end_date}.zip`;
      const zipFilePath = `${localFolderPath}${zipFileName}`;
      const remoteFolderPath = `/SIGNED/GQCINV/DOWNLOAD/`;
      const remoteZipPath = `${remoteFolderPath}${zipFileName}`;
      console.log("ftp zip path : " + remoteZipPath)
      await this.connect();

      if (!fs.existsSync(localFolderPath)) {
        fs.mkdirSync(localFolderPath, { recursive: true });
      }
      zip.writeZip(zipFilePath);

      await this.client.ensureDir(remoteFolderPath);

      try {

        await this.client.ensureDir(remoteFolderPath);
        await this.upload(zipFilePath, remoteZipPath);
      } catch (error) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Failed to upload file',
          data: [],
        })
      } finally {
        await this.disconnect();
      }
      return ({
        statusCode: 200,
        message: 'Stamped or downloaded successfully',
        data: `${ftpBaseUrl}${remoteZipPath}`
      })
    } catch (error) {
      console.log(error)
      throw new BadRequestException(error.response);
    }
  }





  async invoiceInqueries() {
    const invSent: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_inv
      WHERE send_status = 'S'
    `);
    const invSentWithStatus = invSent.map((row) => ({ ...row, status: 'sent' }));

    const invStamped: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_inv
      WHERE status_process_sign = 'N'
         OR (doc_amt >= 5000000 AND file_status_sign = 's')
    `);
    const invStampedWithStatus = invStamped.map((row) => ({ ...row, status: 'stamped' }));

    const invApprovedCompleted: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_inv
      WHERE doc_amt >= 5000000 AND file_status_sign != 's'
    `);
    const invApprovedCompletedWithStatus = invApprovedCompleted.map((row) => ({
      ...row,
      status: 'approved_completed',
    }));

    const orSent: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_or
      WHERE send_status = 'S'
    `);
    const orSentWithStatus = orSent.map((row) => ({ ...row, status: 'sent' }));

    const orStamped: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_or
      WHERE status_process_sign = 'N'
         OR (doc_amt >= 5000000 AND file_status_sign = 's')
    `);
    const orStampedWithStatus = orStamped.map((row) => ({ ...row, status: 'stamped' }));

    const orApprovedCompleted: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_or
      WHERE doc_amt >= 5000000 AND file_status_sign != 's'
    `);
    const orApprovedCompletedWithStatus = orApprovedCompleted.map((row) => ({
      ...row,
      status: 'approved_completed',
    }));

    // Combine all results into a single array
    const combinedResults = [
      ...invSentWithStatus,
      ...invStampedWithStatus,
      ...invApprovedCompletedWithStatus,
      ...orSentWithStatus,
      ...orStampedWithStatus,
      ...orApprovedCompletedWithStatus,
    ];

    return {
      statusCode: 200,
      message: "get invoice and or success",
      data: combinedResults
    };

  }
}
