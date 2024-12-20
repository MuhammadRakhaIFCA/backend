import { Module } from '@nestjs/common';
import { TanriseDatabaseService } from './database-tanrise.service';



@Module({
  providers: [TanriseDatabaseService],
  exports: [TanriseDatabaseService]
})
export class TanriseDatabaseModule { }
