import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as moment from 'moment';
import * as fs from 'fs';
import { PdfgenerateService } from 'src/pdfgenerate/pdfgenerate.service';
import * as ftp from 'basic-ftp';
import * as path from 'path';
import { FjiDatabaseService } from 'src/database/database-fji.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReceiptService {
    private client: ftp.Client;
    constructor(
        private readonly fjiDatabase: FjiDatabaseService,
        private readonly pdfgenerateService: PdfgenerateService
    ) {
        this.client = new ftp.Client();
        this.client.ftp.verbose = true;
    }

    private isEmptyString(value: any): boolean {
        if (value === undefined || value === null || value === '') {
            return true;
        };
        return false;
    }

    async connect(): Promise<void> {
        console.log(this.client.closed)
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

    async delete(remoteFilePath: string): Promise<void> {
        try {
            await this.client.remove(remoteFilePath);
            console.log('File deleted successfully');
        } catch (error) {
            console.error(`Failed to delete file: ${error.message}`);
            throw new Error(`Failed to delete file: ${error.message}`);
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

    async getReceipt(audit_user:string) {
        try {
            const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT abia.*, debtor_name = ad.name, entity_name = ent.entity_name, project_name = prj.descs 
                FROM mgr.ar_blast_or abia 
                INNER JOIN mgr.ar_debtor ad 
                  ON abia.debtor_acct = ad.debtor_acct
                  AND abia.entity_cd = ad.entity_cd
                  AND abia.project_no = ad.project_no
                INNER JOIN mgr.cf_entity ent
                  ON abia.entity_cd = ent.entity_cd
                INNER JOIN mgr.pl_project prj
                  ON abia.entity_cd = prj.entity_cd
                  AND abia.project_no = prj.project_no
                INNER JOIN mgr.v_assign_approval_level aal
                  ON aal.type_cd = 'OR'
                WHERE ( 
                  doc_amt <= 5000000
                  AND file_status_sign IS NULL
                  AND send_id IS NULL
                  OR (doc_amt >= 5000000 AND abia.currency_cd = 'RP' AND status_process_sign IN ('N', null) AND send_id IS NULL)
                  OR (doc_amt >= 300 AND abia.currency_cd = 'USD' AND status_process_sign IN ('N', null) AND send_id IS NULL)
                  OR (doc_amt >= 5000000 AND abia.currency_cd = 'RP' AND file_status_sign IN ('S') AND send_id IS NULL)
                  OR (doc_amt >= 300 AND abia.currency_cd = 'USD' AND file_status_sign IN ('S') AND send_id IS NULL)
                  OR (invoice_tipe = 'proforma' AND send_id IS NULL)
                )
                AND aal.email = '${audit_user}' 
                AND aal.job_task = 'Stamp & Blast'
            `)
            if (!result || result.length === 0) {
                console.log(result.length)
                throw new NotFoundException({
                    statusCode: 404,
                    message: 'Receipt not found',
                    data: [],
                });
            }
            return {
                statusCode: 200,
                message: 'Receipt retrieved successfully',
                data: result,
            };
        } catch (error) {
            throw new NotFoundException(
                error.response
            );
        }
    }
    async getReceiptDetail(doc_no: string) {
        try {
            const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT * FROM mgr.ar_blast_or
                WHERE send_id IS NULL
                AND doc_no = '${doc_no}'
            `)
            if (!result || result.length === 0) {
                console.log(result.length)
                throw new NotFoundException({
                    statusCode: 404,
                    message: 'Receipt not found',
                    data: [],
                });
            }
            return {
                statusCode: 200,
                message: 'Receipt detail retrieved successfully',
                data: result,
            };
        } catch (error) {
            throw new NotFoundException(
                error.response
            );
        }
    }

    async getHistory(data: Record<any, any>) {
        const { startDate, endDate, status, auditUser } = data;
        let send_status_query:string
        if(status === 'S') send_status_query = 'status_code = 200'
        else if(status === 'F') send_status_query = 'status_code <> 200'
        try {
          const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                  SELECT 
                    ablm.*, 
                    debtor_name = ad.name, 
                    entity_name = ent.entity_name, 
                    project_name = prj.descs, 
                    filenames = abia.filenames, 
                    filenames2 = abia.filenames2, 
                    filenames3 = abia.filenames3,
                    process_id = abia.process_id,
                    doc_amt = abia.doc_amt, 
                    invoice_tipe = abia.invoice_tipe,
                    file_name_sign = abia.file_name_sign,
                    file_status_sign = abia.file_status_sign
                  FROM mgr.ar_blast_or_log_msg ablm
                    INNER JOIN mgr.ar_debtor ad 
                      ON ablm.debtor_acct = ad.debtor_acct
                      AND ablm.entity_cd = ad.entity_cd
                      AND ablm.project_no = ad.project_no
                    INNER JOIN mgr.cf_entity ent
                      ON ablm.entity_cd = ent.entity_cd
                    INNER JOIN mgr.pl_project prj
                      ON ablm.entity_cd = prj.entity_cd
                      AND ablm.project_no = prj.project_no
                     INNER JOIN mgr.ar_blast_or abia
                         ON ablm.doc_no = abia.doc_no
                      WHERE year(ablm.send_date)*10000+month(ablm.send_date)*100+day(ablm.send_date) >= '${startDate}' 
                      AND year(ablm.send_date)*10000+month(ablm.send_date)*100+day(ablm.send_date) <= '${endDate}'
                      AND ${send_status_query}
                      AND abia.send_status = '${status}'
                      AND ablm.audit_user = '${auditUser}'
                    ORDER BY ablm.send_date DESC
                `);
          // console.log(result)
          if (!result || result.length === 0) {
            throw new NotFoundException({
              statusCode: 404,
              message: 'No history yet',
              data: [],
            });
          }
          const formattedResult = result.map((row) => ({ ...row, send_status:status}));
          return {
            statusCode: 200,
            message: 'history retrieved successfully',
            data: formattedResult,
          };
        } catch (error) {
          throw error
        }
      }
    async getHistoryDetail(email_addr: string, doc_no: string) {
        try {
            const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT * FROM mgr.ar_blast_or
                    WHERE doc_no = '${doc_no}'
                    AND email_addr LIKE '%${email_addr}%'
            `)
            if (!result || result.length === 0) {
                console.log(result.length)
                throw new NotFoundException({
                    statusCode: 404,
                    message: 'Receipt not found',
                    data: [],
                });
            }
            return {
                statusCode: 200,
                message: 'history detail retrieved successfully',
                data: result,
            };
        } catch (error) {
            throw new NotFoundException(
                error.response
            );
        }
    }

    async getStamp(status: string, audit_user: string) {
        let file_status = ''
        if (status === "S") {
            file_status = "IS NULL AND send_id IS NULL"
        } else if (status === "F") {
            file_status = "IN ('P', 'A', 'F')"
        } else {
            throw new BadRequestException({
                statusCode: 400,
                message: 'Invalid Status. Status must be either S or F',
                data: [],
            });
        }
        try {
            const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT abo.*, debtor_name = ad.name, entity_name = ent.entity_name, project_name = prj.descs
                FROM mgr.ar_blast_or abo 
                    INNER JOIN mgr.ar_debtor ad 
                        ON abo.debtor_acct = ad.debtor_acct
                            AND abo.entity_cd = ad.entity_cd
                            AND abo.project_no = ad.project_no
                    INNER JOIN mgr.cf_entity ent
                        ON abo.entity_cd = ent.entity_cd
                    INNER JOIN mgr.pl_project prj
                        ON abo.entity_cd = prj.entity_cd
                            AND abo.project_no = prj.project_no
                    INNER JOIN mgr.v_assign_approval_level aal
                        ON aal.type_cd = 'OR'
                    WHERE (
                        doc_amt >= 5000000 AND abo.currency_cd = 'RP'
                        OR
                        doc_amt >= 300 AND abo.currency_cd = 'USD'
                    )
                    AND file_status_sign ${file_status}
                    AND aal.job_task = 'Stamp & Blast'
                    AND aal.email = '${audit_user}'
                ORDER BY gen_date desc
            `)
            if (!result || result.length === 0) {
                console.log(result.length)
                throw new NotFoundException({
                    statusCode: 404,
                    message: 'No stamp yet',
                    data: [],
                });
            }
            return {
                statusCode: 200,
                message: 'stamp retrieved successfully',
                data: result,
            };
        } catch (error) {
            throw new NotFoundException(
                error.response
            );
        }
    }
    // async getStamps(data: Record<any, any>) {
    //     const { startDate, endDate } = data
    //     try {
    //         const result: Array<any> = await this.sqlserver.$queryRawUnsafe(`
    //             SELECT TOP(5) * FROM mgr.ar_email_or_dtl 
    //             WHERE doc_amt >= 5000000 
    //             AND year(gen_date)*10000+month(gen_date)*100+day(gen_date) >= '${startDate}'
    //             AND year(gen_date)*10000+month(gen_date)*100+day(gen_date) <= '${endDate}'
    //         `)
    //         if (!result || result.length === 0) {
    //             console.log(result.length)
    //             throw new NotFoundException({
    //                 statusCode: 404,
    //                 message: 'No stamp yet',
    //                 data: [],
    //             });
    //         }
    //         return {
    //             statusCode: 200,
    //             message: 'stamp retrieved successfully',
    //             data: result,
    //         };
    //     } catch (error) {
    //         throw new NotFoundException(
    //             error.response
    //         );
    //     }
    // }
    // async generateReceipt(doc_no: string) {
    //     const result = await this.sqlserver.$queryRawUnsafe(`
    //         SELECT * FROM mgr.ar_email_or_dtl  
    //             WHERE doc_no = '${doc_no}'
    //         `)
    //     const pdfBody = {
    //         no: `BI${moment(result[0]?.gen_date).format('YYDDMM')}26` || null,
    //         date: moment(result[0]?.gen_date).format('DD/MM/YYYY') || null,
    //         receiptFrom: `${result[0]?.debtor_acct} - ${result[0]?.debtor_name}` || null,
    //         amount: result[0]?.doc_amt || 10000,
    //         forPayment: result[0]?.doc_no || null,
    //         signedDate: moment(result[0]?.gen_date).format('DD MMMM YYYY') || null,
    //         city: "jakarta",
    //         billType: result[0]?.bill_type || null,
    //     };

    //     await this.pdfService.generatePdfProforma(pdfBody);

    //     try {
    //         await this.connect();
    //         const rootFolder= path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
    //         const filePath = `${rootFolder}/proforma/pakubuwono_${result[0].doc_no}.pdf`;
    //         if (!fs.existsSync(filePath)) {
    //             console.error(`Local file does not exist: ${filePath}`);
    //         }

    //         await this.upload(filePath, `/UNSIGNED/GQCINV/RECEIPT/${result[0].doc_no}.pdf`);

    //     } catch (error) {
    //         console.log("Error during upload:.", error);
    //         throw new BadRequestException({
    //             statusCode: 400,
    //             message: 'Failed to upload to FTP',
    //             data: [error],
    //         });
    //     } finally {
    //         console.log("Disconnecting from FTP servers");
    //         await this.disconnect();
    //     }
    //     return ({
    //         statusCode: 201,
    //         message: "pdf generated successfuly",
    //         data: [{ path: `/UNSIGNED/GQCINV/RECEIPT/${result[0].doc_no}.pdf` }]
    //     })
    // }
    async getStampHistory(data: Record<any, any>) {
        const { company_cd, startDate, endDate } = data
        if (this.isEmptyString(company_cd) && this.isEmptyString(startDate) && this.isEmptyString(endDate)) {
            throw new BadRequestException({
                statusCode: 400,
                message: 'Company CD, Start Date and End Date are required',
                data: [],
            })
        }
        try {
            const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT * FROM mgr.peruri_stamp_file_log WHERE company_cd = '${company_cd}' 
                AND file_type = 'receipt'
                AND year(audit_date)*10000+month(audit_date)*100+day(audit_date) >= '${startDate}' 
                AND year(audit_date)*10000+month(audit_date)*100+day(audit_date) <= '${endDate}'
                ORDER BY audit_date DESC
            `)
            if (!result || result.length === 0) {
                console.log(result.length)
                throw new NotFoundException({
                    statusCode: 404,
                    message: 'No stamp history yet',
                    data: [],
                });
            }
            return {
                statusCode: 200,
                message: 'stamp history retrieved successfully',
                data: result,
            };
        } catch (error) {
            throw new NotFoundException(
                error.response
            );
        }
    }

    async getOR(data) {
        const { start_date, end_date } = data
        if (this.isEmptyString(start_date) || this.isEmptyString(end_date)) {
            throw new BadRequestException({
                statusCode: 400,
                message: "start_date and end_date can't be empty",
                data: []
            })
        }
        const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_ar_or_web
            WHERE
            year(doc_date)*10000+month(doc_date)*100+day(doc_date) >= '${start_date}' 
            AND year(doc_date)*10000+month(doc_date)*100+day(doc_date) <= '${end_date}' 
              AND (
                    doc_no NOT IN (
                      SELECT doc_no 
                      FROM mgr.ar_blast_inv_approval 
                      WHERE status_approve != 'C'
                        OR status_approve IS NULL
                    )
                  OR
                    doc_no IN (
                      SELECT doc_no 
                      FROM mgr.ar_blast_or
                      WHERE send_status = 'R'
                    )
                    AND doc_no NOT IN (
                        SELECT doc_no 
                        FROM mgr.ar_blast_or
                        WHERE send_status <> 'R'
                          OR send_status IS NULL
                    )
              )
            `)
        if (result.length === 0) {
            throw new NotFoundException({
                statusCode: 404,
                message: 'No OR data yet',
                data: [],
            })
        }

        return {
            statusCode: 200,
            message: 'successfully get OR data',
            data: result
        }
    }

    async generateOR(doc_no: string, audit_user: string) {
        if (this.isEmptyString(doc_no) || this.isEmptyString(audit_user)) {
            throw new BadRequestException({
                statusCode: 400,
                message: "doc_no and audit_user can't be empty",
                data: []
            })
        }
        const existingFile:Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT COUNT(doc_no) as count FROM mgr.ar_blast_inv_approval 
            WHERE progress_approval = 0
                AND doc_no = '${doc_no}'
            `)
          if(existingFile[0].count > 0){
            return({
              statusCode:201,
              message:'receipt already generated',
              data:[]
            })
          }
        const process_id = Array(6)
            .fill(null)
            .map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26)))
            .join('');
        const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_ar_ledger_gen_or_web
            WHERE doc_no = '${doc_no}'
        `)
        if (result.length === 0) {
            throw new NotFoundException({
                statusCode: 404,
                message: 'No OR with this doc no',
                data: [],
            })
        }
        const count: Array<{ count: number }> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT count(doc_no) from mgr.ar_blast_inv_approval
            WHERE doc_no = '${doc_no}'
            AND related_class = 'OR'
            `)
        const revision_count = count[0].count
        let filename = `${doc_no}.pdf`
        if (revision_count > 0) {
            filename = `${doc_no}_rev_${revision_count}.pdf`
        }
        const pdfBody = {
            doc_no: result[0].doc_no,
            doc_date: result[0].doc_date,
            currency_cd: result[0].currency_cd,
            fdoc_amt: result[0].fdoc_amt,
            name: result[0].name,
            descs: result[0].descs,
            or_paid_by: result[0].or_paid_by,
            formid: result[0]?.formid || '',
            filename
        }

        try {
            await this.pdfgenerateService.generateOR(pdfBody)
        } catch (error) {
            throw new BadRequestException(error.response)
        }

        const approvalBody = {
            entity_cd: result[0].entity_cd,
            project_no: result[0].project_no,
            debtor_acct: result[0].debtor_acct,
            email_addr: result[0].email_addr,
            bill_type: null,
            doc_no,
            related_class: "OR",
            doc_date: moment(result[0].doc_date).format('DD MMM YYYY'),
            descs: result[0].descs,
            doc_amt: result[0].fdoc_amt,
            filenames: filename,
            filenames2: null,
            process_id,
            audit_user: audit_user,
            invoice_tipe: 'receipt',
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


        // const body = {
        //     entity_cd: result[0].entity_cd,
        //     project_no: result[0].project_no,
        //     debtor_acct: result[0].debtor_acct,
        //     email_addr: result[0].email_addr,
        //     doc_no: result[0].doc_no,
        //     descs: result[0].descs,
        //     doc_date: moment(result[0].doc_date).format('YYYYMMDD'),
        //     currency_cd: result[0].currency_cd,
        //     doc_amt: result[0].fdoc_amt,
        //     filenames: `${doc_no}.pdf`,
        //     process_id,
        //     audit_user,
        // }

        // try {
        //     console.log(body)
        //     await this.addToORTable(body)
        // } catch (error) {
        //     console.log(error)
        //     throw new BadRequestException({
        //         statusCode: 400,
        //         message: 'failed to add to mgr.ar_blast_or table',
        //         data: []
        //     })
        // }

        return {
            statusCode: 201,
            message: 'OR generated successfully',
            data: []
        }
    }

    async submitOr(data: Record<any, any>) {
        const { doc_no, process_id, audit_user, related_class
        } = data;
        if (this.isEmptyString(doc_no) || this.isEmptyString(process_id) || this.isEmptyString(audit_user) || this.isEmptyString(related_class)) {
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
              SELECT * FROM mgr.m_type_invoice_dtl 
                WHERE type_id = ${getType[0].type_id} 
                AND job_task LIKE '%Approval Lvl%'
          `);

        let approval_level: number = 0
        for (const row of getTypeDtl) {
            // Extract approval level from "Approval Lvl X"
            const approvalLevelMatch = row.job_task.match(/Approval Lvl (\d+)/);
            const approvalLevel = approvalLevelMatch
                ? parseInt(approvalLevelMatch[1], 10)
                : null;
            if (approvalLevel > getType[0].approval_pic){
                continue
            }
            if (approvalLevel >= approval_level){
                approval_level = approvalLevel
            }
            const getUser = await this.fjiDatabase.$queryRawUnsafe(`
                  SELECT * FROM mgr.m_user WHERE user_id = ${row.user_id}
              `);
              const existingDetail = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT COUNT(doc_no) as count FROM mgr.ar_blast_inv_approval_dtl 
                WHERE 
                  doc_no = '${doc_no}' 
                  AND approval_level = ${approvalLevel}
                  AND approval_user = '${getUser[0].email}'
                  AND process_id = '${process_id}'
                `)  
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
            if (existingDetail[0].count === 0){
            const approvalDtl = await this.addToApprovalDtl(approvalDtlBody);
                if (approvalDtl.statusCode == 400) {
                    throw new BadRequestException({
                        statusCode: 400,
                        message: 'Failed to add to approvals',
                        data: [],
                    });
                }
            }
        }
        await this.fjiDatabase.$executeRawUnsafe(`
          UPDATE mgr.ar_blast_inv_approval set approval_lvl = ${approval_level}, status_approve = 'P', progress_approval = 1
          WHERE process_id = '${process_id}' AND doc_no = '${doc_no}'
          `)

        return {
            statusCode: 200,
            message: 'OR submitted',
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
            if (!this.isEmptyString(approval_remarks)) {
                approval_remark = "'" + approval_remarks + "'";
            }
            const result = await this.fjiDatabase.$executeRaw(Prisma.sql`
                    INSERT INTO mgr.ar_blast_inv_approval_dtl 
                    (entity_cd, project_no, debtor_acct, 
                    doc_no, process_id, approval_level, approval_user, approval_status, approval_remarks,
                    audit_user)
                    VALUES 
                    (${entity_cd}, ${project_no}, ${debtor_acct}, 
                    ${doc_no}, ${process_id}, ${approval_level}, ${approval_user}, 
                    ${approval_status}, ${approval_remarks}, ${audit_user})
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


    async approve(
        doc_no: string,
        process_id: string,
        approval_user: string,
        approval_remarks: string,
        approval_status: string,
        approver_level: number,
    ) {
        if (
            this.isEmptyString(doc_no) ||
            this.isEmptyString(process_id) ||
            this.isEmptyString(approval_user) ||
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
        if (!this.isEmptyString(approval_remarks)) {
            approval_remark = "'" + approval_remarks + "'";
        }
        const approvalTable = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.ar_blast_inv_approval
            WHERE process_id = '${process_id}' AND doc_no = '${doc_no}'
            `);
        console.log('approval remark = ' + approval_remark);
        console.log('process_id = ' + process_id);
        console.log('approval_level = ' + approver_level);
        try {
            const result = await this.fjiDatabase.$executeRaw(Prisma.sql`
                 UPDATE mgr.ar_blast_inv_approval_dtl
                 SET approval_status = ${approval_status}, approval_date = GETDATE()      
                 WHERE doc_no = ${doc_no} 
                 AND process_id = ${process_id}           
                 AND approval_level = ${approver_level}      
            `)
            console.log("result")
            if (result === 0) {
                console.log("already approved")
                throw new BadRequestException({
                statusCode: 400,
                message: 'this document have alrady been approved',
                data: [],
                });
            }
            await this.fjiDatabase.$executeRaw(Prisma.sql`
                UPDATE mgr.ar_blast_inv_approval_dtl
                SET approval_remarks = ${approval_remarks}
                WHERE doc_no = ${doc_no} AND process_id = ${process_id} 
                AND approval_user = ${approval_user}
                `);
            if (approval_status === 'C') {
                try {
                    await this.fjiDatabase.$executeRawUnsafe(`
                        UPDATE mgr.ar_blast_inv_approval SET status_approve = '${approval_status}'
                        WHERE process_id = '${process_id}' 
                        `);
                } catch (error) {
                    console.log(error)
                    throw new BadRequestException({
                        statusCode: 400,
                        message: 'fail to update database to C',
                        data: [],
                    });
                }
                return {
                    statusCode: 200,
                    message: 'document cancelled',
                    data: [],
                };
            }
            if (approval_status === 'R') {
                try {
                    await this.fjiDatabase.$executeRawUnsafe(`
                                UPDATE mgr.ar_blast_inv_approval SET status_approve = '${approval_status}'
                                WHERE process_id = '${process_id}' 
                                `);
                    const lastApproval = await this.fjiDatabase.$queryRawUnsafe(`
                      SELECT * FROM mgr.ar_blast_inv_approval 
                      WHERE process_id = '${process_id}' 
                      AND doc_no = '${doc_no}'
                      ORDER BY rowID desc
                    `)

                    const new_process_id = Array(6)
                        .fill(null)
                        .map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26)))
                        .join('');
                    const approvalBody = {
                        entity_cd: lastApproval[0].entity_cd,
                        project_no: lastApproval[0].project_no,
                        debtor_acct: lastApproval[0].debtor_acct,
                        email_addr: lastApproval[0].email_addr,
                        bill_type: lastApproval[0].bill_type,
                        doc_no,
                        related_class: lastApproval[0].related_class,
                        doc_date: lastApproval[0].doc_date,
                        descs: lastApproval[0].descs,
                        doc_amt: lastApproval[0].doc_amt,
                        filenames: lastApproval[0].filenames,
                        filenames2: lastApproval[0].filenames2,
                        process_id: new_process_id,
                        audit_user: lastApproval[0].audit_user,
                        invoice_tipe: lastApproval[0].invoice_tipe,
                        currency_cd: lastApproval[0].currency_cd,
                    }

                    const approve = await this.addToApproval(approvalBody);
                    if (approve.statusCode == 400) {
                        throw new BadRequestException({
                            statusCode: 400,
                            message: 'Failed to add to approve',
                            data: [],
                        });
                    }


                } catch (error) {
                    console.log(error)
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
                    const result = await this.fjiDatabase.$queryRawUnsafe(`
                        SELECT * FROM mgr.ar_blast_inv_approval 
                        WHERE process_id = '${process_id}'
                        `)
                    const update = await this.fjiDatabase.$executeRawUnsafe(`
                UPDATE mgr.ar_blast_inv_approval SET status_approve = '${approval_status}'
                WHERE process_id = '${process_id}' 
                `);
                const previousFile: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                    SELECT * FROM mgr.ar_blast_or 
                    WHERE doc_no = '${doc_no}' 
                    AND process_id <> '${process_id}'
                    ORDER BY audit_date DESC
                `)
                    const body = {
                        entity_cd: result[0].entity_cd,
                        project_no: result[0].project_no,
                        debtor_acct: result[0].debtor_acct,
                        email_addr: result[0].email_addr,
                        doc_no: result[0].doc_no,
                        descs: result[0].descs,
                        doc_date: moment(result[0].doc_date).format('YYYYMMDD'),
                        currency_cd: result[0].currency_cd,
                        doc_amt: result[0].doc_amt,
                        filenames: result[0].filenames,
                        filenames2: previousFile[0]?.filename2 || null,
                        filenames3: previousFile[0]?.filenames3 || null,
                        process_id,
                        audit_user: result[0].audit_user,
                    }

                    try {
                        console.log(body)
                        const existingDocNo = await this.fjiDatabase.$queryRawUnsafe(`
                            SELECT COUNT(doc_no) as count from mgr.ar_blast_or 
                            WHERE doc_no = '${doc_no}'
                            AND process_id = '${process_id}'
                            `)

                          if(existingDocNo[0].count === 0){
                              await this.addToORTable(body)
                            }
                    } catch (error) {
                        console.log(error)
                        throw new BadRequestException({
                            statusCode: 400,
                            message: 'failed to add to mgr.ar_blast_or table.',
                            data: []
                        })
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
            console.log(error);
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

    async addToORTable(data: Record<any, any>) {
        const { entity_cd, project_no, debtor_acct, email_addr, bill_type, doc_no,
            doc_date, descs, currency_cd, doc_amt,
            filenames, filenames2, process_id, audit_user,
        } = data
        const result = await this.fjiDatabase.$executeRaw(Prisma.sql`
            INSERT INTO mgr.ar_blast_or
            (entity_cd, project_no, debtor_acct, email_addr, gen_date, doc_no,
             doc_date, descs, currency_cd, doc_amt, invoice_tipe, filenames, filenames2,
             process_id, audit_user, audit_date)
             VALUES
             (
             ${entity_cd}, ${project_no},${debtor_acct}, ${email_addr}, GETDATE(),
             ${doc_no}, ${doc_date}, ${descs}, ${currency_cd},
             ${doc_amt}, 'receipt', ${filenames}, ${filenames2},
             ${process_id}, ${audit_user}, GETDATE()
             )
            `)
        if (result === 0) {
            throw new BadRequestException({
                statusCode: 400,
                message: 'failed to add to mgr.ar_blast_or table ',
                data: []
            })
        }
    }

    async uploadFaktur(filePath: string, fileName: string, doc_no: string) {
        try {
            await this.connect();
            if (!fs.existsSync(filePath)) {
                console.error(`Local file does not exist: ${filePath}`);
            }

            await this.upload(filePath, `/UNSIGNED/GQCINV/FAKTUR/${fileName}`);

        } catch (error) {
            console.log("Error during upload:.", error);
            throw new BadRequestException({
                statusCode: 400,
                message: 'Failed to upload to FTP',
                data: [error],
            });
        }
        finally {
            console.log("Disconnecting from FTP servers");
            await this.disconnect();
        }

        const result = await this.fjiDatabase.$executeRawUnsafe(`
            UPDATE mgr.ar_blast_inv SET filenames3 = '${fileName}'
            WHERE doc_no = '${doc_no}'
            `)
        if (result === 0) {
            throw new BadRequestException({
                statusCode: 400,
                message: 'Failed to update ar blast table',
                data: [],
            });
        }
        return {
            statusCode: 201,
            message: 'Faktur pajak uploaded successfully',
            data: []
        }
    }

    async deleteFaktur(doc_no: string) {
        const fileName = `FP${doc_no}.pdf`
        try {
            await this.connect()
            await this.delete(`/UNSIGNED/GQCINV/FAKTUR/${fileName}`);

            const result = await this.fjiDatabase.$executeRaw(Prisma.sql`
                UPDATE mgr.ar_blast_inv SET filenames3 = NULL
                WHERE doc_no = ${doc_no}
                `)
            if (result === 0) {
                throw new BadRequestException({
                    statusCode: 400,
                    message: 'Failed to update ar blast table',
                    data: [],
                });
            }
            return {
                statusCode: 200,
                message: 'Faktur pajak deleted successfully',
                data: []
            }
        } catch (error) {
            console.log("Error during delete:.", error);
            throw new BadRequestException({
                statusCode: 400,
                message: 'Failed to delete file from FTP',
                data: [error],
            });
        }
        finally {
            console.log("Disconnecting from FTP servers");
            await this.disconnect();
        }

    }



    async getApprovalByUser(approval_user: string) {
        const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_inv_approval
            WHERE approval_user = '${approval_user}'
              AND approval_status = 'P'
              AND invoice_tipe = 'receipt'
              --AND (doc_no LIKE 'OR%'
                --OR doc_no LIKE 'SP%'
                --OR doc_no LIKE 'OF%')
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
                SELECT * FROM mgr.v_inv_approval_history
                WHERE approval_user = '${approval_user}'
                AND approval_status != 'P'
                AND invoice_tipe = 'receipt'
                --AND (doc_no LIKE 'OR%'
                    --OR doc_no LIKE 'SP%'
                    --OR doc_no LIKE 'OF%')
                ORDER BY approval_date DESC
                `);

        for (const item of result) {
            const details: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
              SELECT * FROM mgr.ar_blast_inv_approval_dtl
              WHERE process_id = '${item.process_id}'
          `);
            item.detail = details;
        }
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

    async getApprovalList(audit_user: string) {
        try {
            const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT abia.*, debtor_name = ad.name, entity_name = ent.entity_name, project_name = prj.descs FROM mgr.ar_blast_inv_approval abia
            INNER JOIN mgr.ar_debtor ad 
                ON abia.debtor_acct = ad.debtor_acct
                AND abia.entity_cd = ad.entity_cd
                AND abia.project_no = ad.project_no
            INNER JOIN mgr.cf_entity ent
                ON abia.entity_cd = ent.entity_cd
            INNER JOIN mgr.pl_project prj
                ON abia.entity_cd = prj.entity_cd
                AND abia.project_no = prj.project_no
            INNER JOIN mgr.ar_blast_inv_approval aba
                ON abia.process_id = aba.process_id
                AND abia.audit_user = aba.audit_user
            where abia.progress_approval = 0
                AND abia.audit_user = '${audit_user}'
                AND aba.invoice_tipe = 'receipt'
            --AND (abia.doc_no LIKE 'OR%'
                --OR abia.doc_no LIKE 'SP%'
                --OR abia.doc_no LIKE 'OF%') 
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

    async uploadExtraFile(
        fileName: string, filePath: string, doc_no: string, process_id: string, file_type: string
      ){
        try {
          await this.connect();
          if (!fs.existsSync(filePath)) {
              console.error(`Local file does not exist: ${filePath}`);
          }
    
          await this.upload(filePath, `/UNSIGNED/GQCINV/EXTRA/${fileName}`);
    
      } catch (error) {
          console.log("Error during upload:.", error);
          throw new BadRequestException({
              statusCode: 400,
              message: 'Failed to upload to FTP',
              data: [error],
          });
      }
      finally {
          console.log("Disconnecting from FTP servers");
          await this.disconnect();
      }
    let result = 0;
    if(file_type === 'receipt'){
        result = await this.fjiDatabase.$executeRawUnsafe(`
                UPDATE mgr.ar_blast_or SET filenames2 = '${fileName}'
                WHERE doc_no = '${doc_no}'
                AND process_id = '${process_id}'
            `)
    }
    else {
        result = await this.fjiDatabase.$executeRawUnsafe(`
            UPDATE mgr.ar_blast_inv SET filenames5 = '${fileName}'
            WHERE doc_no = '${doc_no}'
            AND process_id = '${process_id}'
            `)
    }
    if (result === 0) {
          throw new BadRequestException({
              statusCode: 400,
              message: 'Failed to update ar blast table',
              data: [],
          });
      }
      return {
          statusCode: 201,
          message: 'extra files uploaded successfully',
          data: []
      }
    }

    async deleteExtraFile(file_type:string, doc_no: string, file_name) {
        try {
            await this.connect()
            await this.delete(`/UNSIGNED/GQCINV/EXTRA/${file_name}`);
            if (file_type === 'invoice'){
                const result = await this.fjiDatabase.$executeRaw(Prisma.sql`
                    UPDATE mgr.ar_blast_inv SET filenames5 = NULL
                    WHERE doc_no = ${doc_no}
                    `)
                if (result === 0) {
                    throw new BadRequestException({
                        statusCode: 400,
                        message: 'Failed to update ar blast table',
                        data: [],
                    });
                }
                return {
                    statusCode: 200,
                    message: 'extra files deleted successfully',
                    data: []
                }
            }
            else if (file_type === 'receipt'){
                const result = await this.fjiDatabase.$executeRaw(Prisma.sql`
                    UPDATE mgr.ar_blast_or SET filenames2 = NULL
                    WHERE doc_no = ${doc_no}
                    `)
                if (result === 0) {
                    throw new BadRequestException({
                        statusCode: 400,
                        message: 'Failed to update ar blast table',
                        data: [],
                    });
                }
                return {
                    statusCode: 200,
                    message: 'extra files deleted successfully',
                    data: []
                }
            }
        } catch (error) {
            console.log("Error during delete:.", error);
            // throw new BadRequestException({
            return({
                statusCode: 400,
                message: 'Failed to delete file from FTP',
                data: [],
            });
        }
        finally {
            console.log("Disconnecting from FTP servers");
            await this.disconnect();
        }

    }
    async receiptInqueries() {
        const orRegenerate: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT abia.*, debtor_name = name, entity_name = ent.entity_name, project_name = prj.descs 
            FROM mgr.ar_blast_or abia
            INNER JOIN mgr.ar_debtor ad 
            ON abia.debtor_acct = ad.debtor_acct
              AND abia.entity_cd = ad.entity_cd
              AND abia.project_no = ad.project_no
            INNER JOIN mgr.cf_entity ent
              ON abia.entity_cd = ent.entity_cd
            INNER JOIN mgr.pl_project prj
              ON abia.entity_cd = prj.entity_cd
              AND abia.project_no = prj.project_no
            WHERE send_status = 'R'
            AND send_date IS NOT NULL
            AND send_id IS NOT NULL
            ORDER BY rowID desc
          `);
        const orRegenerateWithStatus = orRegenerate.map((row) => ({ ...row, status: 'cancelled for resending' }));
          
        const orNotStamped: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
          SELECT abia.*, debtor_name = name, entity_name = ent.entity_name, project_name = prj.descs 
            FROM mgr.ar_blast_or abia
            INNER JOIN mgr.ar_debtor ad 
            ON abia.debtor_acct = ad.debtor_acct
                AND abia.entity_cd = ad.entity_cd
                AND abia.project_no = ad.project_no
            INNER JOIN mgr.cf_entity ent
                ON abia.entity_cd = ent.entity_cd
            INNER JOIN mgr.pl_project prj
                ON abia.entity_cd = prj.entity_cd
                AND abia.project_no = prj.project_no
          WHERE status_process_sign = 'N'
          AND send_id IS NULL
        `);
        const orNotStampedWithStatus = orNotStamped.map((row) => ({ ...row, status: 'no stamp' }));

        const orFailStamp: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
          SELECT abia.*, debtor_name = name, entity_name = ent.entity_name, project_name = prj.descs 
            FROM mgr.ar_blast_or abia
            INNER JOIN mgr.ar_debtor ad 
            ON abia.debtor_acct = ad.debtor_acct
                AND abia.entity_cd = ad.entity_cd
                AND abia.project_no = ad.project_no
            INNER JOIN mgr.cf_entity ent
                ON abia.entity_cd = ent.entity_cd
            INNER JOIN mgr.pl_project prj
                ON abia.entity_cd = prj.entity_cd
                AND abia.project_no = prj.project_no
          WHERE file_status_sign = 'F'
          AND send_id IS NULL
        `);
        const orFailStampWithStatus = orFailStamp.map((row) => ({ ...row, status: 'fail stamp' }));

        const approvalPending: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
          SELECT abia.*, debtor_name = name, entity_name = ent.entity_name, project_name = prj.descs 
            FROM mgr.ar_blast_inv_approval abia
            INNER JOIN mgr.ar_debtor ad 
            ON abia.debtor_acct = ad.debtor_acct
                AND abia.entity_cd = ad.entity_cd
                AND abia.project_no = ad.project_no
            INNER JOIN mgr.cf_entity ent
                ON abia.entity_cd = ent.entity_cd
            INNER JOIN mgr.pl_project prj
                ON abia.entity_cd = prj.entity_cd
                AND abia.project_no = prj.project_no
          WHERE status_approve = 'P'
          AND progress_approval > 0
          AND abia.doc_no NOT IN (SELECT doc_no from mgr.ar_blast_or)
          AND related_class = 'OR'
          `)

        const approvalPendingWithStatus = await Promise.all(
            approvalPending.map(async (row) => {
                const details: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                  SELECT * FROM mgr.ar_blast_inv_approval_dtl WHERE process_id = '${row.process_id}'
                `);

                return {
                    ...row,
                    status: `approval pending (${row.progress_approval})`,
                    details,
                    file_status_sign: null,
                };
            })
        )
        const cancelled: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT abia.*, debtor_name = name, entity_name = ent.entity_name, project_name = prj.descs 
            FROM mgr.ar_blast_inv_approval abia
            INNER JOIN mgr.ar_debtor ad 
            ON abia.debtor_acct = ad.debtor_acct
              AND abia.entity_cd = ad.entity_cd
              AND abia.project_no = ad.project_no
            INNER JOIN mgr.cf_entity ent
              ON abia.entity_cd = ent.entity_cd
            INNER JOIN mgr.pl_project prj
              ON abia.entity_cd = prj.entity_cd
              AND abia.project_no = prj.project_no
            WHERE status_approve = 'C'
              AND progress_approval > 0
              AND abia.doc_no NOT IN (SELECT doc_no from mgr.ar_blast_inv)
              AND related_class = 'OR'
            ORDER BY rowID desc
        `)

        const cancelledWithStatus = await Promise.all(
            cancelled.map(async (row) => {
                const details: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                    SELECT * FROM mgr.ar_blast_inv_approval_dtl WHERE process_id = '${row.process_id}'
                  `);

                return {
                    ...row,
                    status: `cancelled`,
                    details,
                    file_status_sign: null,
                };
            })
        )

        const generated: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
          SELECT abia.*, debtor_name = name, entity_name = ent.entity_name, project_name = prj.descs 
            FROM mgr.ar_blast_inv_approval abia
            INNER JOIN mgr.ar_debtor ad 
            ON abia.debtor_acct = ad.debtor_acct
                AND abia.entity_cd = ad.entity_cd
                AND abia.project_no = ad.project_no
            INNER JOIN mgr.cf_entity ent
                ON abia.entity_cd = ent.entity_cd
            INNER JOIN mgr.pl_project prj
                ON abia.entity_cd = prj.entity_cd
                AND abia.project_no = prj.project_no
          WHERE progress_approval = 0
          AND related_class = 'OR'
          `)

        const generatedWithStatus = generated.map((row) => ({ ...row, status: 'generated', file_status_sign: null, }))

        const orSent: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
          SELECT abia.*, debtor_name = name, entity_name = ent.entity_name, project_name = prj.descs 
            FROM mgr.ar_blast_or abia
            INNER JOIN mgr.ar_debtor ad 
            ON abia.debtor_acct = ad.debtor_acct
                AND abia.entity_cd = ad.entity_cd
                AND abia.project_no = ad.project_no
            INNER JOIN mgr.cf_entity ent
                ON abia.entity_cd = ent.entity_cd
            INNER JOIN mgr.pl_project prj
                ON abia.entity_cd = prj.entity_cd
                AND abia.project_no = prj.project_no
          WHERE send_status = 'S'
        `);
        const orSentWithStatus = orSent.map((row) => ({ ...row, status: 'sent' }));
        const orFailSent: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
          SELECT abia.*, debtor_name = name, entity_name = ent.entity_name, project_name = prj.descs 
            FROM mgr.ar_blast_or abia
            INNER JOIN mgr.ar_debtor ad 
            ON abia.debtor_acct = ad.debtor_acct
                AND abia.entity_cd = ad.entity_cd
                AND abia.project_no = ad.project_no
            INNER JOIN mgr.cf_entity ent
                ON abia.entity_cd = ent.entity_cd
            INNER JOIN mgr.pl_project prj
                ON abia.entity_cd = prj.entity_cd
                AND abia.project_no = prj.project_no
          WHERE send_status = 'F'
        `);
        const orFailSentWithStatus = orFailSent.map((row) => ({ ...row, status: 'fail to send' }));

        const orStamped: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
          SELECT abia.*, debtor_name = name, entity_name = ent.entity_name, project_name = prj.descs 
            FROM mgr.ar_blast_or abia
            INNER JOIN mgr.ar_debtor ad 
            ON abia.debtor_acct = ad.debtor_acct
                AND abia.entity_cd = ad.entity_cd
                AND abia.project_no = ad.project_no
            INNER JOIN mgr.cf_entity ent
                ON abia.entity_cd = ent.entity_cd
            INNER JOIN mgr.pl_project prj
                ON abia.entity_cd = prj.entity_cd
                AND abia.project_no = prj.project_no
          WHERE (
            doc_amt >= 5000000 AND abia.currency_cd = 'RP' 
            OR 
            doc_amt >= 300 AND abia.currency_cd = 'USD'
            )
          AND status_process_sign = 'Y'
          AND file_status_sign = 'S' 
          AND send_id IS NULL
        `);
        const orStampedWithStatus = orStamped.map((row) => ({ ...row, status: 'stamped' }));

        const orApprovedCompleted: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
          SELECT abia.*, debtor_name = name, entity_name = ent.entity_name, project_name = prj.descs 
            FROM mgr.ar_blast_or abia
            INNER JOIN mgr.ar_debtor ad 
            ON abia.debtor_acct = ad.debtor_acct
                AND abia.entity_cd = ad.entity_cd
                AND abia.project_no = ad.project_no
            INNER JOIN mgr.cf_entity ent
                ON abia.entity_cd = ent.entity_cd
            INNER JOIN mgr.pl_project prj
                ON abia.entity_cd = prj.entity_cd
                AND abia.project_no = prj.project_no
          WHERE status_process_sign IS NULL
          AND send_id IS NULL
          AND send_status IS NULL
        `);
        const orApprovedCompletedWithStatus = await Promise.all(
            orApprovedCompleted.map(async (row) => {
                const details: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                  SELECT * FROM mgr.ar_blast_inv_approval_dtl WHERE process_id = '${row.process_id}'
                `);

                return {
                    ...row,
                    status: `approve completed`,
                    details,
                    file_status_sign: null,
                };
            })
        )

        // Combine all results into a single array
        const combinedResults = [
            ...generatedWithStatus,
            ...approvalPendingWithStatus,
            ...cancelledWithStatus,
            ...orApprovedCompletedWithStatus,
            ...orFailStampWithStatus,
            ...orNotStampedWithStatus,
            ...orStampedWithStatus,
            ...orSentWithStatus,
            ...orFailSentWithStatus,
            ...orRegenerateWithStatus
        ];

        return {
            statusCode: 200,
            message: "get or success",
            data: combinedResults
        };

    }
}
