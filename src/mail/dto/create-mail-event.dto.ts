import { IsDate, IsDateString, IsNotEmpty } from "class-validator";

export class CreateMailEventDto {
    @IsNotEmpty()
    to: string;

    @IsNotEmpty()
    subject: string;

    @IsNotEmpty()
    text: string;

    @IsNotEmpty()
    @IsDateString()
    startDate: Date;

    @IsNotEmpty()
    @IsDateString()
    endDate: Date;

    html?: string
}
