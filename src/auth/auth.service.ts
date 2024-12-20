import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { Prisma } from '@prisma/client';
import { DatabaseService } from 'src/database/database.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import * as jwt from 'jsonwebtoken'

@Injectable()
export class AuthService {
  constructor(private databaseService: DatabaseService, private readonly jwtService: JwtService) { }
  async register(dto: Prisma.sysuserCreateInput) {
    const { email, password, ...otherData } = dto;
    const existingUser = await this.databaseService.sysuser.findFirst({
      where: { email }
    })
    if (existingUser) {
      return {
        statusCode: 409,
        message: "email is already taken",
        data: {}
      };
    }
    const hashedPassword = await bcrypt.hash(("email" + email + "p@ssw0rd" + password), 10)
    // const hashedPassword = await bcrypt.hash(await bcrypt.hash(password, 10), 10)
    const newUser = await this.databaseService.sysuser.create({
      data: {
        ...otherData,
        email,
        password: hashedPassword,
      },
    })

    const tokens = await this.generateToken(newUser.rowId, newUser.email, newUser.UserLevel)
    if (newUser) {
      const { password, ...sysuser } = newUser
      await this.storeToken(newUser.rowId, tokens.refresh_token)
      return {
        statusCode: 201,
        message: "register sucess",
        data: {
          sysuser,
          ...tokens
        }
      };
    }
  }

  async updateToken(userId: number, refresh_token: string) {
    await this.databaseService.user_token.updateMany({
      where: { userId },
      data: {
        token: refresh_token
      }
    })
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto
    const findUser = await this.databaseService.sysuser.findFirst({
      where: { email }
    })
    //console.log(findUser)
    if (!findUser) throw new NotFoundException({
      statusCode: 404,
      message: "user not found",
      data: []
    });
    if (await bcrypt.compare(("email" + email + "p@ssw0rd" + password), findUser.password)) {
      const { password, ...sysuser } = findUser
      const tokens = await this.generateToken(findUser.rowId, findUser.email, findUser.UserLevel);
      await this.updateToken(findUser.rowId, tokens.refresh_token)
      return {
        statusCode: 200,
        message: "login sucess",
        data: [
          sysuser,
          tokens
        ]
      };
    } else {
      throw new UnauthorizedException({
        statusCode: 401,
        message: "wrong password",
        data: []
      })
    }
  }

  async logout(userId: number) {
    const logoutAttempt = await this.databaseService.user_token.updateMany({
      where: {
        userId,
        token: {
          not: null
        }
      },
      data: [

      ]
    })
    if (logoutAttempt.count === 0) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: "user already logged out",
        data: []
      })
    }
    return ({
      statusCode: 200,
      message: "logout succesful",
      data: []
    })
  }

  async getUserPassword(userId: number) {
    const password = await this.databaseService.sysuser.findFirst({
      where: {
        rowId: userId
      },
      select: {
        password: true
      }
    })
    if (!password) {
      return ({
        statusCode: 404,
        message: "user not found",
        data: []
      })
    }
    return ({
      statusCode: 200,
      message: "this is your password",
      data: password
    })
  }

  private async generateToken(id: number, email: string, UserLevel: string) {
    const [access_token, refresh_token] = await Promise.all([

      this.jwtService.signAsync(
        {
          sub: id, email, UserLevel

        },
        {
          secret: process.env.AT_SECRET,
          expiresIn: 60 * 15
        }
      ),
      this.jwtService.signAsync(
        {
          sub: id, email, UserLevel

        },
        {
          secret: process.env.RT_SECRET,
          expiresIn: 60 * 60 * 24 * 7
        }
      )
    ])
    return {
      access_token,
      refresh_token
    }
  }

  async storeToken(id: number, token: string) {
    const decoded = jwt.decode(token) as { exp: number };
    if (!decoded || !decoded.exp) {
      throw new Error('Invalid token: Unable to decode expiration time');
    }
    const expireOn = new Date(decoded.exp * 1000);
    return await this.databaseService.user_token.create({
      data: {
        userId: id,
        token,
        expireOn
      }
    })
  }

  async refresh(userId: number, refresh_token: string) {
    const user = await this.databaseService.sysuser.findFirst({
      where: {
        rowId: userId
      }
    })
    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: "unauthorized",
        data: [],
      });
    }
    const rtMatches = await this.databaseService.user_token.findFirst({
      where: {
        userId,
        token: refresh_token
      },

    })
    if (!rtMatches) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: "unauthorized",
        data: [],
      });
    }

    const tokens = await this.generateToken(user.rowId, user.email, user.UserLevel);
    await this.updateToken(user.rowId, tokens.refresh_token)
    return {
      statusCode: 200,
      message: "refresh successful",
      data: [{
        user,
        ...tokens
      }],
    };
  }

  async getUser() {
    const user = await this.databaseService.sysuser.findMany()
    const company = await this.databaseService.company.findMany()

    if (company.length === 0) {
      throw new NotFoundException({
        statusCode: 404,
        message: "no company",
        data: []
      })
    }
    return {
      statusCode: 200,
      message: "user get",
      data: [
        user
      ]
    }
  }
}
