import { Module } from '@nestjs/common';
import { FjiDatabaseService } from './database-fji.service';

@Module({
  providers: [FjiDatabaseService],
  exports: [FjiDatabaseService]
})
export class FjiDatabaseModule { }
