import { Injectable } from "@nestjs/common";
import { IsDate, IsNotEmpty } from "class-validator";


@Injectable()
export class StampDto {
    @IsNotEmpty()
    certificatelevel: string;

    @IsNotEmpty()
    dest: string;

    @IsNotEmpty()
    docpass: string;

    @IsNotEmpty()
    jwToken: string;

    @IsNotEmpty()
    location: string;

    @IsNotEmpty()
    profileName: string;

    @IsNotEmpty()
    reason: string;

    @IsNotEmpty()
    refToken: string;

    @IsNotEmpty()
    specimenPath: string;

    @IsNotEmpty()
    src: string;

    @IsNotEmpty()
    visSignaturePage: number;

}