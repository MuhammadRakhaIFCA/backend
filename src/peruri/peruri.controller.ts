import { BadRequestException, Body, Controller, Get, Param, Post, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { PeruriService } from './peruri.service';
import * as QRCode from 'qrcode'
import { StampDto } from './dto/stamp.dto';
import { UploadService } from 'src/upload/upload.service';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';

@Controller('api/peruri')
export class PeruriController {
  constructor(private readonly peruriService: PeruriService, private readonly uploadService: UploadService) { }

  @Post('stamp')
  async stamp(@Body() body: Record<any, any>) {
    return await this.peruriService.stamping(body)
  }

  @Get('no-stamp/:doc_no')
  async noStamp(@Param('doc_no') doc_no: string) {
    return await this.peruriService.noStamp(doc_no)
  }

  @Post('manual-stamp')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'pdf', maxCount: 1 },
      { name: 'image', maxCount: 1 },
    ])
  )
  async manualstamp(
    @UploadedFiles() files: { pdf?: Express.Multer.File[]; image?: Express.Multer.File[] },
  ) {
    if (!files?.pdf?.[0] || !files?.image?.[0]) {
      throw new BadRequestException('Both PDF and image files are required.');
    }
    const pdfFile = files.pdf[0];
    const imageFile = files.image[0];
    const getCoordinates = await this.uploadService.getCoordinates(pdfFile.path, 'emeterei', 1);
    const coordinates = getCoordinates.data;
    const outputPdfPath = path.join('./uploads', `output-${pdfFile.filename}`)

    if (!coordinates.length) {
      throw new BadRequestException('No coordinates found in the provided PDF.');
    }
    const imgBuffer = fs.readFileSync(imageFile.path);
    await this.uploadService.stampTest(pdfFile.path, outputPdfPath, imgBuffer, 1, pdfFile.filename, coordinates[0]);
  }

  @Get()
  async testDecode() {
    let data = ''
    let decodedString = Buffer.from(data, 'base64').toString('utf8')
    const qrCodeDataUrl = await QRCode.toDataURL(decodedString);
    return qrCodeDataUrl
  }
}
