
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class JwtGuard implements CanActivate {
    constructor(private jwtService: JwtService, private databaseService: DatabaseService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {

        const request = context.switchToHttp().getRequest();
        const token = await this.databaseService.user_token.findFirst({
            where: {
                userId: 1
            }
        });
        // console.log(token)
        if (!token) {
            throw new UnauthorizedException();
        }
        try {
            const payload = await this.jwtService.verifyAsync(
                token.token,
                {
                    secret: process.env.JWT_SECRET
                }
            );
            // so that we can access it in our route handlers
            request['user'] = { id: payload.sub };
            // request['user'] = payload;
            // console.log(payload.sub)
        } catch {
            throw new UnauthorizedException();
        }
        return true;
    }

    private extractToken(request: Request): string | undefined {
        const cookieToken = request.cookies?.refresh_token;
        return cookieToken;
    }
}
//export class JwtGuard extends AuthGuard('jwt') { }
