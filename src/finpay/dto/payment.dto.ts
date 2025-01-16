import {
    IsNotEmpty,
    IsEmail,
    IsString,
    IsNumber,
    MaxLength,
    IsOptional,
    Matches,
    ValidateNested,
    IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

class OrderDto {
    @IsNotEmpty()
    @IsString()
    id: string;

    @IsNotEmpty()
    amount: string;

    @IsNotEmpty()
    @IsString()
    @MaxLength(255)
    description: string;

    @IsOptional()
    timeout: string

    @IsOptional()
    itemAmount: number


}

class CustomerDto {
    @IsNotEmpty()
    @IsEmail()
    email: string;

    @IsNotEmpty()
    @IsString()
    @MaxLength(50)
    firstName: string;

    @IsNotEmpty()
    @IsString()
    @MaxLength(50)
    lastName: string;

    @IsNotEmpty()
    mobilePhone: string;
}

class UrlDto {
    @IsString()
    @MaxLength(320)
    callbackUrl: string;

    @IsOptional()
    @IsString()
    @MaxLength(320)
    backUrl?: string;

    @IsOptional()
    @IsString()
    @MaxLength(320)
    successUrl?: string;

    @IsOptional()
    @IsString()
    @MaxLength(320)
    failUrl?: string;

    @IsOptional()
    @IsString()
    @MaxLength(320)
    threeDsResponseUrl?: string;
}

export class PaymentDto {
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => OrderDto)
    order: OrderDto;

    @IsNotEmpty()
    @ValidateNested()
    @Type(() => CustomerDto)
    customer: CustomerDto;

    @IsNotEmpty()
    @ValidateNested()
    @Type(() => UrlDto)
    url: UrlDto;

    @IsOptional()
    @IsObject()
    billing?: object;

    @IsOptional()
    @IsObject()
    meta?: object;

    @IsOptional()
    @IsObject()
    card?: object;

    @IsOptional()
    @IsObject()
    recurring?: object;

    @IsOptional()
    @IsObject()
    sourceOfFunds?: object;

    @IsOptional()
    @IsObject()
    device?: object;
}
