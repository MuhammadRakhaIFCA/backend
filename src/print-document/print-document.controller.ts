import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PrintDocumentService } from './print-document.service';

@Controller('api')
export class PrintDocumentController {
  constructor(private readonly printDocumentService: PrintDocumentService) {}

  // Receives { filters, requiredData: [{ table, columns, alias }] }
  @Post('template-data')
  async templateData(@Body() body: { 
    filters: Record<string, any>;
    requiredData: Array<{ table: string; columns: string[]; alias: string }>;
  }) {
    return this.printDocumentService.templateData(body);
  }

  // Receives { document_id, filters }
  @Post('template-print')
  async printDocument(@Body() body: { document_id: string; filters: Record<string, any> }) {
    return this.printDocumentService.printDocument(body);
  }

  @Get('table/get')
  async getTables(){
    return this.printDocumentService.getTables();
  }

  @Get('column/get/:table_name')
  async getColumn(@Param('table_name') table_name: string){
    return this.printDocumentService.getColumns(table_name);
  }
}
