import { Module } from '@nestjs/common';
import { ReceiptService } from './receipt.service';
import { ReceiptController } from './receipt.controller';
//import { SqlserverDatabaseModule } from 'src/database/database-sqlserver.module';
import { HttpModule } from '@nestjs/axios';
import { PdfgenerateModule } from 'src/pdfgenerate/pdfgenerate.module';
import { FjiDatabaseModule } from 'src/database/database-fji.module';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';

@Module({
  imports: [HttpModule, PdfgenerateModule, FjiDatabaseModule,
    //SqlserverDatabaseModule, 
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads/FAKTUR',
        // destination: `${process.env.ROOT_PDF_FOLDER}`,
        filename: (req, file, cb) => {
          const uniqueName = `${file.originalname}`;
          cb(null, uniqueName);
        },
      }),
    })
  ],
  controllers: [ReceiptController],
  providers: [ReceiptService],
})
export class ReceiptModule { }
