import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { FjiDatabaseService } from 'src/database/database-fji.service';
import { PaymentDto } from './dto/payment.dto';
import { firstValueFrom } from 'rxjs';
import { NotificationCallbackDto } from './dto/notification-callback.dto';
import { AxiosResponse } from 'axios';
import * as crypto from 'crypto';
import * as moment from 'moment'

@Injectable()
export class FinpayService {
    constructor(private readonly httpService: HttpService, private fjiDatabase: FjiDatabaseService) { }

    async initiatePay(dto: PaymentDto) {
        const merchant_id = `${process.env.MERCHANT_ID}`
        const merchant_key = `${process.env.MERCHANT_KEY_DEVELOPMENT}`
        const auth = `${merchant_id}:${merchant_key}`
        const developmentAuth = Buffer.from(auth).toString('base64')
        const productionAuth = Buffer.from(`${process.env.MERCHANT_ID}:${process.env.MERCHANT_KEY_PRODUCTION}`).toString('base64')

        const order_id = `INV-${moment().format('YYMMDD')}-${Array(6)
            .fill(null)
            .map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26)))
            .join('')}`;
        dto.order.id = order_id
        dto.order.timeout = "43200"
        const { firstName, lastName } = this.splitName(dto.customer.name)
        dto.customer.firstName = firstName;
        if (lastName) {
            dto.customer.lastName = lastName;
        } else {
            dto.customer.lastName = '-'
        }
        const { customer, order, type_topup } = dto
        const { callbackUrl } = dto.url
        if (process.env.FINPAY_TYPE === "development") {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${developmentAuth}`
            };
            try {
                console.log(dto)
                const response = await firstValueFrom(
                    this.httpService.post('https://devo.finnet.co.id/pg/payment/card/initiate', dto, { headers })
                );

                const expiry_link = moment(new Date(response.data.expiryLink)).format('YYYYMMDD h:mm:ss')
                const itemAmount = Number(order.itemAmount)
                const total = Number(order.amount)
                const amount = total / itemAmount
                await this.fjiDatabase.$executeRawUnsafe(`
                    INSERT INTO mgr.finpay_transaction
                    (company_cd, email_addr, name, mobile_number, order_id, order_qty, order_amount,
                     order_descs, order_total, redirect_url, expiry_link, status_payment, audit_date, type_topup)
                     VALUES 
                        ('GQCINV', '${customer.email}', '${customer.name}', 
                     '${customer.mobilePhone}', '${order.id}', '${itemAmount}', ${amount}, '${order.description}',
                     '${total}', '${response.data.redirecturl}', '${expiry_link}', 'PENDING', GETDATE(), '${type_topup}'
                        )
                    `)
                return ({
                    statusCode: 201,
                    message: "payment request success",
                    data: response.data
                });
            } catch (error) {
                // console.log(error.data.responseCode)
                // if (error.data.responseCode == '4000001') {
                //     console.log('inside bad request')
                //     throw new BadRequestException({
                //         statusCode: 400,
                //         message: error.data.responseMessage,
                //         data: []
                //     })
                // }
                // if (error.data.responseCode !== "2000000") {
                //     throw new InternalServerErrorException({
                //         statusCode: 500,
                //         message: error.data.responseMessage,
                //         data: []
                //     })
                // }
                console.log(error.response.data)
                return error.response.data
            }
        } else if (process.env.FINPAY_TYPE === "production") {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${productionAuth}`
            };
            try {
                const response = await firstValueFrom(
                    this.httpService.post('https://live.finnet.co.id/pg/payment/card/initiate', dto, { headers })
                );
                const expiry_link = moment(new Date(response.data.expiryLink)).format('YYYYMMDD h:mm:ss')
                const itemAmount = Number(order.itemAmount)
                const total = Number(order.amount)
                const amount = total / itemAmount
                await this.fjiDatabase.$executeRawUnsafe(`
                    INSERT INTO mgr.finpay_transaction
                    (company_cd, email_addr, name, mobile_number, order_id, order_qty, order_amount,
                     order_descs, order_total, redirect_url, expiry_link, status_payment, audit_date, type_topup)
                     VALUES 
                        ('GQCINV', '${customer.email}', '${customer.name}', 
                     '${customer.mobilePhone}', '${order.id}', '${itemAmount}', ${amount}, '${order.description}',
                     '${total}', '${response.data.redirecturl}', '${expiry_link}', 'PENDING', GETDATE(), '${type_topup}'
                        )
                    `)
                return ({
                    statusCode: 201,
                    message: "success",
                    data: response.data
                });
            } catch (error) {
                return error.response.data
            }
        }
    }

    async notificationCallback(dto: NotificationCallbackDto) {
        const merchant_id = `${process.env.MERCHANT_ID}`
        const merchant_key = `${process.env.MERCHANT_KEY_DEVELOPMENT}`
        const auth = `${merchant_id}:${merchant_key}`
        const developmentAuth = Buffer.from(auth).toString('base64')
        const productionAuth = Buffer.from(`${process.env.MERCHANT_ID}:${process.env.MERCHANT_KEY_PRODUCTION}`).toString('base64')

        const { id } = dto.order
        const { datetime, status } = dto.result.payment;
        const { signature } = dto
        const { type, paymentCode } = dto.sourceOfFunds
        let checkStatus: AxiosResponse<any, any>
        if (process.env.FINPAY_TYPE === "development") {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${developmentAuth}`
            };
            checkStatus = await firstValueFrom(
                this.httpService.get(`https://devo.finnet.co.id/pg/payment/card/check/${id}`, { headers })
            )
        } else if (process.env.FINPAY_TYPE === "production") {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${productionAuth}`
            };
            checkStatus = await firstValueFrom(
                this.httpService.get(`https://live.finnet.co.id/pg/payment/card/check/${id}`, { headers })
            )
        }
        if (checkStatus.data.data.result.payment.status !== status) {
            throw new BadRequestException({
                statusCode: 400,
                message: "status does not match",
                data: []
            })
        }
        if (this.validateSignature(dto, signature) === false) {
            throw new UnauthorizedException({
                statusCode: 401,
                message: "invalid signature",
                data: []
            })
        }
        try {
            // const callback = await this.fjiDatabase.$executeRawUnsafe(`
            //     INSERT INTO mgr.finpay_notification_callback 
            //     (transaction_id, payment_metode, payment_code, payment_status, json, audit_date)
            //     VALUES
            //     ('${id}, '${type}', '${checkStatus.data.data.result.payment.status}',
            //     '${status}', '${checkStatus.data}', GETDATE())
            //     `)
            console.log(id)
            const transaction = await this.fjiDatabase.$executeRawUnsafe(`
                UPDATE mgr.finpay_transaction set status_payment = '${status}',
                audit_date = GETDATE()
                WHERE order_id = '${id}'
                `)
            if (status == "PAID") {
                try {
                    await this.fjiDatabase.$executeRawUnsafe(`
                        INSERT INTO mgr.finpay_notification_callback 
                        (transaction_id, payment_metode, payment_code, payment_status, json, audit_date)
                        VALUES
                        (
                        '${id}', '${type}', '${paymentCode}', '${status}',  '${JSON.stringify(dto)}', GETDATE()
                        )
                        `)
                } catch (error) {
                    throw new BadRequestException({
                        statusCode: 400,
                        message: "fail to insert to mgr.finpay_notification_callback table",
                        data: []
                    })
                }
            }
            return ({
                statusCode: 201,
                message: "transaction paid",
                data: [transaction]
            })
        } catch (error) {
            console.log(error)
            return error.response
        }
    }

    async getTransaction(type_topup: string) {
        try {
            let response:Array<any>
            if(type_topup !== "all"){
                response = await this.fjiDatabase.$queryRawUnsafe(`
                    SELECT * FROM mgr.finpay_transaction
                    WHERE type_topup = '${type_topup}'
                    ORDER BY audit_date DESC
                    `)
            }
            else {
                response = await this.fjiDatabase.$queryRawUnsafe(`
                    SELECT * FROM mgr.finpay_transaction
                    ORDER BY audit_date DESC
                `)
            }
            return ({
                statusCode: 200,
                message: "get transaction success",
                data: response
            })
        } catch (error) {
            throw new BadRequestException({
                statusCode: 400,
                message: "fail to get transaction",
                data: []
            })
        }
    }

    async getEmailQuota(company_cd: string){
        try {
          const completedTransaction: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
              SELECT * FROM mgr.finpay_transaction
              WHERE status_payment = 'COMPLETED'
              AND type_topup = 'E'
              AND company_cd = '${company_cd}'
            `)
          const invoiceEmailSent = await this.fjiDatabase.$queryRawUnsafe(`
              SELECT count(rowID) as count FROM mgr.ar_blast_inv_log_msg
            `)
          const receiptEmailSent = await this.fjiDatabase.$queryRawUnsafe(`
              SELECT count(rowID) as count FROM mgr.ar_blast_or_log_msg
            `)
            const totalTopup = completedTransaction.length > 0 
            ? completedTransaction.reduce((sum, item) => sum + Number(item.order_qty), 0)
            : 0;
          
            const totalEmailSent = 
                (invoiceEmailSent[0]?.count || 0) + (receiptEmailSent[0]?.count || 0);
    
          return ({
            statusCode: 200,
            message: "success getting email quota",
            data: {
              totalEmailSent,
              totalTopup
            }
          })
        } catch (error) {
            console.log(error)
          throw new InternalServerErrorException({
            statusCode: 500,
            message: 'fail to get email quota',
            data: error
          })
        }
      }

    private validateSignature(payload: NotificationCallbackDto, receivedSignature: string) {
        const { signature, ...fields } = payload;
        if (process.env.FINPAY_TYPE === "development") {
            const generatedSignature = crypto
                .createHmac('sha512', process.env.MERCHANT_KEY_DEVELOPMENT)
                .update(JSON.stringify(fields))
                .digest('hex');
            return generatedSignature === receivedSignature;
        } else if (process.env.FINPAY_TYPE === "production") {
            const generatedSignature = crypto
                .createHmac('sha512', process.env.MERCHANT_KEY_PRODUCTION)
                .update(JSON.stringify(fields))
                .digest('hex');
            return generatedSignature === receivedSignature;
        }
    }

    private splitName(name: string): { firstName: string; lastName: string } {
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) {
            return { firstName: parts[0], lastName: '-' };
        }
        return { firstName: parts[0], lastName: parts[parts.length - 1] };
    }
}
