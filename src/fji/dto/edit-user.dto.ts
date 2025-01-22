import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class EditUserDto {
    @IsNotEmpty()
    user_id: number

    @IsString()
    @IsOptional()
    email: string;

    @IsString()
    @IsOptional()
    password: string;

    @IsString()
    @IsOptional()
    name: string;

    @IsString()
    @IsOptional()
    pict: string;

    @IsString()
    @IsOptional()
    role: string;
}