import { Module } from '@nestjs/common';
import { PeruriService } from './peruri.service';
import { PeruriController } from './peruri.controller';
import { DatabaseModule } from 'src/database/database.module';
import { HttpModule } from '@nestjs/axios';
import { UploadModule } from 'src/upload/upload.module';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { FjiDatabaseModule } from 'src/database/database-fji.module';

@Module({
  imports: [HttpModule, DatabaseModule, UploadModule, FjiDatabaseModule,
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueName = `${Date.now()}-${file.originalname}`;
          cb(null, uniqueName);
        },
      }),
    }),
    // MulterModule.register({
    //   storage: memoryStorage(),
    // })
  ],
  controllers: [PeruriController],
  providers: [PeruriService],
})
export class PeruriModule { }
