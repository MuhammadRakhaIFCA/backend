import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { FjiDatabaseService } from 'src/database/database-fji.service';
import { PaymentDto } from './dto/payment.dto';
import { firstValueFrom } from 'rxjs';
import { NotificationCallbackDto } from './dto/notification-callback.dto';
import { AxiosResponse } from 'axios';
import * as crypto from 'crypto';

const developmentAuth = Buffer.from(`${process.env.MERCHANT_ID}:${process.env.MERCHANT_KEY_DEVELOPMENT}`).toString('base64')
const productionAuth = Buffer.from(`${process.env.MERCHANT_ID}:${process.env.MERCHANT_KEY_PRODUCTION}`).toString('base64')
@Injectable()
export class FinpayService {
    constructor(private readonly httpService: HttpService, private fjiDatabase: FjiDatabaseService) { }

    async pay(dto: PaymentDto) {
        // const { email } = dto.customer
        // const { amount, id } = dto.order
        const { customer, order } = dto
        const { url } = dto
        if (process.env.FINPAY_TYPE === "development") {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${developmentAuth}`
            };
            try {
                const response = await firstValueFrom(
                    this.httpService.post('https://devo.finnet.co.id/pg/payment/card/initiate', dto, { headers })
                );
                const expiry_link = new Date(response.data.expiryLink)
                await this.fjiDatabase.$executeRawUnsafe(`
                    INSERT INTO mgr.finpay_transaction
                    (company_cd, email_addr, name, mobile_number, order_id, order_qty, order_amount,
                     order_descs, order_total, redirect_url, expiry_link, status_payment, audit_date)
                     VALUES 
                     ('GQCINV', '${customer.email}', '${customer.firstName} ${customer.lastName}', 
                     '${customer.mobilePhone}', '${order.id}', '${order.itemAmount}', '${order.description}',
                     '${order.amount}', '${url}', '${expiry_link}', 'P', GETDATE())
                     )
                    `)
                // await this.databaseService.transaction.create({
                //     data: {
                //         customer_email: email,
                //         amount: Number(amount),
                //         status: "pending",
                //         transaction_id: id,
                //         expiry_date: new Date(response.data.expiryLink)
                //     }
                // })
                return response.data;
            } catch (error) {
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
                const expiry_link = new Date(response.data.expiryLink)
                await this.fjiDatabase.$executeRawUnsafe(`
                    INSERT INTO mgr.finpay_transaction
                    (company_cd, email_addr, name, mobile_number, order_id, order_qty, order_amount,
                     order_descs, order_total, redirect_url, expiry_link, status_payment, audit_date)
                     VALUES 
                     ('GQCINV', '${customer.email}', '${customer.firstName} ${customer.lastName}', 
                     '${customer.mobilePhone}', '${order.id}', '${order.itemAmount}', '${order.description}',
                     '${order.amount}', '${url}', '${expiry_link}', 'P', GETDATE()) 
                     )
                    `)
                return response.data;
            } catch (error) {
                return error.response.data
            }
        }
    }

    async notificationCallback(dto: NotificationCallbackDto) {
        const { id } = dto.order
        const { datetime, status } = dto.result.payment;
        const { signature } = dto
        const { type } = dto.sourceOfFunds
        let checkStatus: AxiosResponse<any, any>
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${developmentAuth}`
        };
        if (process.env.FINPAY_TYPE === "development") {
            checkStatus = await firstValueFrom(
                this.httpService.get(`https://devo.finnet.co.id/pg/payment/card/check/${id}`, { headers })
            )
        } else if (process.env.FINPAY_TYPE === "production") {
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
            throw new BadRequestException({
                statusCode: 400,
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
            const transaction = await this.fjiDatabase.$executeRawUnsafe(`
                UPDATE mgr.finpay_transaction set status = '${status}', audit_date = GETDATE() 
                WHERE transaction_id = '${id}'
                `)
            return ({
                statusCode: 200,
                message: "transaction updated",
                data: [transaction]
            })
        } catch (error) {
            return error.response
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
}
