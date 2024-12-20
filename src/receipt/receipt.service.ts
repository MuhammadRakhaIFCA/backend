import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SqlserverDatabaseService } from 'src/database/database-sqlserver.service';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class ReceiptService {
    constructor(
        private readonly sqlserver: SqlserverDatabaseService,
        private readonly postgre: DatabaseService,
        private readonly httpService: HttpService
    ) { }

    private isEmptyString(value: any): boolean {
        if (value === undefined || value === null || value === '') {
            return true;
        };
        return false;
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
