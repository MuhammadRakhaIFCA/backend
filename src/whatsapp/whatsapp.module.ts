import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { FjiDatabaseModule } from 'src/database/database-fji.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [FjiDatabaseModule, HttpModule],
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService]
})
export class WhatsappModule {}
