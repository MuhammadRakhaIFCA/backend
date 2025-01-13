import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
//import { TanriseDatabaseService } from 'src/database/database-tanrise.service';
import { createUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

import * as jwt from 'jsonwebtoken'
import { LoginDto } from './dto/login.dto';
import { AssignTypeDto } from './dto/assign-type.dto';
import { EditUserDto } from './dto/edit-user.dto';
import { FjiDatabaseService } from 'src/database/database-fji.service';

@Injectable()
export class FjiService {
    constructor(
        private readonly fjiDatabase: FjiDatabaseService,
        //private readonly tanriseDatabase: TanriseDatabaseService,
        private readonly jwtService: JwtService
    ) { }



    async getUser() {

        try {
            const result = await this.fjiDatabase.$queryRawUnsafe(`
               SELECT * FROM mgr.m_user
                `)
            return ({
                statusCode: 201,
                message: "user get",
                data: result
            })
        } catch (error) {
            throw new NotFoundException({
                statusCode: 404,
                message: "failed to get user",
                data: []
            })
        }
    }
    async getUserById(user_id: number) {

        try {
            const result = await this.fjiDatabase.$queryRawUnsafe(`
               SELECT * FROM mgr.m_user WHERE user_id = ${user_id}
                `)
            return ({
                statusCode: 201,
                message: "user get",
                data: result
            })
        } catch (error) {
            throw new NotFoundException({
                statusCode: 404,
                message: "user not found",
                data: []
            })
        }
    }

    async createUser(data: createUserDto) {
        const { email, name } = data
        const password = "pass1234"
        if (this.isEmpty(email), this.isEmpty(name)) {
            throw new BadRequestException({
                statusCode: 400,
                message: "email and name can't be emtpy",
                data: []
            })
        }
        try {
            const encryptedPassword = await bcrypt.hash(("email" + email + "p@ssw0rd" + password), 10)
            const result = await this.fjiDatabase.$executeRawUnsafe(`
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
    async editPassword(data: Record<any, any>) {
        const { email, password } = data
        if (this.isEmpty(email)) {
            throw new BadRequestException({
                statusCode: 400,
                message: "email can't be empty",
                data: []
            })
        }
        const encryptedPassword = await bcrypt.hash(("email" + email + "p@ssw0rd" + password), 10);
        const result = await this.fjiDatabase.$executeRawUnsafe(`
            UPDATE mgr.m_user SET password = '${encryptedPassword}', updated_at = GETDATE(), updated_by = 'MGR'
            WHERE email = '${email}'
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
            message: "password  updated successfully",
            data: [{
                email,
            }]
        };
    }
    async editUser(data: EditUserDto) {
        const { email, password, name, pict, user_id, } = data;
        if (this.isEmpty(user_id)) {
            throw new BadRequestException({
                statusCode: 400,
                message: "user id can't be empty",
                data: []
            })
        }
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
            const result = await this.fjiDatabase.$executeRawUnsafe(`
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
        if (this.isEmpty(user_id) || type_id[0] === undefined) {
            throw new BadRequestException({
                statusCode: 400,
                message: "user_id can't be empty and type_id have to be an array of number"
            })
        }
        try {
            await this.fjiDatabase.$executeRawUnsafe(`
                DELETE FROM mgr.assign_type_invoice WHERE user_id = ${user_id}
            `);

            for (const id of type_id) {
                await this.fjiDatabase.$executeRaw`
                    INSERT INTO mgr.assign_type_invoice (user_id, type_id, created_by, created_at)
                    VALUES (${user_id}, ${id}, 'MGR', GETDATE())
                `;
            }

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

    async deleteUser(user_id: number) {
        try {
            const result = await this.fjiDatabase.$executeRawUnsafe(`
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


    async deleteType(type_id: number) {

        if (this.isEmpty(type_id)) {
            throw new BadRequestException({
                statusCode: 400,
                message: "type_id can't be empty",
                data: []
            })
        }
        try {
            const result = await this.fjiDatabase.$executeRawUnsafe(`
                DELETE FROM mgr.m_type_invoice WHERE type_id = ${type_id} 
                `)
            if (result === 0) {
                throw new BadRequestException({
                    statusCode: 400,
                    message: "Failed to delete types",
                    data: []
                });
            }

            return {
                statusCode: 201,
                message: "Types deleted",
                data: []
            };
        } catch (error) {
            throw new BadRequestException(error.response);
        }
    }
    async getType() {

        try {
            const result = await this.fjiDatabase.$queryRawUnsafe(`
               SELECT * FROM mgr.m_type_invoice
                `)
            return ({
                statusCode: 200,
                message: "type get",
                data: result
            })
        } catch (error) {
            throw new NotFoundException({
                statusCode: 404,
                message: "fail to get type",
                data: []
            })
        }
    }
    async getTypeById(type_id: number) {

        try {
            const result = await this.fjiDatabase.$queryRawUnsafe(`
               SELECT * FROM mgr.m_type_invoice WHERE type_id = ${type_id}
               
                `)
            return ({
                statusCode: 200,
                message: "type get",
                data: result
            })
        } catch (error) {
            throw new NotFoundException({
                statusCode: 404,
                message: "type not found",
                data: []
            })
        }
    }
    async getTypeDtlById(type_id: number) {

        try {
            const result = await this.fjiDatabase.$queryRawUnsafe(`
               SELECT * FROM mgr.m_type_invoice_dtl WHERE type_id = ${type_id}
                `)
            return ({
                statusCode: 200,
                message: "type get",
                data: result
            })
        } catch (error) {
            throw new NotFoundException({
                statusCode: 404,
                message: "type not found",
                data: []
            })
        }
    }
    async createType(data: Record<any, any>) {
        const { type_cd, type_descs, status, approval_pic } = data;

        if (this.isEmpty(type_cd) || this.isEmpty(type_descs) || this.isEmpty(status) || this.isEmpty(approval_pic)) {
            throw new BadRequestException({
                statusCode: 400,
                message: "type_cd, type_descs, status and approval_pic can't be empty",
                data: []
            })
        }
        try {
            const result = await this.fjiDatabase.$executeRawUnsafe(`
                INSERT INTO mgr.m_type_invoice 
                (type_cd, type_descs, status, approval_pic, created_by, created_at)
                VALUES
                ('${type_cd}', '${type_descs}','${status}', ${approval_pic}, 'MGR', GETDATE())
                `)
            if (result === 0) {
                throw new BadRequestException({
                    statusCode: 400,
                    message: "Failed to create types",
                    data: []
                });
            }

            return {
                statusCode: 201,
                message: "Types created",
                data: []
            };
        } catch (error) {
            throw new BadRequestException(error.response);
        }
    }

    async editType(data: Record<any, any>) {
        const { type_id, type_cd, type_descs, status, approval_pic } = data;

        if (this.isEmpty(type_id)) {
            throw new BadRequestException({
                statusCode: 400,
                message: "type_id can't be empty",
                data: []
            })
        }
        const updates: string[] = [];
        try {
            if (type_descs) {
                updates.push(`type_descs = '${type_descs}'`);
            }
            if (type_descs) {
                updates.push(`type_cd = '${type_cd}'`);
            }
            if (status) {
                updates.push(`status = '${status}'`);
            }
            if (approval_pic) {
                updates.push(`approval_pic = '${approval_pic}'`);
            }
            if (updates.length === 0) {
                throw new BadRequestException({
                    statusCode: 400,
                    message: "No fields to update",
                    data: []
                });
            }
            const updateString = updates.join(', ');
            const result = await this.fjiDatabase.$executeRawUnsafe(`
                UPDATE mgr.m_type_invoice SET ${updateString}, updated_at = GETDATE(), updated_by = 'MGR'
                WHERE type_id = ${type_id}
            `);
            if (result === 0) {
                throw new BadRequestException({
                    statusCode: 400,
                    message: "Failed to create types",
                    data: []
                });
            }

            return {
                statusCode: 200,
                message: "Types edited",
                data: []
            };
        } catch (error) {
            throw new BadRequestException(error.response);
        }
    }

    async assignTypeApproval(data: Record<any, any>) {
        const { type_id, detail } = data
        if (this.isEmpty(type_id)) {
            throw new BadRequestException({
                statusCode: 400,
                message: "type_id can't be empty",
                data: []
            })
        }
        else if (detail[0].user_id === undefined || detail[0].role === null) {
            throw new BadRequestException({
                statusCode: 400,
                message: "user_id and role can't be empty",
                data: []
            })
        }
        try {
            await this.fjiDatabase.$executeRawUnsafe(`
                DELETE FROM mgr.m_type_invoice_dtl WHERE type_id = '${type_id}'
                `)
            for (let index = 0; index < detail.length; index++) {
                const query = `
                    INSERT INTO mgr.m_type_invoice_dtl 
                    (type_id, user_id, job_task, created_by, created_at)
                    VALUES
                    (${type_id}, ${detail[index].user_id}, '${detail[index].role}', 'MGR', GETDATE())
                `;
                const result = await this.fjiDatabase.$executeRawUnsafe(query);
                if (result === 0) {
                    throw new BadRequestException({
                        statusCode: 400,
                        message: "Failed to assign type detail",
                        data: []
                    })
                }
            }

            return ({
                statusCode: 201,
                message: "Type approval assigned successfully",
                data: []
            })
        } catch (error) {
            console.log(error)
            throw new BadRequestException(error.response)
        }
    }
}
