import { IsNotEmpty, IsString } from "class-validator";

export class createUserDto {
    @IsString()
    @IsNotEmpty()
    email: string;


    @IsString()
    @IsNotEmpty()
    name: string;
}