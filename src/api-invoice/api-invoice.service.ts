import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as moment from 'moment';
import { SqlserverDatabaseService } from 'src/database/database-sqlserver.service';
import { PdfgenerateService } from 'src/pdfgenerate/pdfgenerate.service';
import { generateDto } from './dto/generate.dto';
import * as ftp from 'basic-ftp';
import * as fs from 'fs';
import * as path from 'path';
import { FjiDatabaseService } from 'src/database/database-fji.service';

@Injectable()
export class ApiInvoiceService {
    private client: ftp.Client;
    constructor
        (
            private readonly sqlserver: SqlserverDatabaseService,
            private readonly fjiDatabase: FjiDatabaseService,
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

    async generateSchedule(doc_no: string, bill_type: string, meter_type: string) {
        const result = await this.fjiDatabase.$queryRawUnsafe(`
            select * from mgr.v_ar_ledger_sch_inv_web 
            where doc_no = '${doc_no}' 
            and entity_cd = '0001'
            `)
        const pdfBody = {
            debtor_acct: result[0].debtor_acct,
            debtor_name: result[0].debtor_name,
            address1: result[0].address1,
            address2: result[0].address2,
            address3: result[0].address3,
            post_cd: result[0].post_cd,
            trx_type: result[0].trx_type,
            doc_no: result[0].doc_no,
            doc_date: result[0].doc_date,
            due_date: result[0].due_date,
            descs: result[0].descs,
            descs_lot: result[0]?.descs_lot || "",
            start_date: result[0].start_date,
            end_date: result[0].end_date,
            currency_cd: result[0].currency_cd,
            base_amt: result[0].base_amt,
            tax_amt: result[0].tax_amt,
            tax_scheme: result[0].tax_shceme,
            tax_rate: result[0].tax_rate,
            pph_rate: result[0].pph_rate,
            line1: result[0].line1,
            signature: result[0].signature,
            designation: result[0].designation,
            bank_name_rp: result[0].bank_name_rp,
            bank_name_usd: result[0].bank_name_usd || "",
            account_rp: result[0].account_rp,
            account_usd: result[0]?.account_usd || "",
            alloc_amt: result[0]?.alloc_amt,
            notes: result[0].notes,
            sequence_no: result[0].sequence_no,
            group_cd: result[0].group_cd,
            inv_group: result[0].inv_group,
            bill_type,
            meter_type,
        };

        try {
            await this.pdfService.generatePdfSchedule(pdfBody);
            if (bill_type === 'E' && meter_type === 'G') {
                await this.pdfService.generateReferenceG(result[0].doc_no, result[0].debtor_acct, result[0].doc_date)
            }
            else if (bill_type === 'V') {
                await this.pdfService.generateReferenceV(result[0].doc_no, result[0].debtor_acct, result[0].doc_date)
            }
        } catch (error) {
            return error.response
        }

        return ({
            statusCode: 201,
            message: "pdf generated successfuly",
            data: [{ path: `/UNSIGNED/GQCINV/SCHEDULE/${result[0].doc_no}.pdf` }]
        })
    }

    async generateManual(doc_no: string) {
        const result = await this.sqlserver.$queryRawUnsafe(`
            SELECT  FROM mgr.ar_email_inv_dtl 
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


        // try {
        //     await this.connect();
        //     const rootFolder = process.env.ROOT_PDF_FOLDER;
        //     const filePath = `${rootFolder}proforma/pakubuwono_${result[0].doc_no}.pdf`;
        //     if (!fs.existsSync(filePath)) {
        //         console.error(`Local file does not exist: ${filePath}`);
        //     }

        //     await this.upload(filePath, `/UNSIGNED/GQCINV/PROFORMA/${result[0].doc_no}.pdf`);

        // } catch (error) {
        //     console.log("Error during upload:.", error);
        //     throw new BadRequestException({
        //         statusCode: 400,
        //         message: 'Failed to upload to FTP',
        //         data: [error],
        //     });
        // } finally {
        //     console.log("Disconnecting from FTP servers");
        //     await this.disconnect();
        // }
        return ({
            statusCode: 201,
            message: "pdf generated successfuly",
            data: [{ path: `/UNSIGNED/GQCINV/PROFORMA/${result[0].doc_no}.pdf` }]
        })
    }


    async getSchedule(data: generateDto) {
        const { startDate, endDate } = data
        try {
            console.log(startDate, endDate)
            const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT * 
                FROM mgr.v_ar_ledger_gen_bill_sch_web
                WHERE 
                 year(doc_date)*10000+month(doc_date)*100+day(doc_date) >= '${startDate}' 
                AND year(doc_date)*10000+month(doc_date)*100+day(doc_date) <= '${endDate}'
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
            throw new NotFoundException(
                error.response
            );
        }
    }

    async getManual(data: generateDto) {
        const { startDate, endDate } = data
        try {
            const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                select top(5) * from mgr.v_ar_ledger_gen_inv_manual_web
                WHERE 
                 year(doc_date)*10000+month(doc_date)*100+day(doc_date) >= '${startDate}' 
                AND year(doc_date)*10000+month(doc_date)*100+day(doc_date) <= '${endDate}'
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
            const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                select top(5) * from mgr.v_ar_ledger_gen_inv_proforma_web
                WHERE 
                 year(doc_date)*10000+month(doc_date)*100+day(doc_date) >= '${startDate}' 
                AND year(doc_date)*10000+month(doc_date)*100+day(doc_date) <= '${endDate}'
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
