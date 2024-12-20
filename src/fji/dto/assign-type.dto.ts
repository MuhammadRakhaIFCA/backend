import { IsArray, IsNotEmpty } from "class-validator";

export class AssignTypeDto {
    @IsNotEmpty()
    user_id: number

    @IsNotEmpty()
    @IsArray()
    type_id: Array<number>
}