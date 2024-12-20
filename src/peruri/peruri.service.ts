import { HttpService } from '@nestjs/axios';
import { Injectable, NotFoundException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { DatabaseService } from 'src/database/database.service';
import * as fs from 'fs';
import * as path from 'path';
import { UploadService } from 'src/upload/upload.service';
import { StampDto } from './dto/stamp.dto';


const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImlmY2FfZW1ldEB5b3BtYWlsLmNvbSIsInN1YiI6IjE0YjNiNDIzLWQzM2EtNGJkOS1hNzFkLTg0Mjk3MTJiYWQwNyIsImF1ZCI6Imh0dHBzOi8vZS1tZXRlcmFpLmNvLmlkIiwiaXNzIjoiZW1ldGVyYWkiLCJqdGkiOiIzMzA4MGY4Yi1iM2EzLTQxN2YtOWYxOS1lNDY4ZTFiZWYyNmIiLCJleHAiOjE3MzMyODA5MzYsImlhdCI6MTczMzE5NDUzNn0.8esgXb4W5q2LNMUgsX3R0B39RZu5orwsjbZkSGkMuMM"
@Injectable()
export class PeruriService {
    constructor(private readonly httpService: HttpService, private databaseService: DatabaseService,
        private readonly uploadService: UploadService
    ) { }

    async generateSn(body: Record<any, any>) {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        const response = await firstValueFrom(
            this.httpService.post('https://stampv2stg.e-meterai.co.id/chanel/stampv2', body, { headers })
        );

        const base64Image = response.data.result.image;

        if (!base64Image) {
            throw new NotFoundException('Image data not found in the response');
        }

        const buffer = Buffer.from(base64Image, 'base64');

        const folderPath = path.join(__dirname, '..', '..', 'images');
        const fileName = `generated-image-${Date.now()}.png`;
        const filePath = path.join(folderPath, fileName);

        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        fs.writeFileSync(filePath, buffer);

        return {
            ...response.data,
            filePath,
            imgBuffer: buffer
        };
    }

    async stamp(body: StampDto) {
        const response = await firstValueFrom(
            this.httpService.post('stamp', body)
        );
        return response.data
    }

}
