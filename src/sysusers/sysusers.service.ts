import { Injectable } from '@nestjs/common';


@Injectable()
export class SysusersService {
  constructor() { }



  findOne(id: number) {
    return `This action returns a #${id} sysuser`;
  }


  remove(id: number) {
    return `This action removes a #${id} sysuser`;
  }
}
