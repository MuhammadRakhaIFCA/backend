import { IsArray, IsNotEmpty, IsOptional } from "class-validator";

export class AssignTypeDto {
    @IsNotEmpty()
    user_id: number

    @IsOptional()
    @IsArray()
    type_id: Array<number>
}