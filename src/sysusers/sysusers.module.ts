import { Module } from '@nestjs/common';
import { SysusersService } from './sysusers.service';
import { SysusersController } from './sysusers.controller';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [SysusersController],
  providers: [SysusersService],
})
export class SysusersModule { }
