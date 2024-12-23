import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client-sqlserver-fji';

@Injectable()
export class FjiDatabaseService extends PrismaClient implements OnModuleInit {
    async onModuleInit() {
        await this.$connect()
    }
    async onModuleDestroy() {
        await this.$disconnect();
        console.log('Prisma sqlserver disconnected on module destroy');
    }
}
