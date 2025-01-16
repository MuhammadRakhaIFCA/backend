
import { Type } from "class-transformer";
import { IsEmail, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";

class OrderDto {
    @IsNotEmpty()
    id: string

    @IsNotEmpty()
    amount: number

    reference: string

    currency: string

    description: string
}

class CustomerDto {
    @IsOptional()
    @IsEmail()
    email: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    firstName: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    lastName: string;

    @IsOptional()
    mobilePhone: string;
}

class CardDto {
    token: string
    storedOnFile: string
    number: number
    expiryDate: Date
    cvv: number
    nameOnCard: string
}

class PaymentDto {
    status: string
    statusDesc: string
    datetime: Date
    reference: string
    channel: string
}
class ResultDto {
    @IsOptional()
    @ValidateNested()
    @Type(() => PaymentDto)
    payment: PaymentDto;
}

class sourceOfFundsDto {
    @IsOptional()
    type?: string

    @IsOptional()
    paymentCode?: string
}

export class NotificationCallbackDto {

    @IsNotEmpty()
    @ValidateNested()
    @Type(() => OrderDto)
    order: OrderDto;

    @IsNotEmpty()
    @ValidateNested()
    @Type(() => CustomerDto)
    customer: CustomerDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => ResultDto)
    result: ResultDto;

    @IsOptional()
    @IsObject()
    meta?: object;

    @IsOptional()
    @ValidateNested()
    @Type(() => sourceOfFundsDto)
    sourceOfFunds: sourceOfFundsDto;


    @IsOptional()
    @ValidateNested()
    @Type(() => CardDto)
    card?: CardDto;


    @IsNotEmpty()
    signature: string;

}