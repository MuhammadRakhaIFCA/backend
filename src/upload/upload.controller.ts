import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Body,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Express } from 'express';
import { UploadService } from './upload.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) { }
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    const filePath = file.path; // Path of the uploaded file
    const targetWord = 'faktur'; // Word to find

    const result = await this.uploadService.extractWordCoordinates(filePath, targetWord);

    return result
  }




  @Post('test')
  @UseInterceptors(FileInterceptor('pdf'))
  async testPdfLib(@UploadedFile() file: Express.Multer.File) {
    const word = "emeterei";
    const page = 1;
    const result = await this.uploadService.getCoordinates(file.path, word, page)

    return result;
  }

  @Post('coordinates')
  async getCoordinatesFromUrl(@Body() body: { url: string }) {
    const { url } = body;
    const word = "emeterei";
    const page = 1;
    const result = await this.uploadService.getCoordinatesFromUrl(url, word, page)

    return result;

  }

  @Post('all')
  @UseInterceptors(FileInterceptor('pdf'))
  async getCoordinatesAll(@UploadedFile() file: Express.Multer.File,
    @Body() body: { pageNumber: string },
  ) {
    const result = await this.uploadService.getCoordinatesAll(file.path, "word", 1)
    return result
  }
  // @Post('rect')
  // @UseInterceptors(FileInterceptor('pdf'))
  // async getCoordinatesRect(@UploadedFile() file: Express.Multer.File,
  //   @Body() body: { pageNumber: string },
  // ) {
  //   const result = await this.uploadService.getCoordinatesRect(file.path, "word", 1)
  //   return result
  // }

  @Post('write')
  @UseInterceptors(FileInterceptor('pdf'))
  async drawBoundingBox(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { boundingBoxes: string; pageNumber: string },
  ) {
    const boundingBoxes = JSON.parse(body.boundingBoxes); // Parse bounding boxes JSON
    const pageNumber = parseInt(body.pageNumber, 10);

    if (!boundingBoxes || !pageNumber || !file) {
      throw new Error('Invalid input. Please provide all required fields.');
    }

    const inputPdfPath = file.path; // Uploaded PDF path
    const outputPdfPath = path.join('./uploads', `output-${file.filename}`); // Output path

    await this.uploadService.drawBoundingBox(inputPdfPath, outputPdfPath, boundingBoxes, pageNumber);

    return {
      message: 'Bounding boxes drawn successfully.',
      outputFile: outputPdfPath,
    };
  }
}
