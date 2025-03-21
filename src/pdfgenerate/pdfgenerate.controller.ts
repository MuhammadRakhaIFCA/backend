import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { PdfgenerateService } from './pdfgenerate.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('pdfgenerate')
export class PdfgenerateController {
  constructor(private readonly pdfgenerateService: PdfgenerateService) {
  }
  @Post()
  async generatePdf(@Body() body: Record<any, any>) {
    const { shipping, items, subtotal, paid, invoice_nr } = body;
    const path = `./invoice/invoice_${invoice_nr}.pdf`;
    return await this.pdfgenerateService.generatePdf(path, body)
  }

  @Post('pakubuwono')
  async generatePdfPakubuwono(@Body() body: {
    no: string;
    date: string;
    receiptFrom: string;
    amount: number;
    forPayment: string;
    signedDate: string;
    city: string
    billType: string,
    invType: string
  },) {
    return await this.pdfgenerateService.generatePdfSchedule(body)
  }

  @Post('santosa')
  async generatePdfSantosa(@Body() body: Record<any, any>) {
    return await this.pdfgenerateService.generatePdfSantosa(body)
  }
  @Post('bekasi-fajar')
  async generatePdfBekasi(@Body() body: Record<any, any>) {
    return await this.pdfgenerateService.generatePdfBekasi(body)
  }
  @Post('first-jakarta')
  //@UseGuards(AuthGuard('jwt'))
  async generatePdfFirstJakarta(@Body() body: Record<any, any>) {
    return await this.pdfgenerateService.generatePdfFirstJakarta(body)
  }
  @Post('first-jakarta-2')
  async generatePdfFirstJakarta2(@Body() body: Record<any, any>) {
    return await this.pdfgenerateService.generatePdfFirstJakarta2(body)
  }
  @Post('first-jakarta-3')
  async generatePdfFirstJakarta3(@Body() body: Record<any, any>) {
    return await this.pdfgenerateService.generatePdfFirstJakarta3(body)
  }
  @Post('first-jakarta-4')
  async generatePdfFirstJakarta4(@Body() body: Record<any, any>) {
    return await this.pdfgenerateService.generatePdfFirstJakarta4(body)
  }
  @Post('summary-w')
  async generateSummaryW(@Body() body: Record<any, any>){
    const {
      entity_cd,
      project_no,
      debtor_acct,
      read_date,
      filenames4
    } = body
    return await this.pdfgenerateService.generateSummaryW(
      entity_cd,
      project_no,
      debtor_acct,
      read_date,
      filenames4
    )
  }
  @Post('summary-e')
  async generateSummaryE(@Body() body: Record<any, any>){
    const {
      entity_cd,
      project_no,
      debtor_acct,
      read_date,
      filenames4
    } = body
    return await this.pdfgenerateService.generateSummaryE(
      entity_cd,
      project_no,
      debtor_acct,
      read_date,
      filenames4
    )
  }
  // @Post('first-jakarta-5')
  // async generatePdfFirstJakarta5(@Body() body: Record<any, any>) {
  //   return await this.pdfgenerateService.generatePdfFirstJakarta5(body)
  // }
  @Post('test')
  async autoGenerate(@Body() body: Record<any, any>) {
    return await this.pdfgenerateService.testAutoGenerate(body)
  }
}
