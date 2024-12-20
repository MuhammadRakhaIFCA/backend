import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs';
import { PaymentDto } from './dto/payment.dto';
import { NotificationCallbackDto } from './dto/notification-callback.dto';
import { DatabaseService } from 'src/database/database.service';
import * as crypto from 'crypto';
import { AxiosResponse } from 'axios';

const developmentAuth = Buffer.from(`${process.env.MERCHANT_ID}:${process.env.MERCHANT_KEY_DEVELOPMENT}`).toString('base64')
const productionAuth = Buffer.from(`${process.env.MERCHANT_ID}:${process.env.MERCHANT_KEY_PRODUCTION}`).toString('base64')

@Injectable()
export class FinpayService {
    constructor(private readonly httpService: HttpService, private databaseService: DatabaseService) { }

    async initiate() {
        const response = await firstValueFrom(
            this.httpService.get('http://127.0.0.1:3005/posts/9')
        );
        return response.data;
    }
    async pay(dto: PaymentDto) {
        const { email } = dto.customer
        const { amount, id } = dto.order
        if (process.env.FINPAY_TYPE === "development") {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${developmentAuth}`
            };
            try {
                const response = await firstValueFrom(
                    this.httpService.post('https://devo.finnet.co.id/pg/payment/card/initiate', dto, { headers })
                );
                await this.databaseService.transaction.create({
                    data: {
                        customer_email: email,
                        amount: Number(amount),
                        status: "pending",
                        transaction_id: id,
                        expiry_date: new Date(response.data.expiryLink)
                    }
                })
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

                await this.databaseService.transaction.create({
                    data: {
                        customer_email: email,
                        amount: Number(amount),
                        status: "pending",
                        transaction_id: id,
                        expiry_date: new Date(response.data.expiryLink)
                    }
                })
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
            const transaction = await this.databaseService.transaction.updateMany({
                where: { transaction_id: id },
                data: {
                    status: status,
                    paid_date: new Date(datetime),
                    payment_method: type
                }
            })
            return ({
                statusCode: 200,
                message: "transaction updated",
                data: [transaction]
            })
        } catch (error) {
            return error.response
        }
    }

    async checkStatus(orderId: string) {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${developmentAuth}`
        };
        const response = await firstValueFrom(
            this.httpService.get(`https://devo.finnet.co.id/pg/payment/card/check/${orderId}`, { headers })
        )
        return response.data
    }


    validateSignature(payload: NotificationCallbackDto, receivedSignature: string) {
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
