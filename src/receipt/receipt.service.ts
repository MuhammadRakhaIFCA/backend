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

    async disconnect() {
        try {
            this.client.close();
            console.log('Disconnected from FTP server');
        } catch (err) {
            console.error('Failed to disconnect', err);
            throw err;
        }
    }

    async getReceipt() {
        try {
            const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT abo.*, debtor_name = name FROM mgr.ar_blast_or abo 
                INNER JOIN mgr.ar_debtor ad 
                ON abo.debtor_acct = ad.debtor_acct
                AND abo.entity_cd = ad.entity_cd
                AND abo.project_no = ad.project_no
                WHERE doc_amt <= 5000000
                AND file_status_sign IS NULL
                AND send_id IS NULL
                OR (doc_amt >= 5000000 AND status_process_sign IN ('Y', 'N') AND send_id IS NULL)
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
        const { startDate, endDate, status } = data
        try {
            const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT abia.*, debtor_name = name FROM mgr.ar_blast_or abia 
                INNER JOIN mgr.ar_debtor ad 
                ON abia.debtor_acct = ad.debtor_acct
                AND abia.entity_cd = ad.entity_cd
                AND abia.project_no = ad.project_no
                WHERE send_id IS NOT NULL 
                AND year(send_date)*10000+month(send_date)*100+day(send_date) >= '${startDate}' 
                AND year(send_date)*10000+month(send_date)*100+day(send_date) <= '${endDate}'
                AND send_status = '${status}'
                ORDER BY send_date DESC
            `)
            if (!result || result.length === 0) {
                console.log(result.length)
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
            throw new NotFoundException(
                error.response
            );
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

    async getStamp(status: string) {
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
                 SELECT abo.*, debtor_name = name FROM mgr.ar_blast_or abo 
                INNER JOIN mgr.ar_debtor ad 
                ON abo.debtor_acct = ad.debtor_acct
                AND abo.entity_cd = ad.entity_cd
                AND abo.project_no = ad.project_no
                WHERE doc_amt >= 5000000 
                AND file_status_sign ${file_status}
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
            AND doc_no NOT IN ( SELECT doc_no FROM mgr.ar_blast_or ) 
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
        const pdfBody = {
            doc_no: result[0].doc_no,
            doc_date: result[0].doc_date,
            currency_cd: result[0].currency_cd,
            fdoc_amt: result[0].fdoc_amt,
            name: result[0].name,
            descs: result[0].descs,
            or_paid_by: result[0].or_paid_by,
        }

        try {
            await this.pdfgenerateService.generateOR(pdfBody)
        } catch (error) {
            throw new BadRequestException(error.response)
        }

        const body = {
            entity_cd: result[0].entity_cd,
            project_no: result[0].project_no,
            debtor_acct: result[0].debtor_acct,
            email_addr: result[0].email_addr,
            doc_no: result[0].doc_no,
            descs: result[0].descs,
            doc_date: moment(result[0].doc_date).format('YYYYMMDD'),
            currency_cd: result[0].currency_cd,
            doc_amt: result[0].fdoc_amt,
            filenames: `${doc_no}.pdf`,
            process_id,
            audit_user,
            // entity_cd, project_no, debtor_acct, email_addr, gen_date, bill_type, doc_no,
            //  doc_date, descs, currency_cd, doc_amt, tax_invoice_no, invoice_tipe, filenames,
            //  filenames2, process_id, audit_user, audit_date
        }

        try {
            console.log(body)
            await this.addToORTable(body)
        } catch (error) {
            console.log(error)
            throw new BadRequestException({
                statusCode: 400,
                message: 'failed to add to mgr.ar_blast_or table',
                data: []
            })
        }

        return {
            statusCode: 201,
            message: 'OR generated successfully',
            data: []
        }
    }

    async addToORTable(data: Record<any, any>) {
        const { entity_cd, project_no, debtor_acct, email_addr, bill_type, doc_no,
            doc_date, descs, currency_cd, doc_amt,
            filenames, process_id, audit_user,
        } = data
        const result = await this.fjiDatabase.$executeRaw(Prisma.sql`
            INSERT INTO mgr.ar_blast_or
            (entity_cd, project_no, debtor_acct, email_addr, gen_date, doc_no,
             doc_date, descs, currency_cd, doc_amt, invoice_tipe, filenames,
             process_id, audit_user, audit_date)
             VALUES
             (
             ${entity_cd}, ${project_no},${debtor_acct}, ${email_addr}, GETDATE(),
             ${doc_no}, ${doc_date}, ${descs}, ${currency_cd},
             ${doc_amt}, 'receipt', ${filenames}, 
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
}
