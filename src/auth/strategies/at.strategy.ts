import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport"
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class AtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.AT_SECRET
        })
    }

    validate(payload: any) {
        return payload
    }

    // handleRequest(err: any, user: any, info: any, context: any) {
    //     if (err || !user) {
    //         throw new UnauthorizedException({
    //             statusCode: 401,
    //             message: 'Unauthorized',
    //             data: []
    //         });
    //     }
    //     return user;
    // }
}