import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { SysusersService } from './sysusers.service';
import { CreateSysuserDto } from './dto/create-sysuser.dto';
import { UpdateSysuserDto } from './dto/update-sysuser.dto';
import { JwtGuard } from 'src/auth/guards/auth.guard';

@Controller('sysusers')
export class SysusersController {
  constructor(private readonly sysusersService: SysusersService) { }

  @Post()
  create(@Body() createSysuserDto: CreateSysuserDto) {
    return this.sysusersService.create(createSysuserDto);
  }

  @Get()
  @UseGuards(JwtGuard)
  findAll() {
    return this.sysusersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sysusersService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSysuserDto: UpdateSysuserDto) {
    return this.sysusersService.update(+id, updateSysuserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sysusersService.remove(+id);
  }
}
