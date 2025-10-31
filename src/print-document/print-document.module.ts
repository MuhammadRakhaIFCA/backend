import { Module } from '@nestjs/common';
import { PrintDocumentService } from './print-document.service';
import { PrintDocumentController } from './print-document.controller';
import { FjiDatabaseModule } from 'src/database/database-fji.module';

@Module({
  imports: [FjiDatabaseModule],
  controllers: [PrintDocumentController],
  providers: [PrintDocumentService],
})
export class PrintDocumentModule {}
