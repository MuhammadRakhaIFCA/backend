import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
//import { TanriseDatabaseService } from 'src/database/database-tanrise.service';
import { createUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import * as path from 'path'
import * as jwt from 'jsonwebtoken'
import { LoginDto } from './dto/login.dto';
import { AssignTypeDto } from './dto/assign-type.dto';
import { EditUserDto } from './dto/edit-user.dto';
import { FjiDatabaseService } from 'src/database/database-fji.service';
import { MailService } from 'src/mail/mail.service';
import { Request } from 'express';

@Injectable()
export class FjiService {
    constructor(
        private readonly fjiDatabase: FjiDatabaseService,
        //private readonly tanriseDatabase: TanriseDatabaseService,
        private readonly jwtService: JwtService,
        private readonly mailService: MailService
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
        const { email, name, role } = data
        const password = "pass1234"
        const pict = "https://i0.wp.com/www.winhelponline.com/blog/wp-content/uploads/2017/12/user.png?resize=256%2C256&quality=100&ssl=1"
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
               INSERT into mgr.m_user (email, password, name, role, pict, created_by, created_at) 
                VALUES 
                ('${email}', '${encryptedPassword}', '${name}', '${role}', '${pict}','MGR', GETDATE()) 
                `)
        } catch (error) {
            throw new BadRequestException({
                statusCode: 400,
                message: "fail to create user",
                data: []
            })
        }

        try {
            await this.mailService.sendAccountCreationEmail(email)
        } catch (error) {
            throw new BadRequestException({
                statusCode: 400,
                message: "fail to send account creation email",
                data: []
            })
        }
        return ({
            statusCode: 201,
            message: "user created",
            data: [{
                email,
                name,
                createdBy: 'MGR'
            }]
        })
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
        const { email, password, name, role, pict, user_id, } = data;
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
            if (role) {
                updates.push(`role = '${role}'`);
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
            const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT * FROM mgr.m_type_invoice
                WHERE type_cd != 'OR'
            `);

            for (const item of result) {
                const details: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                    SELECT * FROM mgr.m_type_invoice_dtl
                    WHERE type_id = ${item.type_id}
                `);
                item.detail = details;
            }

            return {
                statusCode: 200,
                message: "type get",
                data: result,
            };
        } catch (error) {
            throw new NotFoundException({
                statusCode: 404,
                message: "fail to get type",
                data: [],
            });
        }
    }

    async getTypeOr() {

        try {
            const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
               SELECT * FROM mgr.m_type_invoice
               WHERE type_cd = 'OR'
                `)
            for (const item of result) {
                const details: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                        SELECT * FROM mgr.m_type_invoice_dtl
                        WHERE type_id = ${item.type_id}
                    `);
                item.detail = details;
            }
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

    async changePhoto(filename: string, email: string, req: Request) {
        //const baseUrl = `${req.protocol}://${req.get('host')}`;
        const port = req.socket.localPort;
        let baseUrl = `${req.protocol}://${req.get('host').split(':')[0]}:${port}`;
        if (baseUrl == "http://10.10.0.25:5000") {
            baseUrl = 'https://demo.property365.co.id:5025';
        }
        const imageUrl = `${baseUrl}/uploads/profilepic/${filename}`;
        console.log(imageUrl)
        try {
            const result = await this.fjiDatabase.$executeRawUnsafe(`
                UPDATE mgr.m_user SET pict = '${imageUrl}'
                WHERE email = '${email}'
                `)
            if (result === 0) {
                throw new BadRequestException({
                    statusCode: 400,
                    message: "fail to change picture",
                    data: []
                })
            }
        } catch (error) {
            throw error
        }
        return ({
            statusCode: 200,
            message: "profile picture updated",
            data: imageUrl
        })
    }

    async assignTypeApproval(data: Record<any, any>) {
        console.log(data)
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

    async getMenu(email: string, role: string) {
        // console.log("email : " + email)
        // console.log("role : " + role)
        let invoiceMaker: Array<any> = [];
        let orMaker: Array<any> = [];
        let invoiceBlaster: Array<any> = [];
        let orBlaster: Array<any> = [];
        let invoiceApprover: Array<any> = [];
        let orApprover: Array<any> = [];
        if (role == 'maker and blaster') {
            invoiceMaker = (await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_assign_approval_level 
              WHERE email = '${email}' 
              AND type_cd <> 'OR' 
              AND 
              job_task = 'Maker'
          `)) as Array<any>;
            invoiceBlaster = (await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_assign_approval_level 
              WHERE email = '${email}' 
              AND type_cd <> 'OR' 
              AND 
              job_task = 'Stamp & Blast'
          `)) as Array<any>;

          orMaker = (await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_assign_approval_level 
              WHERE email = '${email}' 
              AND type_cd = 'OR' 
              AND 
              job_task = 'Maker'
          `)) as Array<any>;
          orBlaster = (await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_assign_approval_level 
              WHERE email = '${email}' 
              AND type_cd = 'OR' 
              AND 
              job_task = 'Stamp & Blast'
          `)) as Array<any>;
        } else if (role == 'approver') {
            invoiceApprover = (await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_assign_approval_level 
              WHERE email = '${email}' 
              AND type_cd <> 'OR' 
              AND job_task like '%Approval%'
          `)) as Array<any>;

            orApprover = (await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_assign_approval_level 
              WHERE email = '${email}' 
                AND type_cd = 'OR' 
                AND job_task like '%Approval%'
          `)) as Array<any>;
        } else if (role == 'maker') {
            invoiceMaker = (await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_assign_approval_level 
              WHERE email = '${email}' 
                AND type_cd <> 'OR' 
                AND job_task = 'Maker'
          `)) as Array<any>;

            orMaker = (await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_assign_approval_level 
              WHERE email = '${email}' 
                AND type_cd = 'OR' 
                AND job_task like '%Maker%'
          `)) as Array<any>;
        } else if (role == 'blaster') {
            invoiceBlaster = (await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_assign_approval_level 
              WHERE email = '${email}' 
              AND type_cd <> 'OR' 
              AND job_task = 'Stamp & Blast'
          `)) as Array<any>;

            orBlaster = (await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_assign_approval_level 
              WHERE email = '${email}' 
                AND type_cd = 'OR' 
                AND job_task = 'Stamp & Blast'
          `)) as Array<any>;
        }

        // console.log("invoice length : " + invoice.length)
        // console.log("or length : " + or.length)

        const hasInvoiceDataMaker = invoiceMaker.length > 0;
        const hasOrDataMaker = orMaker.length > 0;
        const hasInvoiceDataBlaster = invoiceBlaster.length > 0;
        const hasOrDataBlaster = orBlaster.length > 0;
        const hasInvoiceDataApprover = invoiceApprover.length > 0;
        const hasOrDataApprover = orApprover.length > 0;

        return {
            statusCode: 200,
            message: 'success',
            data: {
                hasInvoiceDataMaker,
                hasOrDataMaker,
                hasInvoiceDataBlaster,
                hasOrDataBlaster,
                hasInvoiceDataApprover,
                hasOrDataApprover
            },
        };
    }

    async getTypeByEmail(email: string) {
        try {
          const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                    SELECT * FROM mgr.v_assign_approval_level
                    WHERE email = '${email}'
                        AND job_task = 'Maker'
                `);
    
          return {
            statusCode: 200,
            message: 'type get',
            data: result,
          };
        } catch (error) {
          throw new NotFoundException({
            statusCode: 404,
            message: 'fail to get type',
            data: [],
          });
        }
      }
}
