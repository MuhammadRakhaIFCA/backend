import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import { SqlserverDatabaseService } from 'src/database/database-sqlserver.service';
import * as moment from 'moment'
import * as ftp from 'basic-ftp';
import * as path from 'path';



@Injectable()
export class PdfgenerateService {

    constructor(
        private readonly sqlserver: SqlserverDatabaseService
    ) {

    }


    private generateHeader(doc) {
        doc.image('./uploads/1733214269908-ss2.png', 50, 45, { width: 50 })
            .fillColor('#444444')
            .fontSize(20)
            .text('ACME Inc.', 110, 57)
            .fontSize(10)
            .text('123 Main Street', 200, 65, { align: 'right' })
            .text('New York, NY, 10025', 200, 80, { align: 'right' })
            .moveDown();
    }

    private generateHr(doc, y: number) {
        doc
            .strokeColor('#aaaaaa')
            .lineWidth(1)
            .moveTo(50, y)
            .lineTo(550, y)
            .stroke();
    }
    private generateCustomerInformation(doc, invoice) {
        const customerInformationTop = 200;
        const moment = require('moment')

        doc
            .fillColor("#444444")
            .fontSize(20)
            .text("Invoice", 50, 160);

        this.generateHr(doc, 185);

        doc
            .fontSize(10)
            .text("Invoice Number:", 50, customerInformationTop)
            .font("Helvetica-Bold")
            .text(invoice.invoice_nr, 150, customerInformationTop)
            .font("Helvetica")
            .text("Invoice Date:", 50, customerInformationTop + 15)
            .text(moment().format("MMMM Do YYYY"), 150, customerInformationTop + 15)
            .text("Balance Due:", 50, customerInformationTop + 30)
            .text((invoice.subtotal - invoice.paid), 150, customerInformationTop + 30)
            .font("Helvetica-Bold")
            .text(invoice.shipping.name, 400, customerInformationTop)
            .font("Helvetica")
            .text(invoice.shipping.address, 400, customerInformationTop + 15)
            .text(`${invoice.shipping.city}, ${invoice.shipping.state}, ${invoice.shipping.country}`, 400, customerInformationTop + 30)
            .moveDown();

        this.generateHr(doc, 252);
    }


    private generateFooter(doc) {
        doc.fontSize(
            10,
        ).text(
            'Payment is due within 15 days. Thank you for your business.',
            50,
            700,
            { align: 'center', width: 500 },
        );
    }

    private generateTableRow(doc, y, c1, c2, c3, c4, c5) {
        doc.fontSize(10)
            .text(c1, 50, y)
            .text(c2, 150, y)
            .text(c3, 280, y, { width: 90, align: 'right' })
            .text(c4, 370, y, { width: 90, align: 'right' })
            .text(c5, 0, y, { align: 'right' });
    }
    private generateInvoiceTable(doc, invoice) {
        var i = 0,
            invoiceTableTop = 330;
        for (i = 0; i < invoice.items.length; i++) {
            const item = invoice.items[i];
            const position = invoiceTableTop + (i + 1) * 30;
            this.generateTableRow(
                doc,
                position,
                item.item,
                item.description,
                item.amount / item.quantity,
                item.quantity,
                item.amount,
            );
        }
    }
    async generatePdf(path: string, data: Record<any, any>): Promise<any> {
        let doc = new PDFDocument({ margin: 50 });

        this.generateHeader(doc); // Invoke `generateHeader` function.
        this.generateInvoiceTable(doc, data)
        this.generateCustomerInformation(doc, data)
        this.generateFooter(doc); // Invoke `generateFooter` function.

        doc.end();
        doc.pipe(fs.createWriteStream(path));

        return ({
            statusCode: 201,
            message: "invoice created",
            data: path
        })
    }

    //in progress
    async generateFullPage(data: Record<any, any>) {
        const { startDate, endDate } = data
        const doc = new PDFDocument({
            size: 'A4',
            margin: 0,
        });
        try {
            const result: Array<any> = await this.sqlserver.$queryRawUnsafe(`
                    SELECT TOP (5)* FROM mgr.ar_email_inv_dtl 
                    WHERE
                     year(gen_date)*10000+month(gen_date)*100+day(gen_date) >= '${startDate}'
                    AND year(gen_date)*10000+month(gen_date)*100+day(gen_date) <= '${endDate}'
                    ORDER BY gen_date DESC
                `)
            if (!result || result.length === 0) {
                console.log(result.length)
                throw new NotFoundException({
                    statusCode: 404,
                    message: 'No data',
                    data: [],
                });
            }

            result.forEach(async (resultItem) => {
                const pdfBody = {
                    no: `BI${moment(resultItem.gen_date).format('YYDDMM')}26`,
                    date: moment(resultItem.gen_date).format('DD/MM/YYYY'),
                    receiptFrom: `${resultItem.debtor_acct} - ${resultItem.debtor_name}`,
                    amount: resultItem.doc_amt,
                    forPayment: resultItem.doc_no,
                    signedDate: moment(resultItem.gen_date).format('DD MMMM YYYY'),
                    city: "jakarta"
                };

                await this.generatePageOne(doc, pdfBody);
                if (resultItem.billType === 'A') {
                    doc.newPage()
                    await this.generatePageTwo(doc)
                }
            });



        } catch (error) {
            throw new NotFoundException(
                error.response
            );
        }




        return {
            statusCode: 201,
            message: 'pdf generated successfully',
            data: [],
        };
    }

    async generatePageTwo(doc) {
        doc.addPage()
        doc.image('./uploads/1733214269908-ss2.png', 50, 45, { width: 50 })
            .fillColor('#444444')
            .fontSize(20)
            .text('ACME Inc.', 110, 57)
            .fontSize(10)
            .text('123 Main Street', 200, 65, { align: 'right' })
            .text('New York, NY, 10025', 200, 80, { align: 'right' })
            .moveDown();
    }
    //in progress
    async generatePageOne(doc, data: Record<any, any>) {

        const formattedAmount = Intl.NumberFormat('id-ID').format(data.amount)
        const amountInWords = this.numberToWords(data.amount);

        doc.image('./uploads/pakubuwono-logo.png', 180, 20, { height: 90 });
        doc.fontSize(16).font('Helvetica-Bold').text('OFFICIAL RECEIPT', 220, 130);

        doc.fontSize(12).font('Helvetica').text(`No:`, 50, 170);
        doc.text(`:`, 130, 170);
        doc.text(data.no, 150, 170);

        doc.text(`Date`, 50, 190);
        doc.text(`:`, 130, 190);
        doc.text(data.date, 150, 190);

        doc.text(`Receipt From`, 50, 220);
        doc.text(`:`, 130, 220);
        doc.text(data.receiptFrom, 150, 220);

        doc.text(`Amount`, 50, 250);
        doc.text(`:`, 130, 250);
        doc.text(`IDR ${formattedAmount}`, 150, 250);

        doc.text(`Says`, 50, 280);
        doc.text(`:`, 130, 280);
        doc.text(`${amountInWords} Rupiah`, 150, 280, { width: 400, align: 'left' });

        doc.text(`For Payment`, 50, 320);
        doc.text(`:`, 130, 320);
        doc.text(data.forPayment, 150, 320);


        doc.text(`${data.city}, ${data.signedDate}`, 365, 380, { align: "center", width: 230 });
        doc.text(`emeterei`, 365, 440, { align: "center", width: 230 });
        doc.text(`(THIS IS COMPUTER GENERATED)`, 365, 500, { align: "center", width: 230 });

        doc.fontSize(10).font('Helvetica-Oblique')
            .text('P.P The Pakubuwono Residence', 50, 720, { align: 'center' })
            .text('Jl. Pakubuwono VI No. 68 Kebayoran Baru, Jakarta 12120, Indonesia', 50, 740, { align: 'center' });
        doc.text('Tel : 62 21 2750 5000 Fax : 62 21 2750 5050 Email : bm@pakubuwono-residence.com', 50, 760, { align: 'center' });
        doc.text('www.pakubuwono-residence.com', 50, 780, { align: 'center' })




    }
    async generatePdfSchedule(data: {
        no: string;
        date: string;
        receiptFrom: string;
        amount: number;
        forPayment: string;
        signedDate: string;
        city: string;
        billType: string
    }) {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 0,
        });

        const rootFolder = process.env.ROOT_PDF_FOLDER
        const filePath = `${rootFolder}schedule/pakubuwono_${data.forPayment}.pdf`;

        if (!fs.existsSync(`${rootFolder}schedule}`)) {
            fs.mkdirSync(`${rootFolder}schedule`, { recursive: true });
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        await this.generatePageOne(doc, data)

        if (data.billType === 'A') {
            await this.generatePageTwo(doc)
        }

        doc.end();

        return ({
            statusCode: 201,
            message: "invoice created!",
            data: filePath
        })
    }
    async generatePdfManual(data: {
        no: string;
        date: string;
        receiptFrom: string;
        amount: number;
        forPayment: string;
        signedDate: string;
        city: string;
        billType: string
    }) {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 0,
        });

        const rootFolder = process.env.ROOT_PDF_FOLDER
        const filePath = `${rootFolder}manual/pakubuwono_${data.forPayment}.pdf`;

        if (!fs.existsSync(`${rootFolder}manual}`)) {
            fs.mkdirSync(`${rootFolder}manual`, { recursive: true });
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        await this.generatePageOne(doc, data)

        if (data.billType === 'A') {
            await this.generatePageTwo(doc)
        }

        doc.end();


        return ({
            statusCode: 201,
            message: "invoice created",
            data: filePath
        })
    }
    async generatePdfProforma(data: {
        no: string;
        date: string;
        receiptFrom: string;
        amount: number;
        forPayment: string;
        signedDate: string;
        city: string;
        billType: string
    }) {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 0,
        });

        const rootFolder = process.env.ROOT_PDF_FOLDER
        const filePath = `${rootFolder}proforma/pakubuwono_${data.forPayment}.pdf`;

        if (!fs.existsSync(`${rootFolder}proforma}`)) {
            fs.mkdirSync(`${rootFolder}proforma`, { recursive: true });
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        await this.generatePageOne(doc, data)

        if (data.billType === 'A') {
            await this.generatePageTwo(doc)
        }

        doc.end();


        return ({
            statusCode: 201,
            message: "invoice created",
            data: filePath
        })
    }

    async testAutoGenerate(data: Record<any, any>) {
        const doc = new PDFDocument({ margin: 0, size: 'a4' });
        const filePath = `./invoice/first_jakarta.pdf`;
        const filePathPublic = `http://192.168.0.212:3001/first_jakarta.pdf`

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        if (!fs.existsSync('./invoice')) {
            fs.mkdirSync('./invoice');
        }

        doc.font('Times-Roman').fontSize(12).text('PT FIRST JAKARTA INTERNATIONAL', 60, 28)
            .fontSize(8).text('Indonesia Stock Exchange Building Tower 2, 30th floor, SCBD', 60, 43)
            .text('Jl. Jend. Sudirman Kav. 52-53 Jakarta 12190', 60, 51)
            .text('Tel. (021) 515 1515 (Hunting) Fax : (021) 515 3008', 60, 59)
            .fontSize(5).text('Property Management', 308, 33)
            .fontSize(9).text('TO :', 415, 37)
            .text('INDONESIA STOCK EXCHANGE BUILDING ', 395, 47)
            .text('TWR. 1 LT.30', 395, 57)
            .text('JL.JEND.SUDIRMAN KAV.52-53', 395, 67)
            .text('JAKARTA SELATAN 12190', 395, 77)
            .fontSize(18).text('DEBIT / CREDIT NOTE', 165, 134)
            .fontSize(12).text('D/C Note Date', 395, 151)
            .text(':', 493, 151)
            .fontSize(11).text('D/C Note No. ', 395, 177)
            .text('Payment Due Date ', 395, 201)
            .text('07/11/2024', 510, 152)
            .text('IN2412060001', 502, 177)
            .text('24/11/2024', 510, 201)
            .text('We debit/credit your account as follow : ', 30, 217)
            .fontSize(12).text('DESCRIPTION', 183, 241)
            .text('AMOUNT', 473, 241)
            .text('Miscellaneous Charges', 35, 276)
            .text('Period : -', 35, 291)
            .text('LAMP PURCHASING OCTOBER 2024', 35, 306)
            .text('RP', 435, 276)
            .text('42,000', 532, 276)
            .text('VAT 11%', 35, 391)
            .text('RP', 435, 391)
            .text('4,620', 538, 391)
            .fontSize(9).text('Any objection to this invoice should be submitted within 7 days after the date of the invoice received', 35, 442)
            .text('(Pengajuan keberatan terhadap invoice ini dilakukan paling lambat 7 hari sejak tanggal invoice diterima)', 35, 452)
            .fontSize(12).text('Total', 389, 481)
            .text('RP', 435, 481)
            .text('46,620', 532, 481)
            .fontSize(11).text('In Words', 35, 507)
            .text(':', 200, 507)
            .text('PAYMENT INSTRUCTION', 35, 522)
            .text(':', 200, 522)
            .fontSize(10).text('forty six thousand six hundred twenty', 210, 507)
            .fontSize(9).text('- payment should be made to the form of the crossed cheque (Giro) payable to', 35, 537)
            .text('or transfer to our acount : ', 39, 547)
            .text('- Please attach the PAYMENT ADVICE SLIP together with yout payment and sent to the Building Management Office', 35, 572)
            .text('- Receipt will be given after payment', 35, 582)
            .fontSize(10).text('PT. First Jakarta International', 325, 537)
            .text('- BANK ARTHA GRAHA (IDR)', 140, 547)
            .text('- BANK ARTHA GRAHA (USD)', 140, 560)
            .text('008.1.29601.4', 300, 547)
            .text('008.1.47651.9', 300, 560)
            .fontSize(11).text('Authorized officer', 480, 522)
            .text('Angela Gunawan', 480, 602)

        doc.end();


        return ({
            statusCode: 201,
            message: "invoice created",
            data: filePathPublic
        })
    }

    async generatePdfFirstJakarta(data: Record<any, any>) {
        const doc = new PDFDocument({ margin: 0, size: 'a4' });
        const filePath = `./invoice/first_jakarta_${data.docNo}.pdf`;
        const filePathPublic = `http://192.168.0.212:3001/first_jakarta_${data.docNo}.pdf`

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        if (!fs.existsSync('./invoice')) {
            fs.mkdirSync('./invoice');
        }

        //header kiri
        doc.image(`./uploads/first-jakarta-logo.png`, 15, 25, { width: 40, height: 45 })
            .fontSize(12)
            .font('Times-Bold').text("PT FIRST JAKARTA INTERNATIONAL", 60, 32)
            .fontSize(8).font('Times-Roman')
            .text("Indonesia Stock Exchange Building Tower 2, 30th floor, SCBD", 60, 46)
            .text("Jl. Jend. Sudirman Kav. 52-53 Jakarta 12190", 60, 54)
            .text("Tel. (021) 515 1515 (Hunting) Fax : (021) 515 3008", 60, 62)

        //header tengah
        doc.image('./uploads/cushman-and-wakefield-logo.png', 280, 44, { width: 100, heigth: 30 })
            .fontSize(5)
            .text('Property Management', 280, 35, { width: 100, align: 'center' })

        //header kanan
        doc.roundedRect(385, 32, 200, 80, 20).stroke()
        doc.font('Times-Roman').fontSize(9)
            .text('TO :', 395, 40, { indent: 20 })
            .text(data.address1, { width: 200 })
            //.moveDown()
            .text(data.address2, { width: 200 })
            //.moveDown()
            .text(`${data.address3} ${data.postCd}`, { width: 200 })

        doc.font('Times-Bold').fontSize(18).text('DEBIT / CREDIT NOTE', 165, 140)

        //header table kanan atas
        doc.fontSize(12).font('Times-Bold')
            .text('D/C Note Date', 395, 155)
            .text(':', 493, 155)

        //table kanan atas
        doc.rect(385, 170, 110, 25).stroke()
        doc.rect(495, 170, 80, 25).stroke()
        doc.rect(385, 195, 110, 25).stroke()
        doc.rect(495, 195, 80, 25).stroke()


        //isi table kanan atas
        doc.fontSize(11).font('Times-Bold')
            .text('D/C Note No. ', 395, 180)
            .text('Payment Due Date ', 395, 204)

        doc.fontSize(11).font('Times-Roman')
            .text(data.docDate, 495, 155, { width: 80, align: 'center' })
            .text(data.docNo, 495, 180, { width: 80, align: 'center' })
            .text(data.dueDate, 495, 204, { width: 80, align: 'center' })


        let tableYStart = 245

        //table tengah
        doc.fontSize(11).text('We debit/credit your account as follow : ', 30, 220)
        doc.rect(425, 235, 150, 270).stroke()
        doc.rect(25, 265, 550, 200).stroke()
        doc.rect(25, 235, 550, 270).stroke()

        doc.fontSize(12).font('Times-Bold')
            .text('DESCRIPTION', 25, tableYStart, { width: 400, align: 'center' })
            .text('AMOUNT', 425, tableYStart, { width: 150, align: 'center' })
        doc.font('Times-Roman')
            .text(data.desc, 35, tableYStart + 35)
            .text(`Period : ${data.period}`, 35, tableYStart + 50)
            .text(data.descInfo, 35, tableYStart + 65)
            .text(data.currencyCd, 435, tableYStart + 35, { width: 130, align: 'left' })
            .text(data.baseAmount.toLocaleString('en-CA'), 435, tableYStart + 35, { width: 130, align: 'right' })
        if (data.taxRate > 0) {
            doc
                .text(`VAT ${data.taxRate}%`, 35, tableYStart + 150)
                .text(data.currencyCd, 435, tableYStart + 150, { width: 130, align: 'left' })
                .text(data.taxAmount.toLocaleString('en-CA'), 435, tableYStart + 150, { width: 130, align: 'right' })
        }
        if (data.pphRate > 0) {
            doc.text(`PPH ${data.pphRate}%`, 350, tableYStart + 35)
        }
        if (data.overPayment > 0) {
            doc.fontSize(9)
                .text('Any objection to this invoice should be submitted within 7 days after the date of the invoice received', 35, tableYStart + 200)
                .text('(Pengajuan keberatan terhadap invoice ini dilakukan paling lambat 7 hari sejak tanggal invoice diterima)', 35, tableYStart + 210)
        }

        const total = data.baseAmount + data.taxAmount

        doc.font('Times-Bold').fontSize(12)
            .text('Total', 35, tableYStart + 240, { width: 380, align: 'right' })
            .text(data.currencyCd, 435, tableYStart + 240, { width: 130, align: 'left' })
            .text((total.toLocaleString('en-CA')), 435, tableYStart + 240, { width: 130, align: 'right' })

        doc.fontSize(11)
            .text('In Words', 35, tableYStart + 265)
            .text(':', 200, tableYStart + 265)
            .text('PAYMENT INSTRUCTION', 35, tableYStart + 280)
            .text(':', 200, tableYStart + 280)

        doc.fontSize(10).text(this.numberToWords(total), 210, tableYStart + 265)
            .fontSize(9).font('Times-Roman')
            .text('- payment should be made to the form of the crossed cheque (Giro) payable to', 35, tableYStart + 295)
            .text('or transfer to our acount : ', 39, tableYStart + 305)
            .text('- Please attach the PAYMENT ADVICE SLIP together with yout payment and sent to the Building Management Office', 35, tableYStart + 330)
            .text('- Receipt will be given after payment', 35, tableYStart + 340)
            .fontSize(10).font('Times-Bold')
            .text('PT. First Jakarta International', 325, tableYStart + 295)
            .text(`- ${data.bankNameRp} (IDR)`, 140, tableYStart + 305)
            .text(`- ${data.bankNameUsd} (USD)`, 140, tableYStart + 318)
            .text(`${data.acctRp}`, 300, tableYStart + 305)
            .text(`${data.acctUsd}`, 300, tableYStart + 318)
            .fontSize(11).font('Times-Roman')
            .text('Authorized officer', 480, tableYStart + 280)
            .font('Times-Bold')
            .text(data.signature, 480, tableYStart + 360)


        doc.end();


        return ({
            statusCode: 201,
            message: "invoice created",
            data: filePathPublic
        })
    }
    async generatePdfFirstJakarta2(data: Record<any, any>) {
        const doc = new PDFDocument({ margin: 0, size: 'a4' });
        const filePath = `./invoice/first_jakarta_2_${data.docNo}.pdf`;
        const filePathPublic = `http://192.168.0.212:3001/first_jakarta_2_${data.docNo}.pdf`

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        if (!fs.existsSync('./invoice')) {
            fs.mkdirSync('./invoice');
        }

        doc.font('Times-Roman').fontSize(12)
            .text('PT First Jakarta International', 0, 20, { align: 'center' })
            .text('Indonesia Stock Exchange Building, Lot 2 (SCBD)', { align: 'center' })
            .text('Jl. Jend Sudirman kav 52-53', { align: 'center' })
            .text('Jakarta 12190 - Indonesia', { align: 'center' })

        doc.rect(10, 80, 550, 1).stroke()
        doc.fontSize(10)
            .text('TO : ', 20, 90)
            .text(`${data.name}`, 20, 90, { indent: 20 })
            .text(`${data.address1}`, { indent: 20 })
            .text(`${data.address2}`, { indent: 20 })
            .text(`${data.address3} ${data.postCd}`, { indent: 20 })
        doc.rect(10, 150, 550, 1).stroke()

        doc.fontSize(12).font('Times-Bold')
            .text('CHILLED WATER FCU CHARGE CALCULATION', 0, 170, { align: 'center', underline: true })

        // Calculations
        const totalHours = data.currRead.map((curr, idx) => curr - data.lastRead[idx]);
        const totalTotalHours = totalHours.reduce((sum, hours) => sum + hours, 0).toFixed(2);

        const formattedCapacity = data.capacity.map(cap => cap.toLocaleString('id-ID', { minimumFractionDigits: 2 }));
        const totalCapacity = data.capacity.reduce((sum, cap) => sum + cap, 0).toLocaleString('id-ID', { minimumFractionDigits: 2 });

        const totalMultiplier = data.multiplier.reduce((sum, mul) => sum + mul, 0).toFixed(2);

        const formattedUsageRate = data.usageRate.map(rate => rate.toLocaleString('id-ID', { minimumFractionDigits: 2 }));
        const formattedApportionPercent = data.apportionPercent.map(percent => `${(percent * 100).toFixed(2)}%`);

        const billingTotal = data.billingAmount.reduce((sum, amount) => sum + amount, 0).toLocaleString('id-ID', { minimumFractionDigits: 2 });
        const roundedTo = data.billingAmount.map(amount => Math.round(amount).toLocaleString('id-ID', { minimumFractionDigits: 2 }));
        const totalRoundedTo = data.billingAmount.reduce((sum, amount) => sum + Math.round(amount), 0).toLocaleString('id-ID', { minimumFractionDigits: 2 });
        const rawTotalRoundedTo = data.billingAmount.reduce((sum, amount) => sum + Math.round(amount), 0)

        // First and Last Meter ID
        const firstMeterId = data.meterId[0];
        const lastMeterId = data.meterId[data.meterId.length - 1];

        doc.fontSize(10).font('Times-Roman')
            .text(`Hourly Basis Chilled Water, Fan Coil Unit (FCU) No : ${firstMeterId} tp ${lastMeterId}`, 10, 200)
            .text(`Period : ${data.month} ${data.year}`)

        let tableYStart = 250
        let textYStart = 257


        doc.rect(100, tableYStart - 20, 150, 20)
        doc.rect(10, tableYStart, 20, 20)
        doc.rect(30, tableYStart, 70, 20)
        doc.rect(100, tableYStart, 50, 20)
        doc.rect(150, tableYStart, 50, 20)
        doc.rect(200, tableYStart, 50, 20)
        doc.rect(250, tableYStart, 60, 20)
        doc.rect(310, tableYStart, 30, 20)
        doc.rect(340, tableYStart, 40, 20)
        doc.rect(380, tableYStart, 100, 20)
        doc.rect(480, tableYStart, 70, 20).stroke()
        doc.fontSize(8).font('Times-Roman')
            .text('Operation', 100, textYStart - 20, { align: 'center', width: 150 })
            .text('No', 10, textYStart, { align: 'center', width: 20 })
            .text(`No FCU`, 30, textYStart, { align: 'center', width: 70 })
            .text(`Start`, 100, textYStart, { align: 'center', width: 50 })
            .text(`Stop`, 150, textYStart, { align: 'center', width: 50 })
            .text(`Total Hours`, 200, textYStart, { align: 'center', width: 50 })
            .text(`Cooling Cap`, 250, textYStart, { align: 'center', width: 60 })
            .text(`TR`, 310, textYStart, { align: 'center', width: 30 })
            .text(`Rate`, 340, textYStart, { align: 'center', width: 40 })
            .text(`Billing Apportionment`, 380, textYStart, { align: 'center', width: 100 })
            .text(`Rounded to`, 480, textYStart, { align: 'center', width: 70 })
        tableYStart += 20
        textYStart += 20
        data.meterId.forEach((meter, idx) => {
            doc.rect(10, tableYStart, 20, 20)
            doc.rect(30, tableYStart, 70, 20)
            doc.rect(100, tableYStart, 50, 20)
            doc.rect(150, tableYStart, 50, 20)
            doc.rect(200, tableYStart, 50, 20)
            doc.rect(250, tableYStart, 60, 20)
            doc.rect(310, tableYStart, 30, 20)
            doc.rect(340, tableYStart, 40, 20)
            doc.rect(380, tableYStart, 100, 20)
            doc.rect(480, tableYStart, 70, 20).stroke()
            doc.text(idx + 1, 10, textYStart, { align: 'center', width: 20 })
                .text(`${meter}`, 35, textYStart, { align: 'left', width: 70 })
                .text(`${data.lastRead[idx]}`, 105, textYStart, { align: 'right', width: 40 })
                .text(` ${data.currRead[idx]}`, 155, textYStart, { align: 'right', width: 40 })
                .text(`${totalHours[idx].toFixed(2)}`, 205, textYStart, { align: 'right', width: 40 })
                .text(`${formattedCapacity[idx]}`, 255, textYStart, { align: 'right', width: 50 })
                .text(`${data.multiplier[idx].toFixed(2)}`, 315, textYStart, { align: 'right', width: 20 })
                .text(`${formattedUsageRate[idx]}`, 340, textYStart, { align: 'center', width: 40 })
                .text(`${formattedApportionPercent[idx]}`, 385, textYStart, { align: 'left', width: 90 })
                .text(`${data.billingAmount[idx].toLocaleString('id-ID', { minimumFractionDigits: 2 })}`, 385, textYStart, { align: 'right', width: 90 })
                .text(`RP`, 485, textYStart, { align: 'left', width: 60 })
                .text(`${roundedTo[idx]}`, 485, textYStart, { align: 'right', width: 60 })
            // .moveDown();
            tableYStart += 20
            textYStart += 20
        });
        doc.rect(10, tableYStart, 190, 20)
            .rect(200, tableYStart, 50, 20)
            .rect(250, tableYStart, 60, 20)
            .rect(310, tableYStart, 30, 20)
            .rect(340, tableYStart, 40, 20)
            .rect(380, tableYStart, 100, 20)
            .rect(480, tableYStart, 70, 20).stroke()

        doc
            .text(`Total`, 10, textYStart, { align: 'center', width: 70 })
            .text(totalTotalHours, 205, textYStart, { align: 'right', width: 40 })
            .text(totalCapacity, 255, textYStart, { align: 'right', width: 50 })
            .text(totalMultiplier, 315, textYStart, { align: 'right', width: 20 })
            .text(billingTotal, 385, textYStart, { align: 'right', width: 90 })
            .text(totalRoundedTo, 485, textYStart, { align: 'right', width: 60 })

        doc.fontSize(10)
            .text('In Words : ', 10, textYStart + 20)
            .text(`Indonesian Rupiah ${this.numberToWords(rawTotalRoundedTo)}`, { indent: 15 })

        doc.rect(10, tableYStart + 70, 550, 1).stroke()
            .text('FJI-FIN-FR-001-005/REV.0.0/27.02.2023', 0, 650, { width: 550, align: 'right' })
            .fontSize(9)
            .text('Note : This letter is an explanation of the Chilled Water, FCU calculation for Debit/Credit Note', 10, tableYStart + 85)
        doc.end();


        return ({
            statusCode: 201,
            message: "invoice created",
            data: filePathPublic
        })
    }
    async generatePdfFirstJakarta3(data: Record<any, any>) {
        const doc = new PDFDocument({ margin: 0, size: 'a4' });
        const filePath = `./invoice/first_jakarta_3_${data.docNo}.pdf`;
        const filePathPublic = `http://192.168.0.212:3001/first_jakarta_3_${data.docNo}.pdf`
        const moment = require('moment')

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        if (!fs.existsSync('./invoice')) {
            fs.mkdirSync('./invoice');
        }

        doc.font('Times-Roman').fontSize(12)
            .text('PT First Jakarta International', 0, 20, { align: 'center' })
            .text('Indonesia Stock Exchange Building, Lot 2 (SCBD)', { align: 'center' })
            .text('Jl. Jend Sudirman kav 52-53', { align: 'center' })
            .text('Jakarta 12190 - Indonesia', { align: 'center' })
            .text('Tel No : 5151515 Fax No : 5150909', { align: 'center' })

        doc.rect(10, 90, 550, 1).stroke()
        doc.fontSize(10)
            .text('TO : ', 42, 110)
            .text(`${data.name}`, 42, 110, { indent: 29 })
            .text(`${data.address1}`, { indent: 29 })
            .text(`${data.address2}`, { indent: 29 })
            .text(`${data.address3} ${data.postCd}`, { indent: 29 })
            .text(`Remarks : `, 20, 180)
            .text(`${data.remarks}`, 70, 180)

        doc.font('Times-Bold').fontSize(11)
            .text('CALCULATION OF OVERTIME', 20, 210, { align: 'left', width: 550 })
            .text('Page 1 of 4', 20, 210, { align: 'right', width: 550 })
        // Calculations


        let tableYStart = 250;
        let textYStart = 257;

        doc.rect(10, tableYStart - 20, 550, 1).stroke();
        doc.fontSize(8).font('Times-Bold')
            .text('No', 10, textYStart, { align: 'center', width: 20 })
            .text('Start', 30, textYStart, { align: 'center', width: 70 })
            .text('Overtime', 70, textYStart - 15, { align: 'center', width: 70 })
            .text('End', 100, textYStart, { align: 'center', width: 70 })
            .text('Time Consumption', 175, textYStart - 10, { align: 'center', width: 55 })
            .text('Equivalent Hour', 230, textYStart - 10, { align: 'center', width: 45 })
            .text('Rate', 280, textYStart, { align: 'center', width: 65 })
            .text('Currency', 345, textYStart, { align: 'center', width: 50 })
            .text('Amount', 380, textYStart, { align: 'right', width: 80 })
            .text('Remarks', 495, textYStart, { align: 'left', width: 95 });

        tableYStart += 20;
        textYStart += 20;

        doc.rect(10, tableYStart, 550, 1).stroke();

        let totalTimeConsumptionInMinutes = 0;
        let totalEquivalentHour = 0;
        let totalAmount = 0;
        data.startDate.forEach((startDate, idx) => {
            const start = moment(startDate);
            const end = moment(data.endDate[idx]);

            const diffInMinutes = end.diff(start, 'minutes');
            const timeConsumption = `${Math.floor(diffInMinutes / 60)}:${(diffInMinutes % 60).toString().padStart(2, '0')}`;
            const equivalentHour = parseFloat((diffInMinutes / 60).toFixed(2));

            const rate = data.rate[idx];
            // const amount = (equivalentHour * rate).toLocaleString('id-ID', { minimumFractionDigits: 2 });
            const amount = equivalentHour * rate;
            totalTimeConsumptionInMinutes += diffInMinutes;
            totalEquivalentHour += equivalentHour;
            totalAmount += amount;

            doc.fontSize(8).font('Times-Roman')
                .text(idx + 1, 10, textYStart, { align: 'center', width: 20 })
                .text(start.format('DD/MM/YYYY HH:mm'), 35, textYStart, { align: 'center', width: 70 })
                .text(end.format('DD/MM/YYYY HH:mm'), 105, textYStart, { align: 'center', width: 70 })
                .text(timeConsumption, 175, textYStart, { align: 'center', width: 55 })
                .text(equivalentHour.toFixed(2), 230, textYStart, { align: 'center', width: 45 })
                .text(rate.toLocaleString('en-US', { minimumFractionDigits: 2 }), 275, textYStart, { align: 'right', width: 65 })
                .text(data.currency, 340, textYStart, { align: 'center', width: 50 })
                .text(amount.toLocaleString('en-US', { minimumFractionDigits: 2 }), 390, textYStart, { align: 'right', width: 70 })
                .text(data.lotNo[idx], 500, textYStart, { align: 'left', width: 90 });

            tableYStart += 20;
            textYStart += 20;
        });


        doc.rect(10, tableYStart, 550, 1).stroke();

        const totalHours = `${Math.floor(totalTimeConsumptionInMinutes / 60)}:${totalTimeConsumptionInMinutes % 60}`;
        const totalEquivalentHourFormatted = totalEquivalentHour.toFixed(2);
        const totalAmountFormatted = totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // Add totals row
        doc.fontSize(8).font('Times-Roman')
            .text(totalHours, 175, textYStart, { align: 'center', width: 55 })
            .text(totalEquivalentHourFormatted, 230, textYStart, { align: 'center', width: 45 })
            .text(data.currency, 340, textYStart, { align: 'center', width: 50 })
            .text(totalAmountFormatted, 390, textYStart, { align: 'right', width: 70 });

        doc.fontSize(10)
            .text(`Periode Date ${moment(data.startPeriod).format('DD/MM/YYYY')} to ${moment(data.startPeriod).format('DD/MM/YYYY')}`, 20, textYStart + 20)
            .text(`In Words : ${this.numberToWords(parseFloat(totalAmount.toFixed(2)))}`, 20, textYStart + 40)
            // .text(`In Words : ${this.numberToWords(Math.round(totalAmount))}`, 20, textYStart + 40)



            .text('FJI-FIN-FR-001-006/REV.0.0/27.02.2023', 0, 650, { width: 550, align: 'right' })
            .fontSize(9)
        doc.end();

        console.log(totalAmount)

        return ({
            statusCode: 201,
            message: "invoice created",
            data: filePathPublic
        })
    }

    async generatePdfSantosa(data: Record<any, any>) {
        const doc = new PDFDocument({ margin: 0 });
        const filePath = `./invoice/santosa_${data.ORno}.pdf`;

        if (!fs.existsSync('./invoice')) {
            fs.mkdirSync('./invoice');
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        doc.image(`./uploads/santosa-logo.png`, 30, 20, { width: 130, height: 70 })
        doc.font('Times-Bold')
            .text('PT. Santosa Mitra Kalindo', 150, 30)
        doc.fontSize(12).font('Times-Roman')
            .text('Manajemen Mal', 150, 42)
            .text('Lantai 3, Ayani megamal', 150, 54)
            .text('Jalan Ahmad Yani, Pontianak 78122, Indonesia', 150, 66)
            .text('Tel. : +62-561-763888', 150, 78)
            .text('Fax. : +62-561-763889', 150, 90)

        doc.fontSize(16).font('Times-Bold').text('OFFICIAL RECEIPT', 220, 130);

        doc.fontSize(15).font('Times-Roman')
            .text(`O/R no.`, 410, 160)
            .text(`:`, 460, 160)
            .text(`${data.ORno}`, 480, 160)
            .text(`Date`, 410, 175)
            .text(`:`, 460, 175)
            .text(`${data.date}`, 480, 175)



        let tableStartY = 200

        const wrapText = (doc, text, x, y, maxWidth, lineHeight) => {
            const words = text.split(' ');
            let line = '';
            let yOffset = 0;

            words.forEach((word, i) => {
                const testLine = line + word + ' ';
                const testWidth = doc.widthOfString(testLine);

                if (testWidth > maxWidth && i > 0) {
                    doc.text(line, x, y + yOffset);
                    line = word + ' ';
                    yOffset += lineHeight;
                    tableStartY += 12
                } else {
                    line = testLine;
                }
            });

            if (line) {
                doc.text(line, x, y + yOffset);
            }
        };

        doc.rect(50, tableStartY, 500, 30).stroke();
        doc.rect(50, tableStartY + 30, 500, 30).stroke();
        doc.fontSize(15).font('Times-Bold')
            .text(`Diterima dari.`, 60, tableStartY + 10)
            .text(`:`, 200, tableStartY + 10)
            .text(`Jumlah.`, 60, tableStartY + 40)
            .text(`:`, 200, tableStartY + 40)
            .text(`Terbilang.`, 60, tableStartY + 70)
            .text(`:`, 200, tableStartY + 70)


        doc.fontSize(15).font('Times-Roman')
            .text(`${data.diterimaDari}`, 220, tableStartY + 10)
            .text(`Rp. ${data.jumlah}`, 220, tableStartY + 40)
        wrapText(doc, data.terbilang, 220, tableStartY + 70, 300, 15)

        doc.fontSize(15).font('Times-Bold').text(`Untuk Pembayaran.`, 60, tableStartY + 100)
            .text(`:`, 200, tableStartY + 100)
        data.untukPembayaran.forEach((pembayaran, index) => {
            doc.fontSize(12).font('Times-Roman')
                .text(pembayaran, 220, tableStartY + 100);
            tableStartY += 12;
        });

        doc.fontSize(15).font('Times-Bold').text(`Cara Pembayaran.`, 60, tableStartY + 110)
            .text(`:`, 200, tableStartY + 110)
        doc.fontSize(15).font('Times-Roman').text(`${data.caraPembayaran}`, 220, tableStartY + 110)

        doc.fontSize(15).font('Times-Roman')
            .text(`Authorized Signature`, 350, 600, { align: 'center' })
            .text(`emeterei`, 350, 650, { align: 'center' })
            .text(`${data.namaPenerima}`, 350, 700, { align: 'center' })
        doc.end();

        return ({
            statusCode: 201,
            message: "invoice created",
            data: filePath
        })
    }

    async generatePdfFirstJakarta4(data: Record<any, any>) {
        const doc = new PDFDocument({ margin: 0, size: 'a4' });
        const filePath = `./invoice/first_jakarta_4_${data.docNo}.pdf`;
        const filePathPublic = `http://192.168.0.212:3001/first_jakarta_4_${data.docNo}.pdf`

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        if (!fs.existsSync('./invoice')) {
            fs.mkdirSync('./invoice');
        }

        //header kiri
        doc
            .fontSize(10)
            .font('Times-Bold').text("PT. FIRST JAKARTA INTERNATIONAL", 20, 30)
            .moveDown()
            .fontSize(9).font('Times-Roman')
            .text("Sudirman Central Business District", 20)
            .text("Jl. Jend. Sudirman Kav. 52-53 Jakarta 12190", 20)
            .text("Jakarta 12190, Indonesia", 20)
            .text("Telp. (021) 515 1515  Fax : (021) 515 3008", 20)



        //header kanan
        doc.rect(280, 30, 280, 80).stroke()
        doc.font('Times-Roman').fontSize(10)
            .text('TO :', 285, 40)
        if (data.tradeName !== "") {
            doc.font('Times-Bold').text(data.tradeName, { width: 280 })
        }
        else {
            doc.text(data.debtorName, { width: 280 })
        }
        doc.moveDown()
            .font('Times-Roman')
            .text(data.address1, { width: 280 })
            .text(data.address2, { width: 280 })
            .text(`${data.address3}`, { width: 200 })

        doc
            .text('No', 400, 130, { lineGap: 2 }).text('Date', { lineGap: 2 }).text('DueDate')
            .text(':', 450, 130, { lineGap: 2 }).text(':', { lineGap: 2 }).text(':')
            .text(data.docNo, 470, 130, { lineGap: 2 }).text(data.docDate, { lineGap: 2 }).text(data.dueDate)


        doc.font('Times-Bold').fontSize(16).text('Proforma Debit Note', 200, 180)

        doc.font('Times-Roman').fontSize(11)
            .text('Through this Proforma Debit Note, we acknowledge your payment due is as follow', 20, 220)

        //kerangka table
        doc.rect(20, 235, 540, 250)
            .rect(20, 255, 540, 130)
            .rect(360, 235, 200, 250)
            .rect(390, 255, 170, 230)
            .rect(390, 360, 170, 50)
            .rect(390, 465, 170, 1)
            .stroke()

        //isi table
        doc
            .text('Description', 20, 240, { width: 340, align: 'center' })
            .text('Amount', 360, 240, { width: 200, align: 'center' })
            .text(`Charge Name : `, 30, 270).moveDown()
            .text('Period :', { lineGap: 5 }).text('VAT : ')
            .text(data.taxDesc, 100, 270).moveDown()
            .text(`${data.startDate} - ${data.endDate}`, { lineGap: 2 }).text(`${data.taxRate} %`)
            .text('Amount Should be paid', 210, 365)
        doc
            .text(data.currencyCd, 368, 270)
            .text(data.currencyCd, 368, 310)
            .text(data.currencyCd, 368, 368)
            .text(data.currencyCd, 368, 430)
            .text(data.currencyCd, 368, 470)

        const formattedBaseAmount = (data.baseAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const formattedTaxAmount = (data.taxAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const formattedTotal = (data.baseAmount + data.taxAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })

        doc.text(formattedBaseAmount, 460, 270)
            .text(formattedTaxAmount, 460, 310)
            .text(formattedTotal, 460, 368)
            .text('Total Transfer', 440, 394)
            .text(formattedTotal, 460, 430)
            .text(formattedTotal, 460, 470)

        doc.text('Please Transfer the amount to out account at :', 30, 400, { underline: true })
            .text(`${data.bankNameRp} (RP)`, 30, 430)
            .text(`RP ${data.acctRp}`, 190, 430)
            .text(`TOTAL`, 310, 470)
        if (data.bankNameUsd !== "" && data.acctUsd !== "") {
            doc.text(`${data.bankNameUsd} (USD)`, 30, 470)
                .text(`USD ${data.acctUsd}`, 190, 470)
        }

        doc.text('payment should be mande in the form of crossed cheque or giro payable to', 30, 510)
            .font('Times-Bold').text('PT. FIRST JAKARTA INTERNATIONAL')
            .font('Times-Roman').text('or transfer to the above account bank', 240, 521)
            .text('We will send the original debit note after we receiced your paymeny', 30, 545)
            .text('Please Call us if you have any question')

        doc.font('Times-Bold').fontSize(10)
            .text('PT. FIRST JAKARTA INTERNATIONAL', 370, 590)
            .text('Authorized Officer', { width: 190, align: 'center' })
            .font('Times-Roman').fontSize(9)
            .moveDown()
            .moveDown()
            .moveDown()
            .moveDown()
            .moveDown()
            .text(data.signature, { width: 190, align: 'center' })
        doc.end();


        return ({
            statusCode: 201,
            message: "invoice created",
            data: filePathPublic
        })
    }
    async generatePdfBekasi(data: Record<any, any>) {
        const doc = new PDFDocument({ margin: 0 });
        const filePath = `./invoice/bekasi_${data.noFaktur}.pdf`;

        if (!fs.existsSync('./invoice')) {
            fs.mkdirSync('./invoice');
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        doc.fontSize(10).font('Helvetica-Bold').text('PT.Bekasi Fajar Industrial Estate, Tbk', 80, 22)
        doc.fontSize(9).font('Helvetica')
            .text('Jl. Sumatera MM 2100, Gandasari', 80, 35)
            .text('Cikarang Barat, Bekasi - Jawa Barat 17520', 80, 45)
            .text('Tel No: 021 - 8980133 Fax No: 021 - 8980457', 80, 65)

        doc.fontSize(25).font('Helvetica-Oblique').
            text('FAKTUR', 330, 50, { align: 'center' })
            .text('INVOICE', 330, 80, { align: 'center' })

        doc.lineTo(420, 75)
            .lineTo(525, 75)
            .stroke()

        doc.rect(25, 110, 325, 20).stroke()
        doc.rect(25, 130, 325, 80).stroke()

        doc.rect(360, 110, 100, 30).stroke()
        doc.rect(360, 140, 100, 20).stroke()

        doc.rect(470, 110, 85, 30).stroke()
        doc.rect(470, 140, 85, 20).stroke()

        doc.fontSize(8).font('Helvetica')
            .text('Invoice Date', 360, 127, { width: 100, align: 'center' })
            .text('Invoice No', 470, 127, { width: 85, align: 'center' })

        doc.fontSize(10).font('Helvetica')
            .text('Kepada / To', 25, 115, { width: 325, align: 'center' })
            .text('Tanggal Faktur', 360, 115, { width: 100, align: 'center' })
            .text('No. Faktur', 470, 115, { width: 85, align: 'center' })
            .text(`${data.kepada}`, 30, 135, { width: 320 })
            .text(`${data.tanggalFaktur}`, 360, 145, { width: 100, align: 'center' })
            .text(`${data.noFaktur}`, 470, 145, { width: 85, align: 'center' })

        //doc.rect(25, 220, 530, 40).stroke()
        let xStart = 25
        doc.rect(xStart, 220, 127, 85).stroke()
            .fontSize(8)
            .text(`keterangan`, xStart, 230, { width: 127, align: 'center' })
            .text(`description`, xStart, 240, { width: 127, align: 'center' })
            .text(`${data.description}`, 25, 265, { width: 127, align: 'center' })
        xStart += 127
        doc.rect(xStart, 220, 66, 85).stroke()
            .fontSize(8)
            .text(`meteran air awal`, xStart, 230, { width: 66, align: 'center' })
            .fontSize(6)
            .text(`meter beginning`, xStart, 240, { width: 66, align: 'center' })
            .fontSize(10)
            .text(`${data.meteranAwal}`, xStart, 265, { width: 66, align: 'center' })
        xStart += 66
        doc.rect(xStart, 220, 72, 85).stroke()
            .fontSize(8)
            .text(`meteran air akhir`, xStart, 230, { width: 72, align: 'center' })
            .fontSize(6)
            .text(`meter ending`, xStart, 240, { width: 72, align: 'center' })
            .fontSize(10)
            .text(`${data.meteranAkhir}`, xStart, 265, { width: 72, align: 'center' })
        xStart += 72
        doc.rect(xStart, 220, 79, 85).stroke()
            .fontSize(8)
            .text(`Pemakaian (m3)`, xStart, 230, { width: 79, align: 'center' })
            .text(`/Luas (m2)`, xStart, 240, { width: 79, align: 'center' })
            .fontSize(6)
            .text(`usage (m3) / area (m2)`, xStart, 250, { width: 79, align: 'center' })
            .fontSize(10)
            .text(`${data.pemakaianLuas}`, xStart, 265, { width: 75, align: 'right' })
        xStart += 79
        doc.rect(xStart, 220, 60, 85).stroke()
            .fontSize(8)
            .text(`Harga Satuan`, xStart, 230, { width: 60, align: 'center' })
            .fontSize(6)
            .text(`Unit Price`, xStart, 240, { width: 60, align: 'center' })
            .fontSize(10)
            .text(`${data.hargaSatuan}`, xStart, 265, { width: 60, align: 'center' })
        xStart += 60
        doc.rect(xStart, 220, 42, 85).stroke()
            .fontSize(8)
            .text(`PPN`, xStart, 230, { width: 42, align: 'center' })
            .fontSize(6)
            .text(`Vat`, xStart, 240, { width: 42, align: 'center' })
            .fontSize(10)
            .text(`${data.ppn}`, xStart, 265, { width: 42, align: 'center' })
        xStart += 42
        doc.rect(xStart, 220, 84, 85).stroke()
            .fontSize(8)
            .text(`Jumlah`, xStart, 230, { width: 84, align: 'center' })
            .text(`IDR`, xStart, 250, { width: 84, align: 'center' })
            .fontSize(6)
            .text(`Total`, xStart, 240, { width: 84, align: 'center' })
            .fontSize(10)
            .text(`${data.total}`, xStart, 265, { width: 80, align: 'right' })
        xStart += 84
        doc.lineTo(25, 260).lineTo(555, 260).stroke()

        xStart = 25
        doc.rect(xStart, 320, 330, 15).stroke().text('Keterangan / Remarks', xStart + 5, 324)
        doc.rect(xStart, 335, 330, 35).stroke()
            .fontSize(9)
            .text(`Period / Period`, xStart + 10, 340)
            .text(`${data.periode}`, xStart, 355, { width: 330, align: 'center' })
            .text(`Catatan / Note`, xStart, 375)

        doc.fontSize(9).text(`Jatuh tempo tanggal / Due date : `, xStart, 420)
            .font('Times-Bold')
            .text(data.dueData, xStart + 100, 420)
        doc.end();

        return ({
            statusCode: 201,
            message: "invoice created",
            data: filePath
        })
    }



    private numberToWords(amount: number): string {
        const ones = [
            '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        ];
        const teens = [
            'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
            'Seventeen', 'Eighteen', 'Nineteen',
        ];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const thousands = ['', 'Thousand', 'Million', 'Billion'];

        if (amount === 0) return 'Zero';

        const [integerPart, decimalPart] = amount.toString().split('.');

        let words = '';
        let i = 0;
        let integerAmount = parseInt(integerPart, 10);

        // Convert the integer part
        while (integerAmount > 0) {
            const chunk = integerAmount % 1000;
            if (chunk > 0) {
                const chunkWords = this.convertChunk(chunk);
                words = chunkWords + (thousands[i] ? ' ' + thousands[i] + ' ' : '') + words;
            }
            integerAmount = Math.floor(integerAmount / 1000);
            i++;
        }

        words = words.trim();

        // Convert the decimal part if present
        if (decimalPart && parseInt(decimalPart, 10) > 0) {
            const decimalWords = this.convertChunk(parseInt(decimalPart, 10));
            words += ` and ${decimalWords} Cent${parseInt(decimalPart, 10) > 1 ? 's' : ''}`;
        }

        return words.trim();
    }

    private convertChunk(chunk: number): string {
        const ones = [
            '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        ];
        const teens = [
            'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
            'Seventeen', 'Eighteen', 'Nineteen',
        ];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        let words = '';

        if (chunk >= 100) {
            words += ones[Math.floor(chunk / 100)] + ' Hundred ';
            chunk %= 100;
        }

        if (chunk >= 11 && chunk <= 19) {
            words += teens[chunk - 11] + ' ';
        } else if (chunk >= 20 || chunk === 10) {
            words += tens[Math.floor(chunk / 10)] + ' ';
            chunk %= 10;
        }

        if (chunk >= 1 && chunk <= 9) {
            words += ones[chunk] + ' ';
        }

        return words.trim();
    }


}


