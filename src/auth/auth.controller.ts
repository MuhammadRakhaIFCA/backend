import { Controller, Get, Post, Body, Patch, Param, Delete, UnauthorizedException, Res, UseGuards, Req, HttpCode, HttpStatus, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
// import { AtGuard } from './guards/at-guard';
// import { SuperAdminGuard } from './guards/superadmin.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }


  @Post('user/login')
  async login(@Body() data: LoginDto) {
    return await this.authService.login(data)
  }

  // @Post('logout')
  // @UseGuards(AuthGuard('jwt'))
  // @HttpCode(HttpStatus.OK)
  // async logout(@Req() req: Request) {
  //   const user = req.user
  //   return await this.authService.logout(user['sub'])

  // }


  // @Post('refresh')
  // @HttpCode(HttpStatus.OK)
  // @UseGuards(AuthGuard('jwt-refresh'))
  // async refresh(@Req() req: Request) {
  //   const user = req.user
  //   return await this.authService.refresh(user['sub'], user['refresh_token'])

  // }

  // @Get('user')
  // @HttpCode(HttpStatus.OK)
  // @UseGuards(AuthGuard('jwt'), SuperAdminGuard)
  // async getUser() {
  //   return await this.authService.getUser()
  // }

  // @Get('password')
  // @HttpCode(HttpStatus.OK)
  // @UseGuards(AuthGuard('jwt'))
  // async getPassword() {

  // }
}
