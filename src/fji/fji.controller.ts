import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { FjiService } from './fji.service';
import { createUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { EditUserDto } from './dto/edit-user.dto';
import { AssignTypeDto } from './dto/assign-type.dto';

@Controller('fji')
export class FjiUserController {
  constructor(private readonly fjiService: FjiService) { }

  @Get('user/get')
  async getUser() {
    return await this.fjiService.getUser()
  }
  @Get('type/get')
  async getType() {
    return await this.fjiService.getType()
  }
  @Get('user/get/:user_id')
  async getUserById(@Param('user_id') user_id: string) {
    return await this.fjiService.getUserById(+user_id)
  }
  @Get('type/get/:type_id')
  async getTypeById(@Param('type_id') type_id: string) {
    return await this.fjiService.getTypeById(+type_id)
  }


  @Post('user/create')
  async createUser(@Body() data: createUserDto) {
    return await this.fjiService.createUser(data)
  }
  @Post('user/login')
  async login(@Body() data: LoginDto) {
    return await this.fjiService.login(data)
  }
  @Put('user/edit')
  async editUser(@Body() data: EditUserDto) {
    return await this.fjiService.editUser(data)
  }
  @Post('user/assign/type')
  async assignRole(@Body() data: AssignTypeDto) {
    return await this.fjiService.assignType(data)
  }
  @Post('user/assign/type-approval')
  async assignApproval(@Body() data: Record<any, any>) {
    return await this.fjiService.assignTypeApproval(data)
  }
  @Post('user/assign/group')
  async assignGroup(@Body() data: Record<any, any>) {
    return await this.fjiService.assignGroup(data)
  }
  @Delete('user/delete/:user_id')
  async deleteUser(@Param('user_id') user_id: string) {
    return await this.fjiService.deleteUser(+user_id)
  }
  @Post('group/create')
  async createGroup(@Body() data: Record<any, any>) {
    return await this.fjiService.createGroup(data)
  }
  @Put('group/edit')
  async editGroup(@Body() data: Record<any, any>) {
    return await this.fjiService.editGroup(data)
  }
  @Delete('group/delete/:group_cd')
  async deleteGroup(@Param('group_cd') group_cd: string) {
    return await this.fjiService.deleteGroup(group_cd)
  }
  @Post('type/create')
  async createType(@Body() data: Record<any, any>) {
    return await this.fjiService.createType(data)
  }
  @Put('type/edit')
  async editType(@Body() data: Record<any, any>) {
    return await this.fjiService.editType(data)
  }
  @Delete('type/delete/:type_id')
  async deleteType(@Param('type_id') type_id: string) {
    return await this.fjiService.deleteType(+type_id)
  }
}
