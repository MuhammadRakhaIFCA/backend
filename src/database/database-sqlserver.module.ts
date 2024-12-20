import { Module } from '@nestjs/common';
import { SqlserverDatabaseService } from './database-sqlserver.service';

@Module({
  providers: [SqlserverDatabaseService],
  exports: [SqlserverDatabaseService]
})
export class SqlserverDatabaseModule { }
