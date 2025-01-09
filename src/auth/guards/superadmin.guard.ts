// import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
// import { JwtService } from "@nestjs/jwt";
// import { Request } from "express";
// import { Observable } from "rxjs";
// import { DatabaseService } from "src/database/database.service";

// @Injectable()
// export class SuperAdminGuard implements CanActivate {
//     constructor(
//         private jwtService: JwtService,
//         private databaseService: DatabaseService
//     ) { }


//     async canActivate(context: ExecutionContext): Promise<boolean> {
//         const request = context.switchToHttp().getRequest<Request>()
//         const UserLevel = request.user['UserLevel']
//         if (UserLevel !== 'superadmin') {
//             throw new ForbiddenException({
//                 statusCode: 403,
//                 message: 'you do not have permission to access this route',
//                 data: {}
//             })
//         }
//         return true;

//     }
// }