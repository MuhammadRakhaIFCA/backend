import { IsNotEmpty } from "class-validator";

export class generateDto {
    @IsNotEmpty()
    startDate: string

    @IsNotEmpty()
    endDate: string

    @IsNotEmpty()
    auditUser: string
}