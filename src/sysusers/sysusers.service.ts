import { Injectable } from '@nestjs/common';
import { CreateSysuserDto } from './dto/create-sysuser.dto';
import { UpdateSysuserDto } from './dto/update-sysuser.dto';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class SysusersService {
  constructor(private databaseService: DatabaseService) { }
  create(createSysuserDto: CreateSysuserDto) {
    return 'This action adds a new sysuser';
  }

  async findAll() {
    return await this.databaseService.sysuser.findMany({
      include: {
        user_token: true
      }
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} sysuser`;
  }

  update(id: number, updateSysuserDto: UpdateSysuserDto) {
    return `This action updates a #${id} sysuser`;
  }

  remove(id: number) {
    return `This action removes a #${id} sysuser`;
  }
}
