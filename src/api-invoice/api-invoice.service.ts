import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as moment from 'moment';
import { SqlserverDatabaseService } from 'src/database/database-sqlserver.service';
import { PdfgenerateService } from 'src/pdfgenerate/pdfgenerate.service';
import { generateDto } from './dto/generate.dto';
import * as ftp from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ApiInvoiceService {
    private client: ftp.Client;
    constructor
        (
            private readonly sqlserver: SqlserverDatabaseService,
            private readonly httpService: HttpService,
            private readonly pdfService: PdfgenerateService
        ) {
        this.client = new ftp.Client();
        this.client.ftp.verbose = true;
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
    async getInvoice() {
        try {
            const result: Array<any> = await this.sqlserver.$queryRawUnsafe(`select * from mgr.ar_email_inv`);
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
            throw new NotFoundException(
                error.response
            );
        }
    }

    async getInvoiceDetail(doc_no: string) {
        try {
            const result: Array<any> = await this.sqlserver.$queryRawUnsafe(`
                SELECT * FROM mgr.ar_email_inv_dtl
                WHERE doc_no = '${doc_no}'
            `)
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
            throw new NotFoundException(
                error.response
            );
        }
    }

    async getHistory(data: Record<any, any>) {
        const { startDate, endDate, status } = data
        try {
            const result: Array<any> = await this.sqlserver.$queryRawUnsafe(`
                SELECT * FROM mgr.ar_email_inv 
                WHERE process_id != '0' 
                AND year(send_date)*10000+month(send_date)*100+day(send_date) >= '${startDate}' 
                AND year(send_date)*10000+month(send_date)*100+day(send_date) <= '${endDate}'
                AND send_status = '${status}'
                ORDER BY send_date DESC
            `)
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
            throw new NotFoundException(
                error.response
            );
        }
    }

    async getHistoryDetail(email_addr: string, doc_no: string) {
        try {
            const result: Array<any> = await this.sqlserver.$queryRawUnsafe(`
                SELECT * FROM mgr.ar_email_inv_dtl
                WHERE doc_no = '${doc_no}'
                AND email_addr LIKE '%${email_addr}%'
            `)
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
            throw new NotFoundException(
                error.response
            );
        }
    }

    async generateSchedule(doc_no: string) {
        const result = await this.sqlserver.$queryRawUnsafe(`
            SELECT TOP (5)* FROM mgr.ar_email_inv_dtl 
                WHERE doc_no = '${doc_no}'
            `)
        const pdfBody = {
            no: `BI${moment(result[0].gen_date).format('YYDDMM')}26`,
            date: moment(result[0].gen_date).format('DD/MM/YYYY'),
            receiptFrom: `${result[0].debtor_acct} - ${result[0].debtor_name}`,
            amount: result[0].doc_amt,
            forPayment: result[0].doc_no,
            signedDate: moment(result[0].gen_date).format('DD MMMM YYYY'),
            city: "jakarta",
            billType: result[0].bill_type,
        };

        await this.pdfService.generatePdfSchedule(pdfBody);

        try {
            await this.connect();
            const rootFolder = process.env.ROOT_PDF_FOLDER;
            const filePath = `${rootFolder}schedule/pakubuwono_${result[0].doc_no}.pdf`;
            if (!fs.existsSync(filePath)) {
                console.error(`Local file does not exist: ${filePath}`);
            }

            await this.upload(filePath, `/UNSIGNED/GQCINV/SCHEDULE/${result[0].doc_no}.pdf`);

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
            data: [{ path: `/UNSIGNED/GQCINV/SCHEDULE/${result[0].doc_no}.pdf` }]
        })
    }

    async generateManual(doc_no: string) {
        const result = await this.sqlserver.$queryRawUnsafe(`
            SELECT TOP (5)* FROM mgr.ar_email_inv_dtl 
                WHERE doc_no = '${doc_no}'
            `)
        const pdfBody = {
            no: `BI${moment(result[0].gen_date).format('YYDDMM')}26`,
            date: moment(result[0].gen_date).format('DD/MM/YYYY'),
            receiptFrom: `${result[0].debtor_acct} - ${result[0].debtor_name}`,
            amount: result[0].doc_amt,
            forPayment: result[0].doc_no,
            signedDate: moment(result[0].gen_date).format('DD MMMM YYYY'),
            city: "jakarta",
            billType: result[0].bill_type,
        };

        await this.pdfService.generatePdfManual(pdfBody);

        try {
            await this.connect();
            const rootFolder = process.env.ROOT_PDF_FOLDER;
            const filePath = `${rootFolder}manual/pakubuwono_${result[0].doc_no}.pdf`;
            if (!fs.existsSync(filePath)) {
                console.error(`Local file does not exist: ${filePath}`);
            }

            await this.upload(filePath, `/UNSIGNED/GQCINV/MANUAL/${result[0].doc_no}.pdf`);

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
            data: [{ path: `/UNSIGNED/GQCINV/MANUAL/${result[0].doc_no}.pdf` }]
        })
    }

    async generateProforma(doc_no: string) {
        const result = await this.sqlserver.$queryRawUnsafe(`
            SELECT * FROM mgr.ar_email_inv_dtl 
                WHERE doc_no = '${doc_no}'
            `)
        const pdfBody = {
            no: `BI${moment(result[0].gen_date).format('YYDDMM')}26`,
            date: moment(result[0].gen_date).format('DD/MM/YYYY'),
            receiptFrom: `${result[0].debtor_acct} - ${result[0].debtor_name}`,
            amount: result[0].doc_amt,
            forPayment: result[0].doc_no,
            signedDate: moment(result[0].gen_date).format('DD MMMM YYYY'),
            city: "jakarta",
            billType: result[0].bill_type,
        };

        await this.pdfService.generatePdfProforma(pdfBody);

        try {
            await this.connect();
            const rootFolder = process.env.ROOT_PDF_FOLDER;
            const filePath = `${rootFolder}proforma/pakubuwono_${result[0].doc_no}.pdf`;
            if (!fs.existsSync(filePath)) {
                console.error(`Local file does not exist: ${filePath}`);
            }

            await this.upload(filePath, `/UNSIGNED/GQCINV/PROFORMA/${result[0].doc_no}.pdf`);

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
            data: [{ path: `/UNSIGNED/GQCINV/PROFORMA/${result[0].doc_no}.pdf` }]
        })
    }


    async getSchedule(data: generateDto) {
        const { startDate, endDate } = data
        try {
            const result: Array<any> = await this.sqlserver.$queryRawUnsafe(`
                SELECT TOP (5)* FROM mgr.ar_email_inv_dtl 
                WHERE
                 year(gen_date)*10000+month(gen_date)*100+day(gen_date) >= '${startDate}'
                AND year(gen_date)*10000+month(gen_date)*100+day(gen_date) <= '${endDate}'
                ORDER BY gen_date DESC
            `)
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
            throw new NotFoundException(
                error.response
            );
        }
    }

    async getManual(data: generateDto) {
        const { startDate, endDate } = data
        try {
            const result: Array<any> = await this.sqlserver.$queryRawUnsafe(`
                SELECT TOP (5)* FROM mgr.ar_email_inv_dtl 
                WHERE
                 year(gen_date)*10000+month(gen_date)*100+day(gen_date) >= '${startDate}'
                AND year(gen_date)*10000+month(gen_date)*100+day(gen_date) <= '${endDate}'
                ORDER BY gen_date DESC
            `)
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
            throw new NotFoundException(
                error.response
            );
        }
    }

    async getProforma(data: generateDto) {
        const { startDate, endDate } = data
        try {
            const result: Array<any> = await this.sqlserver.$queryRawUnsafe(`
                SELECT TOP (5)* FROM mgr.ar_email_inv_dtl 
                WHERE
                 year(gen_date)*10000+month(gen_date)*100+day(gen_date) >= '${startDate}'
                AND year(gen_date)*10000+month(gen_date)*100+day(gen_date) <= '${endDate}'
                ORDER BY gen_date DESC
            `)
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
            throw new NotFoundException(
                error.response
            );
        }
    }

}
