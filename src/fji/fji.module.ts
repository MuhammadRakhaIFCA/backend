import { Module } from '@nestjs/common';
import { FjiService } from './fji.service';
import { FjiUserController } from './fji.controller';
import { TanriseDatabaseModule } from 'src/database/database-tanrise.module';

@Module({
  imports: [TanriseDatabaseModule],
  controllers: [FjiUserController],
  providers: [FjiService],
})
export class FjiUserModule { }
