import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { Observable } from "rxjs";
import { DatabaseService } from "src/database/database.service";

@Injectable()
export class AtGuard extends AuthGuard('jwt') {
    constructor(reflector: Reflector, private databaseService: DatabaseService) {
        super()
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        console.log("here")
        const request = context.switchToHttp().getRequest();
        const token = await this.databaseService.user_token.findFirst({
            where: {
                userId: 1
            }
        })
        return true
    }
}