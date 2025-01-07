import { Module } from '@nestjs/common';
import { FjiService } from './fji.service';
import { FjiUserController } from './fji.controller';
import { TanriseDatabaseModule } from 'src/database/database-tanrise.module';
import { FjiDatabaseModule } from 'src/database/database-fji.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [TanriseDatabaseModule, FjiDatabaseModule, JwtModule],
  controllers: [FjiUserController],
  providers: [FjiService],
})
export class FjiUserModule { }
