import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { TanriseDatabaseService } from 'src/database/database-tanrise.service';
import { createUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

import * as jwt from 'jsonwebtoken'
import { LoginDto } from './dto/login.dto';
import { AssignTypeDto } from './dto/assign-type.dto';
import { EditUserDto } from './dto/edit-user.dto';

@Injectable()
export class FjiService {
    constructor(
        private readonly tanriseDatabase: TanriseDatabaseService,
        private readonly jwtService: JwtService
    ) { }

    async login(loginDto: LoginDto) {
        const { email, password } = loginDto
        const findUser = await this.tanriseDatabase.$queryRawUnsafe(`
              SELECT * FROM mgr.m_user WHERE email = '${email}'
            `)
        //console.log(findUser)
        if (!findUser) throw new NotFoundException({
            statusCode: 404,
            message: "user not found",
            data: []
        });
        if (await bcrypt.compare(("email" + email + "p@ssw0rd" + password), findUser[0].password)) {
            const { password, ...user } = findUser[0]
            const tokens = await this.generateToken(findUser[0].user_id, findUser[0].email, findUser[0].name);
            return {
                statusCode: 200,
                message: "login sucess",
                data: [
                    user,
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

    async createUser(data: createUserDto) {
        const { email, password, name } = data
        try {
            const encryptedPassword = await bcrypt.hash(("email" + email + "p@ssw0rd" + password), 10)
            const result = await this.tanriseDatabase.$executeRawUnsafe(`
               INSERT into mgr.m_user (email, password, name, created_by, created_at) 
                VALUES 
                ('${email}', '${encryptedPassword}', '${name}', 'MGR', GETDATE()) 
                `)
            return ({
                statusCode: 201,
                message: "user created",
                data: [{
                    email,
                    name,
                    createdBy: 'MGR'
                }]
            })
        } catch (error) {
            throw new BadRequestException({
                statusCode: 400,
                message: "fail to create user",
                data: []
            })
        }
    }
    async editUser(data: EditUserDto) {
        const { email, password, name, pict, user_id, } = data;
        const updates: string[] = [];
        try {
            if (email) {
                updates.push(`email = '${email}'`);
            }
            if (password) {
                const encryptedPassword = await bcrypt.hash(("email" + email + "p@ssw0rd" + password), 10);
                updates.push(`password = '${encryptedPassword}'`);
            }
            if (name) {
                updates.push(`name = '${name}'`);
            }
            if (pict) {
                updates.push(`pict = '${pict}'`);
            }
            if (updates.length === 0) {
                throw new BadRequestException({
                    statusCode: 400,
                    message: "No fields to update",
                    data: []
                });
            }
            const updateString = updates.join(', ');
            const result = await this.tanriseDatabase.$executeRawUnsafe(`
                UPDATE mgr.m_user SET ${updateString}, updated_at = GETDATE(), updated_by = 'MGR'
                WHERE user_id = ${user_id}
            `);

            if (result === 0) {
                throw new NotFoundException({
                    statusCode: 404,
                    message: "User not found",
                    data: []
                })
            }

            return {
                statusCode: 200,
                message: "User  updated successfully",
                data: [{
                    email,
                    name,
                    pict,
                    updatedBy: 'MGR'
                }]
            };
        } catch (error) {
            throw new BadRequestException(error.response);
        }
    }

    async assignType(data: Record<any, any>) {
        const { user_id, type_id } = data;
        if (user_id === undefined || type_id[0] === undefined) {
            throw new BadRequestException({
                statusCode: 400,
                message: "user_id can't be empty and type_id have to be an array of number"
            })
        }
        try {
            await this.tanriseDatabase.$executeRawUnsafe(`
                DELETE FROM mgr.assign_type_invoice WHERE user_id = ${user_id}
            `);
            const insertPromises = type_id.map(id => {
                return this.tanriseDatabase.$executeRaw`
                    INSERT INTO mgr.assign_type_invoice (user_id, type_id, created_by, created_at)
                    VALUES (${user_id}, ${id}, 'MGR', GETDATE())
                `;
            });

            await Promise.all(insertPromises);

            return {
                statusCode: 201,
                message: "Types assigned",
                data: {
                    user_id,
                    type_ids: type_id
                }
            };
        } catch (error) {
            throw new BadRequestException({
                statusCode: 400,
                message: "Failed to assign types",
                data: []
            });
        }
    }
    private isEmpty(value: any): boolean {
        if (value === undefined || value === null || value === '') {
            return true;
        };
        return false;
    }
    async createGroup(data: Record<any, any>) {
        const { group_cd, group_descs, status } = data
        if (this.isEmpty(group_cd) && this.isEmpty(group_descs) && this.isEmpty(status)) {
            throw new BadRequestException({
                statusCode: 400,
                message: "group_cd, group_descs and status can't be empty",
                data: []
            })
        }
        try {
            const result = await this.tanriseDatabase.$executeRawUnsafe(`
                INSERT INTO mgr.m_group (group_cd, group_descs, status, created_by, created_at)
                VALUES
                ('${group_cd}', '${group_descs}', '${status}', 'MGR', GETDATE())
                `)
            console.log(result)
        } catch (error) {
            console.log(error)
            throw new BadRequestException({
                statusCode: 400,
                message: "Failed to create group",
                data: []
            });
        }
        return {
            statusCode: 201,
            message: "Group Created",
            data: [{
                group_cd,
                group_descs,
                status,
                created_by: 'MGR',
                created_at: new Date()
            }]
        };
    }
    async editGroup(data: Record<any, any>) {
        const { group_cd, group_descs, status } = data
        if (this.isEmpty(group_cd)) {
            throw new BadRequestException({
                statusCode: 400,
                message: "group_cd can't be empty",
                data: []
            })
        } else if (this.isEmpty(group_descs) && this.isEmpty(status)) {
            throw new BadRequestException({
                statusCode: 400,
                message: "at least one field need to be updated",
                data: []
            })
        }
        const updates: string[] = [];
        try {
            if (group_descs) {
                updates.push(`group_descs = '${group_descs}'`);
            }
            if (status) {
                updates.push(`status = '${status}'`);
            }
            const updateString = updates.join(', ');
            const result = await this.tanriseDatabase.$executeRawUnsafe(`
                UPDATE mgr.m_group SET ${updateString}, updated_at = GETDATE(), updated_by = 'MGR'
                WHERE group_cd = '${group_cd}'
            `)

            if (result === 0) {
                throw new NotFoundException({
                    statusCode: 404,
                    message: "Group not found",
                    data: []
                });
            }
        }
        catch (error) {
            throw new NotFoundException(
                error.response
            );
        }
        return {
            statusCode: 201,
            message: "Group Updated",
            data: [{
                group_cd,
                group_descs,
                status,
                created_by: 'MGR',
                created_at: new Date()
            }]
        }
    }

    async deleteUser(user_id: number) {
        try {
            const result = await this.tanriseDatabase.$executeRawUnsafe(`
                DELETE FROM mgr.m_user WHERE user_id = ${user_id}
                `)

            if (result === 0) {
                throw new NotFoundException({
                    statusCode: 404,
                    message: "User not found",
                    data: []
                })
            }
        } catch (error) {
            throw new NotFoundException(error.response)
        }
        return ({
            statusCode: 200,
            message: "User Deleted",
            data: []
        })
    }
    async deleteGroup(group_cd: string) {
        if (this.isEmpty(group_cd)) {
            throw new BadRequestException({
                statusCode: 400,
                message: "group_cd can't be empty",
                data: []
            })
        }
        try {
            const result = await this.tanriseDatabase.$executeRawUnsafe(`
                DELETE FROM mgr.m_group WHERE group_cd = '${group_cd}'
                `)

            if (result === 0) {
                throw new NotFoundException({
                    statusCode: 404,
                    message: "Group not found",
                    data: []
                })
            }
        } catch (error) {
            throw new NotFoundException(error.response)
        }
        return ({
            statusCode: 200,
            message: "Group Deleted",
            data: []
        })
    }

    async assignGroup(data: Record<any, any>) {
        const { user_id, group_id } = data;
        if (this.isEmpty(user_id) || group_id[0] === undefined) {
            throw new BadRequestException({
                statusCode: 400,
                message: "user_id and group_id can't be empty, group_id must be an array of number",
                data: []
            })
        }
        try {
            await this.tanriseDatabase.$executeRawUnsafe(`
                DELETE FROM mgr.assign_group_invoice WHERE user_id = ${user_id}
            `);
            const insertPromises = group_id.map(id => {
                return this.tanriseDatabase.$executeRaw`
                    INSERT INTO mgr.assign_group_invoice (user_id, group_id, created_by, created_at)
                    VALUES (${user_id}, ${id}, 'MGR', GETDATE())
                `;
            });

            await Promise.all(insertPromises);

            return {
                statusCode: 201,
                message: "Types assigned",
                data: {
                    user_id,
                    group_ids: group_id
                }
            };
        } catch (error) {
            throw new BadRequestException({
                statusCode: 400,
                message: "Failed to assign types",
                data: []
            });
        }
    }
}
