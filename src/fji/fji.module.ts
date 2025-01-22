import { Module } from '@nestjs/common';
import { FjiService } from './fji.service';
import { FjiUserController } from './fji.controller';
import { FjiDatabaseModule } from 'src/database/database-fji.module';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from 'src/mail/mail.module';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';

@Module({
  imports: [FjiDatabaseModule, JwtModule, MailModule,
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads/profilepic',
        filename: (req, file, cb) => {
          // Get the current date and time as a formatted string
          const now = new Date();
          const dateTimePrefix = now.toISOString().replace(/[:.]/g, '-'); // Format for filename safety
          const uniqueName = `${dateTimePrefix}-${file.originalname}`;
          cb(null, uniqueName);
        },
      }),
    })
  ],
  controllers: [FjiUserController],
  providers: [FjiService],
})
export class FjiUserModule { }
