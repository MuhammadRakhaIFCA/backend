import { Module } from '@nestjs/common';
import { FjiService } from './fji.service';
import { FjiUserController } from './fji.controller';
import { FjiDatabaseModule } from 'src/database/database-fji.module';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [FjiDatabaseModule, JwtModule, MailModule],
  controllers: [FjiUserController],
  providers: [FjiService],
})
export class FjiUserModule { }
