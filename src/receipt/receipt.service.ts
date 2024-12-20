import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SqlserverDatabaseService } from 'src/database/database-sqlserver.service';
import { DatabaseService } from 'src/database/database.service';
import * as moment from 'moment';
import * as fs from 'fs';
import { PdfgenerateService } from 'src/pdfgenerate/pdfgenerate.service';
import * as ftp from 'basic-ftp';
import * as path from 'path';

@Injectable()
export class ReceiptService {
    private client: ftp.Client;
    constructor(
        private readonly sqlserver: SqlserverDatabaseService,
        private readonly postgre: DatabaseService,
        private readonly httpService: HttpService,
        private readonly pdfService: PdfgenerateService
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
            const result: Array<any> = await this.sqlserver.$queryRawUnsafe(`
                SELECT doc_no,file_status,* FROM mgr.ar_email_or_dtl
                WHERE doc_amt < 5000000 
                    AND file_status IS NULL 
                    AND process_id = '0'
                    OR (doc_amt >= 5000000 AND file_status IN ('S', 'N'))
                    AND NOT EXISTS (
                        SELECT * FROM mgr.ar_email_or
                            WHERE mgr.ar_email_or.entity_cd = mgr.ar_email_or_dtl.entity_cd
                            AND mgr.ar_email_or.project_no = mgr.ar_email_or_dtl.project_no
                            AND mgr.ar_email_or.debtor_acct = mgr.ar_email_or_dtl.debtor_acct
                            AND mgr.ar_email_or.gen_date = mgr.ar_email_or_dtl.gen_date
                            AND mgr.ar_email_or.process_id = mgr.ar_email_or_dtl.process_id
                            AND mgr.ar_email_or.send_status IN ('S', 'F')
                        )
                ORDER BY rowid DESC
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
            const result: Array<any> = await this.sqlserver.$queryRawUnsafe(`
                SELECT * FROM mgr.ar_email_or_dtl
                WHERE doc_no = '${doc_no}'
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
            const result: Array<any> = await this.sqlserver.$queryRawUnsafe(`
                SELECT * FROM mgr.ar_email_or 
                WHERE process_id != '0' 
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
    async getHistoryDetail(process_id: string) {
        try {
            const result: Array<any> = await this.sqlserver.$queryRawUnsafe(`
                SELECT * FROM mgr.ar_email_or_dtl
                WHERE process_id = '${process_id}'
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
            file_status = "IS NULL AND process_id = '0'"
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
            const result: Array<any> = await this.sqlserver.$queryRawUnsafe(`
                SELECT * FROM mgr.ar_email_or_dtl 
                WHERE doc_amt >= 5000000 
                AND file_status ${file_status}
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
    async getStamps(data: Record<any, any>) {
        const { startDate, endDate } = data
        try {
            const result: Array<any> = await this.sqlserver.$queryRawUnsafe(`
                SELECT TOP(5) * FROM mgr.ar_email_or_dtl 
                WHERE doc_amt >= 5000000 
                AND year(gen_date)*10000+month(gen_date)*100+day(gen_date) >= '${startDate}'
                AND year(gen_date)*10000+month(gen_date)*100+day(gen_date) <= '${endDate}'
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
    async generateReceipt(doc_no: string) {
        const result = await this.sqlserver.$queryRawUnsafe(`
            SELECT * FROM mgr.ar_email_or_dtl  
                WHERE doc_no = '${doc_no}'
            `)
        const pdfBody = {
            no: `BI${moment(result[0]?.gen_date).format('YYDDMM')}26` || null,
            date: moment(result[0]?.gen_date).format('DD/MM/YYYY') || null,
            receiptFrom: `${result[0]?.debtor_acct} - ${result[0]?.debtor_name}` || null,
            amount: result[0]?.doc_amt || 10000,
            forPayment: result[0]?.doc_no || null,
            signedDate: moment(result[0]?.gen_date).format('DD MMMM YYYY') || null,
            city: "jakarta",
            billType: result[0]?.bill_type || null,
        };

        await this.pdfService.generatePdfProforma(pdfBody);

        try {
            await this.connect();
            const rootFolder = process.env.ROOT_PDF_FOLDER;
            const filePath = `${rootFolder}proforma/pakubuwono_${result[0].doc_no}.pdf`;
            if (!fs.existsSync(filePath)) {
                console.error(`Local file does not exist: ${filePath}`);
            }

            await this.upload(filePath, `/UNSIGNED/GQCINV/RECEIPT/${result[0].doc_no}.pdf`);

        } catch (error) {
            console.log("Error during upload:.", error);
            throw new BadRequestException({
                statusCode: 400,
                message: 'Failed to upload to FTP',
                data: [error],
            });
        } finally {
            console.log("Disconnecting from FTP servers");
            await this.disconnect();
        }
        return ({
            statusCode: 201,
            message: "pdf generated successfuly",
            data: [{ path: `/UNSIGNED/GQCINV/RECEIPT/${result[0].doc_no}.pdf` }]
        })
    }
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
            const result: Array<any> = await this.postgre.$queryRawUnsafe(`
                SELECT * FROM file 
                WHERE company_cd = '${company_cd}' 
                AND TO_CHAR(stamp_date, 'YYYYMMDD') >= '${startDate}'
                AND TO_CHAR(stamp_date, 'YYYYMMDD') <= '${endDate}'
                ORDER BY id ASC
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
}
