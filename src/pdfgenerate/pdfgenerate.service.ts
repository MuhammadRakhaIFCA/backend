import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as moment from 'moment'
import * as ftp from 'basic-ftp';
import * as path from 'path';
import { FjiDatabaseService } from 'src/database/database-fji.service';



@Injectable()
export class PdfgenerateService {
    private client: ftp.Client;
    constructor(
        private readonly fjiDatabase: FjiDatabaseService
    ) {
        this.client = new ftp.Client();
        this.client.ftp.verbose = true;
    }

    async connect(): Promise<void> {
        console.log(this.client.closed)
        if (this.client.closed) {
            console.log('Reconnecting to FTP server...');
            await this.client.access({
                host: process.env.FTP_HOST,
                user: process.env.FTP_USERNAME,
                password: process.env.FTP_PASSWORD,
                secure: false,
                port: 21,
            });
        }
        console.log('Connected to FTP server.');
    }
    async download(remoteFilePath: string, localFilePath: string): Promise<void> {
        try {
            await this.client.downloadTo(localFilePath, remoteFilePath);
            console.log('File downloaded successfully');
        } catch (error) {
            throw new Error(`Failed to download file: ${error.message}`);
        }
    }
    async upload(localFilePath: string, remoteFilePath: string): Promise<void> {
        try {
            if (!fs.existsSync(localFilePath)) {
                throw new Error(`Local file does not exist: ${localFilePath}`);
            }
            const remoteDirPath = path.dirname(remoteFilePath);
            await this.client.ensureDir(remoteDirPath);
            await this.client.uploadFrom(localFilePath, remoteFilePath);
            console.log('File uploaded successfully');
        } catch (error) {
            throw new Error(`Failed to upload file: ${error.message}`);
            throw new BadRequestException(error);
        }
    }

    async disconnect() {
        try {
            this.client.close();
            console.log('Disconnected from FTP server');
        } catch (err) {
            console.error('Failed to disconnect', err);
            throw err;
        }
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

    async generatePageOne(doc, data: Record<any, any>) {
        const baseAmt = Number(data.base_amt)
        const taxAmt = Number(data.tax_amt)
        const pphRate = Number(data.pph_rate)
        const taxRate = Number(data.tax_rate)
        const allocAmt = Number(data.alloc_amt)
        const formattedBaseAmt = baseAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const formattedTaxAmt = taxAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const formattedTaxRate = taxRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const formattedPphRate = pphRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const formattedAllocAmt = allocAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        //header kiri
        const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)
        const imagePath = path.resolve(__dirname, '../../public/images/first-jakarta-logo.png');
        doc.image(`${imagePath}`, 15, 25, { width: 40, height: 45 })
            .fontSize(12)
            .font('Times-Bold').text("PT FIRST JAKARTA INTERNATIONAL", 60, 32)
            .fontSize(8).font('Times-Roman')
            .text("Indonesia Stock Exchange Building Tower 2, 30th floor, SCBD", 60, 46)
            .text("Jl. Jend. Sudirman Kav. 52-53 Jakarta 12190", 60, 54)
            .text("Tel. (021) 515 1515 (Hunting) Fax : (021) 515 3008", 60, 62)

        //header tengah
        const cushmanPath = path.resolve(__dirname, '../../public/images/cushman-and-wakefield-logo.png');
        doc.image(cushmanPath, 280, 44, { width: 100, heigth: 30 })
            .fontSize(5)
            .text('Property Management', 280, 35, { width: 100, align: 'center' })

        //header kanan
        doc.roundedRect(385, 32, 200, 80, 20).stroke()
        doc.font('Times-Roman').fontSize(9)
            .text('TO :', 395, 40)
            .text(data.debtor_name, { width: 190 })
            .text(data.address1, { width: 190 })
            //.moveDown()
            .text(data.address2, { width: 190 })
            //.moveDown()
            .text(`${data.address3} ${data.post_cd}`, { width: 190 })

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

        const docDate = moment(data.doc_date).format('DD/MM/YYYY')
        const dueDate = moment(data.due_date).format('DD/MM/YYYY')
        doc.fontSize(11).font('Times-Roman')
            .text(docDate, 495, 155, { width: 80, align: 'center' })
            .text(data.doc_no, 495, 180, { width: 80, align: 'center' })
            .text(dueDate, 495, 204, { width: 80, align: 'center' })


        let tableYStart = 245

        //table tengah
        doc.fontSize(11).text('We debit/credit your account as follow : ', 30, 220)
        // console.log(doc.getTextWidth('We debit/')) 
        // const xPosition = 30 + doc.getTextWidth('We debit/')
        // const yPosition = 220; 

        doc.text('xxxxx', 72, 220);
        doc.rect(425, 235, 150, 270).stroke()
        doc.rect(25, 265, 550, 200).stroke()
        doc.rect(25, 235, 550, 270).stroke()

        const startDate = moment(data.start_date).format('DD/MM/YYYY')
        const endDate = moment(data.end_date).format('DD/MM/YYYY')
        doc.fontSize(12).font('Times-Bold')
            .text('DESCRIPTION', 25, tableYStart, { width: 400, align: 'center' })
            .text('AMOUNT', 425, tableYStart, { width: 150, align: 'center' })
        if (data.type == "manual") {
            doc.font('Times-Roman')
        }
        doc.text(data.descs, 35, tableYStart + 35)
        doc.font('Times-Roman')
        doc.text(data.currency_cd, 435, tableYStart + 35, { width: 130, align: 'left' })
            .text(formattedBaseAmt, 435, tableYStart + 35, { width: 130, align: 'right' })
        if (data.trx_type !== '1402' && data.descs_lot !== undefined) {
            console.log("descs_lot : " + data.descs_lot)
            console.log("trx_type : " + data.trx_type)
            doc.text(`Unit Number : ${data.descs_lot}`, 35, tableYStart + 50)
        }
        tableYStart += 15
        doc.text(`Period : ${data.line1}`, 35, tableYStart + 50)
        if (data.descs_info !== undefined && data.descs_info !== null) {
            //tableYStart += 15
            doc.text(`${data.descs_info}`, 35, tableYStart + 65)
        }


        tableYStart -= 15
        if (taxRate > 0) {
            doc
                .text(`VAT`, 35, tableYStart + 150)
                .text(data.currency_cd, 435, tableYStart + 150, { width: 130, align: 'left' })
                .text((formattedTaxAmt), 435, tableYStart + 150, { width: 130, align: 'right' })
        }

        if (pphRate > 0) {
            doc.text(`PPH ${formattedPphRate}%`, 350, tableYStart + 35)
        }
        if (allocAmt > 0) {
            doc.fontSize(12)
                .text(data.currency_cd, 435, tableYStart + 180, { width: 130, align: 'left' })
                .text(`(${formattedAllocAmt})`, 435, tableYStart + 180, { width: 130, align: 'right' })
                //.fontSize(14)
                .text('Less Over Payment/Refund Secr.Deposit/Other', 35, tableYStart + 180)
        }
        doc.fontSize(9)
            .text('Any objection to this invoice should be submitted within 7 days after the date of the invoice received', 35, tableYStart + 200)
            .text('(Pengajuan keberatan terhadap invoice ini dilakukan paling lambat 7 hari sejak tanggal invoice diterima)', 35, tableYStart + 210)


        const total = Math.round((baseAmt + taxAmt - allocAmt) * 100) / 100
        const formattedTotal = total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });


        doc.font('Times-Bold').fontSize(12)
            .text('Total', 35, tableYStart + 240, { width: 380, align: 'right' })
            .text(data.currency_cd, 435, tableYStart + 240, { width: 130, align: 'left' })
            .text(formattedTotal, 435, tableYStart + 240, { width: 130, align: 'right' })

        doc.fontSize(11)
            .text('In Words', 35, tableYStart + 265)
            .text(':', 200, tableYStart + 265)
            .text('PAYMENT INSTRUCTION', 35, tableYStart + 290)
            .text(':', 200, tableYStart + 290)
        console.log("total : " + total)
        if (data.currency_cd == "RP") {
            doc.fontSize(10).text(`Indonesian Rupiah ${this.numberToWords(total)} only`, 210, tableYStart + 265, { width: 340 })
        }
        else if (data.currency_cd == "USD") {
            doc.fontSize(10).text(`United States Dollar ${this.numberToWords(total)} only`, 210, tableYStart + 265, { width: 340 })
        }
        tableYStart += 10
        doc.fontSize(9).font('Times-Roman')
            .text('- Payment should be made to the form of the crossed cheque (Giro) payable to', 35, tableYStart + 295)
            .text('or transfer to our acount : ', 39, tableYStart + 305)
            // .text('- Please attach the PAYMENT ADVICE SLIP together with your payment and sent to the Building Management Office', 35, tableYStart + 330)
            .text('- Receipt will be given after payment', 35, tableYStart + 340)
            .fontSize(10).font('Times-Bold')
            .text('PT. First Jakarta International', 325, tableYStart + 295)
            .text(`- ${data.bank_name_rp}   ${data.account_rp}`, 140, tableYStart + 305)
            .text(`- ${data.bank_name_usd}   ${data.account_usd}`, 140, tableYStart + 318)
            // .text(`${data.account_rp}`, 350, tableYStart + 305)
            // .text(`${data.account_usd}`, 350, tableYStart + 318)
            .fontSize(11).font('Times-Roman')
            .text('Authorized officer', 480, tableYStart + 280, { width: 90, align: 'center' })
        if (baseAmt + taxAmt >= 5000000 || (data.currency_cd == "USD" && baseAmt + taxAmt >= 300)) {
            doc.text('E-meterai', 480, tableYStart + 320, { width: 90, align: 'center' })
        }
        doc.font('Times-Bold')
            // .text(data.signature, 480, tableYStart + 380, { width: 90, align: 'center' })
            .text(data.signature, 380, tableYStart + 380, { width: 180, align: 'right' })

        doc.fontSize(8)
            .text('Disclaimer : ', 225, tableYStart + 400)
            .font('Times-Italic')
            .text('This document does not need to be signed', 270, tableYStart + 400)
            .text(`${data.formid}`, 0, 800, { width: 550, align: 'right' })



    }
    async generatePdfManual(data: Record<any, any>) {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 0,
        });

        const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)
        let filePath = `${rootFolder}/manual/${data.fileName}`;
        console.log("manual uploaded in local file in : " + filePath)
        if (!fs.existsSync(`${rootFolder}/manual}`)) {
            fs.mkdirSync(`${rootFolder}/manual`, { recursive: true });
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);
        await this.generatePageOne(doc, data)


        doc.end();

        try {
            await this.connect();
            const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
            const filePath = `${rootFolder}/manual/${data.fileName}`;
            if (!fs.existsSync(filePath)) {
                console.error(`Local file does not exist: ${filePath}`);
            }

            await this.upload(filePath, `/UNSIGNED/GQCINV/MANUAL/${data.fileName}`);

        } catch (error) {
            console.log("Error during upload:.", error);
            throw new BadRequestException({
                statusCode: 400,
                message: 'Failed to upload to FTP',
                data: [error],
            });
        } finally {
            console.log("Disconnecting from FTP servers");
            await this.disconnect();
        }
        return ({
            statusCode: 201,
            message: "invoice created!",
            data: filePath
        })
    }
    async generatePdfSchedule(data: Record<any, any>) {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 0,
        });

        const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)
        let filePath = `${rootFolder}/schedule/${data.filenames}`;

        if (!fs.existsSync(`${rootFolder}/schedule`)) {
            fs.mkdirSync(`${rootFolder}/schedule`, { recursive: true });
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);
        console.log("schedule")
        await this.generatePageOne(doc, data)


        doc.end();

        try {
            await this.connect();
            const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
            const filePath = `${rootFolder}/schedule/${data.filenames}`;
            if (!fs.existsSync(filePath)) {
                console.error(`Local file does not exist: ${filePath}`);
            }

            await this.upload(filePath, `/UNSIGNED/GQCINV/SCHEDULE/${data.filenames}`);

        } catch (error) {
            console.log("Error during upload:.", error);
            throw new BadRequestException({
                statusCode: 400,
                message: 'Failed to upload to FTP',
                data: [error],
            });
        } finally {
            console.log("Disconnecting from FTP servers");
            await this.disconnect();
        }
        return ({
            statusCode: 201,
            message: "invoice created!",
            data: filePath
        })
    }
    async generatePdfManualUnsused(data: {
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

        const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)
        const filePath = `${rootFolder}/manual/pakubuwono_${data.forPayment}.pdf`;

        if (!fs.existsSync(`${rootFolder}/manual}`)) {
            fs.mkdirSync(`${rootFolder}/manual`, { recursive: true });
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
    async generatePdfProforma(data: Record<any, any>) {
        try {
            await this.generatePdfFirstJakarta4(data)
        } catch (error) {
            throw new BadRequestException({
                statusCode: 400,
                message: "Error generate pdf",
                data: []
            })
        }

        try {
            await this.connect();
            const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
            const filePath = `${rootFolder}/proforma/${data.fileName}`;
            if (!fs.existsSync(filePath)) {
                console.error(`Local file does not exist: ${filePath}`);
            }

            await this.upload(filePath, `/UNSIGNED/GQCINV/PROFORMA/${data.fileName}`);

        } catch (error) {
            console.log("Error during upload:.", error);
            throw new BadRequestException({
                statusCode: 400,
                message: 'Failed to upload to FTP',
                data: [error],
            });
        } finally {
            console.log("Disconnecting from FTP servers");
            await this.disconnect();
        }
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
            .fontSize(9).text('- Payment should be made to the form of the crossed cheque (Giro) payable to', 35, 537)
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

    async generateReferenceG(doc_no: string, debtor_acct: string, doc_date: Date, filenames2: string) {
        const docDate = moment(doc_date).format('DD MMM YYYY');
        const doc = new PDFDocument({
            size: 'A4',
            margin: 0,
        });

        const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)
        const filePath = `${rootFolder}/schedule/${filenames2}`;


        if (!fs.existsSync(`${rootFolder}/schedule`)) {
            fs.mkdirSync(`${rootFolder}/schedule`, { recursive: true });
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);
        const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT meter_id, base_amt1, gen_amt1, apportion_percent, * 
            FROM mgr.v_ar_ref_fcu_web 
            WHERE debtor_acct = '${debtor_acct}' 
            AND doc_date = '${docDate}'
        `);

        const pdfBody = {
            docNo: doc_no,
            name: result[0]?.name,
            address1: result[0]?.address1,
            address2: result[0]?.address2,
            address3: result[0]?.address1,
            postCd: result[0]?.post_cd,
            currencyCd: result[0].currency_cd,
            docDate: result[0]?.read_date,
            meterId: result.map((item) => item.meter_id),
            lastRead: result.map((item) => Number(item.last_read)),
            currRead: result.map((item) => Number(item.curr_read)),
            capacity: result.map((item) => Number(item.capacity)),
            multiplier: result.map((item) => Number(item.multiplier)),
            usageRate: result.map((item) => Number(item.usage_rate1)),
            apportionPercent: result.map((item) => Number(item.apportion_percent)),
            billingAmount: result.map((item) =>
                (item.as_reduction === 'Y' ? Number(item.base_amt1) - 1 : Number(item.base_amt1)) + Number(item.gen_amt1)
            ),
            genAmount: result.map((item) => Number(item.gen_amt1)),
            roundingAmount: result.map((item) =>
                item.as_reduction === 'Y' ? Number(item.rounding) - 1 : Number(item.rounding)
            ),
            formid: result[0]?.formid || '',
            filenames2
        };




        await this.generatePdfFirstJakarta2(pdfBody)

        try {
            await this.connect();
            const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
            const filePath = `${rootFolder}/schedule/${filenames2}`;
            if (!fs.existsSync(filePath)) {
                console.error(`Local file does not exist: ${filePath}`);
            }

            await this.upload(filePath, `/UNSIGNED/GQCINV/SCHEDULE/${filenames2}`);

        } catch (error) {
            console.log("Error during upload:.", error);
            throw new BadRequestException({
                statusCode: 400,
                message: 'Failed to upload to FTP',
                data: [error],
            });
        } finally {
            console.log("Disconnecting from FTP servers");
            await this.disconnect();
        }

    }
    async generateReferenceW(doc_no: string, debtor_acct: string, doc_date: Date, filenames2: string) {
        const docDate = moment(doc_date).format('DD MMM YYYY');
        const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_ar_ref_water_web
            WHERE debtor_acct = '${debtor_acct}' 
            and doc_date  = '${docDate}'
        `);

        const doc = new PDFDocument({ margin: 0, size: 'a4', bufferPages: true });

        const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)
        const filePath = `${rootFolder}/schedule/${filenames2}`;

        if (!fs.existsSync(`${rootFolder}/schedule`)) {
            fs.mkdirSync(`${rootFolder}/schedule`, { recursive: true });
        }
        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);
        for (let i = 0; i < result.length; i++) {
            if (i > 0) {
                doc.addPage({ size: 'a4', margin: 0 })
                console.log("added new page")
            }
            const pdfBody = {
                docNo: doc_no,
                name: result[i]?.name,
                address1: result[i]?.address1,
                address2: result[i]?.address2,
                address3: result[i]?.address3,
                postCd: result[i]?.post_cd,
                docDate: moment(result[i]?.doc_date).format('DD/MM/YYYY'),
                readDate: moment(result[i]?.read_date).format('DD/MM/YYYY'),
                startDate: moment(result[i]?.start_date).format('DD/MM/YYYY'),
                endDate: moment(result[i]?.end_date).format('DD/MM/YYYY'),
                currency: result[i]?.currency_cd,
                descs: result[i]?.descs,
                trxType: result[i]?.trx_type,
                categoryCd: result[i]?.category_cd,
                meterId: result[i]?.meter_id,
                calculationMethod: result[i]?.calculation_method,
                capacity: result[i]?.capacity,
                capacityRate: result[i]?.capacity_rate,
                currRead: result[i]?.curr_read,
                lastRead: result[i]?.last_read,
                multiplier: result[i]?.multiplier,
                usage: result[i]?.usage,
                usageRate1: result[i]?.usage_rate1,
                usage11: result[i]?.usage_11,
                currReadHigh: result[i]?.curr_read_high,
                lastReadHigh: result[i]?.last_read_high,
                highMultiplier: result[i]?.high_multiplier,
                usageHigh: result[i]?.usage_high,
                usageRate2: result[i]?.usage_rate2,
                usage21: result[i]?.usage_21,
                minimumUsage: result[i]?.minimum_usage,
                baseAmt1: result[i]?.base_amt1,
                genRate: result[i]?.gen_rate,
                genAmt1: result[i]?.gen_amt1,
                deductMarkupP: result[i]?.deduct_markup_p,
                deductMarkupN: result[i]?.deduct_markup_n,
                apportionPercent: result[i]?.apportion_percent,
                asReduction: result[i]?.as_reduction,
                trxAmt: result[i]?.trx_amt,
                rounding: result[i]?.rounding,
                currencyCd: result[i].currency_cd,
                formid: result[i]?.formid || '',
                filenames2
            };

            await this.generatePdfFirstJakarta5(doc, pdfBody)
        }

        doc.end();

        try {
            await this.connect();
            const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
            const filePath = `${rootFolder}/schedule/${filenames2}`;
            if (!fs.existsSync(filePath)) {
                console.error(`Local file does not exist: ${filePath}`);
            }

            await this.upload(filePath, `/UNSIGNED/GQCINV/SCHEDULE/${filenames2}`);

        } catch (error) {
            console.log("Error during upload:.", error);
            throw new BadRequestException({
                statusCode: 400,
                message: 'Failed to upload to FTP',
                data: [error],
            });
        }
        finally {
            console.log("Disconnecting from FTP servers");
            await this.disconnect();
        }

    }
    async generateReferenceV(doc_no: string, debtor_acct: string, doc_date: Date,
        project_no: string, entity_cd: string, filenames2: string) {
        const docDate = moment(doc_date).format('DD MMM YYYY');
        const doc = new PDFDocument({
            size: 'A4',
            margin: 0,
        });

        const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)
        const filePath = `${rootFolder}/schedule/${filenames2}`;

        if (!fs.existsSync(`${rootFolder}/schedule`)) {
            fs.mkdirSync(`${rootFolder}/schedule`, { recursive: true });
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        console.log("bill date : " + docDate)
        console.log("debtor acct : " + debtor_acct)
        const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            select * from mgr.v_ar_ref_ot_web 
            WHERE debtor_acct = '${debtor_acct}' 
            and bill_date  = '${docDate}'
            and project_no = '${project_no}'
            and entity_cd = '${entity_cd}'
            `);
        // const startDate = result.map((item: any) => moment(item.start_date).format('DD/MM/YYYY HH:mm'))
        // const endDate = result.map((item: any) => moment(item.end_date).format('DD/MM/YYYY HH:mm'))

        // console.log("start date : " + startDate)
        // console.log("end date : " + endDate)



        const pdfBody = {
            docNo: doc_no,
            name: result[0]?.name || '',
            address1: result[0]?.address1 || '',
            address2: result[0]?.address2 || '',
            address3: result[0]?.address3 || '',
            postCd: result[0]?.post_cd || '',
            remarks: result[0]?.remarks || '',
            startDate: result.map((item: any) => item.start_date),
            endDate: result.map((item: any) => item.end_date),
            currency: result[0]?.currency_cd,
            rate: result.map((item: any) => Number(item.rate)),
            amount: result.map((item: any) => Number(item.trx_amt)),
            lotNo: result.map((item: any) => String(item.lot_no)),
            startPeriod: result[0]?.start_period,
            endPeriod: result[0]?.end_period,
            formid: result[0]?.formid || '',
            filenames2
        };
        //console.log(pdfBody)

        await this.generatePdfFirstJakarta3(pdfBody)

        try {
            await this.connect();
            const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
            const filePath = `${rootFolder}/schedule/${filenames2}`;
            if (!fs.existsSync(filePath)) {
                console.error(`Local file does not exist: ${filePath}`);
            }

            await this.upload(filePath, `/UNSIGNED/GQCINV/SCHEDULE/${filenames2}`);

        } catch (error) {
            console.log("Error during upload:.", error);
            throw new BadRequestException({
                statusCode: 400,
                message: 'Failed to upload to FTP',
                data: [error],
            });
        }
        finally {
            console.log("Disconnecting from FTP servers");
            await this.disconnect();
        }

    }

    async generateReferenceE(doc_no: string, debtor_acct: string, doc_date: Date, filenames2: string) {
        const docDate = moment(doc_date).format('DD MMM YYYY');
        const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_ar_ref_elec_web
            WHERE debtor_acct = '${debtor_acct}' 
            and doc_date  = '${docDate}'
        `);

        const doc = new PDFDocument({ margin: 0, size: 'a4' });

        const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)
        const filePath = `${rootFolder}/schedule/${filenames2}`;

        if (!fs.existsSync(`${rootFolder}/schedule`)) {
            fs.mkdirSync(`${rootFolder}/schedule`, { recursive: true });
        }
        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // for (let i = 0; i < result.length; i++) {
        //     if (i > 0) {
        //         doc.addPage({ size: 'a4', margin: 0 })
        //         console.log("added new page")
        //     }
        //     const pdfBody = {
        //         docNo: doc_no,
        //         name: result[i]?.name,
        //         address1: result[i]?.address1 || '',
        //         address2: result[i]?.address2 || '',
        //         address3: result[i]?.address3 || '',
        //         postCd: result[i]?.post_cd || '',
        //         docDate: moment(result[i]?.doc_date).format('DD/MM/YYYY'),
        //         readDate: moment(result[i]?.read_date).format('DD/MM/YYYY'),
        //         startDate: moment(result[i]?.start_date).format('DD/MM/YYYY'),
        //         endDate: moment(result[i]?.end_date).format('DD/MM/YYYY'),
        //         currency: result[i]?.currency_cd,
        //         descs: result[i]?.descs,
        //         trxType: result[i]?.trx_type,
        //         categoryCd: result[i]?.category_cd,
        //         meterId: result[i]?.meter_id,
        //         calculationMethod: result[i]?.calculation_method,
        //         capacity: result[i]?.capacity,
        //         capacityRate: result[i]?.capacity_rate,
        //         currRead: result[i]?.curr_read,
        //         lastRead: result[i]?.last_read,
        //         multiplier: result[i]?.multiplier,
        //         usage: result[i]?.usage,
        //         usageRate1: result[i]?.usage_rate1,
        //         usage11: result[i]?.usage_11,
        //         currReadHigh: result[i]?.curr_read_high,
        //         lastReadHigh: result[i]?.last_read_high,
        //         highMultiplier: result[i]?.high_multiplier,
        //         usageHigh: result[i]?.usage_high,
        //         usageRate2: result[i]?.usage_rate2,
        //         usage21: result[i]?.usage_21,
        //         minimumUsage: result[i]?.minimum_usage,
        //         baseAmt1: result[i]?.base_amt1,
        //         genRate: result[i]?.gen_rate,
        //         genAmt1: result[i]?.gen_amt1,
        //         deductMarkupP: result[i]?.deduct_markup_p,
        //         deductMarkupN: result[i]?.deduct_markup_n,
        //         apportionPercent: result[i]?.apportion_percent,
        //         asReduction: result[i]?.as_reduction,
        //         trxAmt: result[i]?.trx_amt,
        //         flashHours: result[i]?.flash_hours,
        //         kwh: result[i]?.kwh,
        //         usageKwh11: result[i]?.usage_kwh_11,
        //         usageKwh21: result[i]?.usage_kwh_21,
        //         minUsageHour: result[i]?.min_usage_hour,
        //         rounding: result[i]?.rounding,
        //         formid: result[i]?.formid || '',
        //         currencyCd: result[i].currency_cd,
        //         filenames2
        //     }
        //     console.log(result[i]?.apportion_percent)
        //     this.generatePdfFirstJakarta6(doc, pdfBody)
        // }

        let isFirst = true;
        for (const item of result) {
            if (!isFirst) {
                doc.addPage({ size: 'a4', margin: 0 });
            }
            isFirst = false;
            const pdfBody = {
                docNo: doc_no,
                name: item?.name,
                address1: item?.address1 || '',
                address2: item?.address2 || '',
                address3: item?.address3 || '',
                postCd: item?.post_cd || '',
                docDate: moment(item?.doc_date).format('DD/MM/YYYY'),
                readDate: moment(item?.read_date).format('DD/MM/YYYY'),
                startDate: moment(item?.start_date).format('DD/MM/YYYY'),
                endDate: moment(item?.end_date).format('DD/MM/YYYY'),
                currency: item?.currency_cd,
                descs: item?.descs,
                trxType: item?.trx_type,
                categoryCd: item?.category_cd,
                meterId: item?.meter_id,
                calculationMethod: item?.calculation_method,
                capacity: item?.capacity,
                capacityRate: item?.capacity_rate,
                currRead: item?.curr_read,
                lastRead: item?.last_read,
                multiplier: item?.multiplier,
                usage: item?.usage,
                usageRate1: item?.usage_rate1,
                usage11: item?.usage_11,
                currReadHigh: item?.curr_read_high,
                lastReadHigh: item?.last_read_high,
                highMultiplier: item?.high_multiplier,
                usageHigh: item?.usage_high,
                usageRate2: item?.usage_rate2,
                usage21: item?.usage_21,
                minimumUsage: item?.minimum_usage,
                baseAmt1: item?.base_amt1,
                genRate: item?.gen_rate,
                genAmt1: item?.gen_amt1,
                deductMarkupP: item?.deduct_markup_p,
                deductMarkupN: item?.deduct_markup_n,
                apportionPercent: item?.apportion_percent || 0,
                asReduction: item?.as_reduction,
                trxAmt: item?.trx_amt,
                flashHours: item?.flash_hours,
                kwh: item?.kwh,
                usageKwh11: item?.usage_kwh_11,
                usageKwh21: item?.usage_kwh_21,
                minUsageHour: item?.min_usage_hour,
                rounding: item?.rounding,
                formid: item?.formid || '',
                currencyCd: item?.currency_cd,
                filenames2
            };
            this.generatePdfFirstJakarta6(doc, pdfBody);
        }

        doc.end();

        try {
            await this.connect();
            const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
            const filePath = `${rootFolder}/schedule/${filenames2}`;
            if (!fs.existsSync(filePath)) {
                console.error(`Local file does not exist: ${filePath}`);
            }

            await this.upload(filePath, `/UNSIGNED/GQCINV/SCHEDULE/${filenames2}`);

        } catch (error) {
            console.log("Error during upload:.", error);
            throw new BadRequestException({
                statusCode: 400,
                message: 'Failed to upload to FTP',
                data: [error],
            });
        }
        finally {
            console.log("Disconnecting from FTP servers");
            await this.disconnect();
        }

    }

    async generateSummaryW(
        entity_cd: string,
        project_no: string,
        debtor_acct: string,
        read_date: string,
        filenames4: string,
    ){
        console.log("inside generateSummaryW");
        console.log({
            entity_cd,
            project_no,
            debtor_acct,
            read_date,
        });
        const currentDate = moment().format("DD/MM/YYYY")
        const currentTime = moment().format("HH:mm:ss")
        
        const readDate = moment(read_date).format("MMMM YYYY")
        const doc = new PDFDocument({ margin: 0, size: 'a4', layout: 'landscape' });
        const rootFolder = path.resolve(
            __dirname,
            '..',
            '..',
            process.env.ROOT_PDF_FOLDER,
        );
        const filePath = `${rootFolder}/schedule/${filenames4}`;

        if (!fs.existsSync(`${rootFolder}/schedule`)) {
            fs.mkdirSync(`${rootFolder}/schedule`, { recursive: true });
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        const result:Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.v_ar_monthly_water_web
            WHERE entity_cd = '${entity_cd}' 
                AND project_no = '${project_no}'
                AND debtor_acct = '${debtor_acct}' 
                AND read_date = '${read_date}'
        `)
        
        console.log("summary table length : " + result.length)
        const docDate = moment(result[0].doc_date).format("MMMM YYYY")
        doc.fontSize(5)
        .text(result[0].entity_name, 30, 30, { align: 'center', width:780 })
        .text(currentDate, 30, 30, { align: 'left', width:780 })
        .text('page 1 of 1', 30, 30, { align: 'right', width:780 })
        .text('"Monthly Water Monthly List"', 30, 40, { align: 'center', width:780 })
        .text(currentTime, 30, 40, { align: 'left', width:780 })

        .text('Period', 30, 100)
        .text('Reading Period', 30, 110)
        .text('Tower / Block', 30, 120)

        .text(':', 100, 100)
        .text(':', 100, 110)
        .text(':', 100, 120)

        .text(docDate, 110, 100)
        .text(readDate, 110, 110)
        .text(result[0].project_descs, 110, 120)

        
        .text('No', 30, 150)
        .text('ID#', 55, 150)
        .text('Name', 100, 150)
        .text('Doc Date', 200, 150)
        .text('Meter ID', 245, 150)
        .text('Standing Charge', 290, 140)
        .text('/ TTLB', 300, 150)
        .text('Finish', 340, 150)
        .text('Start', 380, 150)
        .text('PF', 420, 150)
        .text('Meter', 446, 140)
        .text('Usage', 445, 150)
        .text('Rate', 485, 150)
        .text('Consumption', 520, 150)
        .text('Billing Apportionment', 580, 150)
        .text('Rounded', 658, 140)
        .text('To', 665, 150)
        .text('After Withholding', 720, 140)
        .text('Gross-Up', 730, 150)

        .rect(30, 165, 780, 1).stroke()
        let y = 180
        let totalTtlb = 0
        let totalConsumption = 0
        let totalBillingApportionment = 0
        let totalRounding = 0
        let totalTrxAmt = 0
        for (let i = 0; i < result.length; i++){
            let ttlb:any;
            let usage11:any
            let billingApportionment:any
            let rounding:any
            if(result[i].as_reduction === 'N'){
                ttlb = Number(result[i].capacity_rate).toFixed(2)
                usage11 = Number(result[i].usage_11).toFixed(2)
                billingApportionment = (
                    Number(result[i].apportion_percent) / 100
                    * (Number(result[i].base_amt1) + Number(result[i].gen_amt1))
                ).toFixed(2)
                rounding = Number(result[i].rounding).toFixed(2)
            }
            else {
                ttlb = (Number(result[i].capacity_rate) - 1).toFixed(2)
                usage11 = (Number(result[i].usage_11) - 1).toFixed(2)
                billingApportionment = (
                    Number(result[i].apportion_percent) / 100
                    * (Number(result[i].base_amt1) + Number(result[i].gen_amt1) - 1)
                ).toFixed(2)
                rounding = (Number(result[i].rounding) - 1).toFixed(2)
            }
            totalTtlb += Number(ttlb)
            totalConsumption += Number(usage11)
            totalBillingApportionment += Number(billingApportionment)
            totalRounding += Number(rounding)
            totalTrxAmt += Number(result[i].trx_amt)
            doc.text(i+1, 35, y)
            .text(debtor_acct, 50, y)
            .text(result[i].name, 80, y)
            .text(moment(result[i].doc_date).format("DD/MM/YYYY"), 200, y)
            .text(result[i].meter_id, 240, y)
            .text(ttlb, 275, y, {width: 40, align: "right"})
            .text(this.formattedNumber(result[i].curr_read), 320, y, {width: 40, align: "right"})
            .text(this.formattedNumber(result[i].last_read), 360, y, {width: 40, align: "right"})
            .text(this.formattedNumber(result[i].multiplier), 420, y)
            .text(this.formattedNumber(result[i].usage), 430, y, {width: 40, align: "right"})
            .text(this.formattedNumber(result[i].usage_rate1), 480, y)
            .text(this.formattedNumber(usage11), 510, y, {width: 40, align: "right"})
            .text(`${this.formattedNumber(result[i].apportion_percent)} % = `, 570, y)
            .text(`${this.formattedNumber(billingApportionment)}`, 600, y, {width: 40, align: "right"})
            .text(this.formattedNumber(rounding), 640, y, {width: 40, align: "right"})
            .text(`${this.formattedNumber(result[i].deduct_markup_p)} % = ${result[i].currency_cd}`, 690, y, {width: 40, align: "right"})
            .text(this.formattedNumber(result[i].trx_amt), 740, y, {width: 40, align: "right"})
            y+=15
        }
        doc.rect(30, y, 780, 1).stroke()
        y+=10
        console.log("totalTtlb : " + totalTtlb)
        console.log("totalConsumption : " + totalConsumption)
        console.log("totalBillingApportionment : " + totalBillingApportionment)
        doc.text(totalTtlb.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 280, y,{width: 40, align: "right"})
            .text(totalConsumption.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 510, y, {width: 40, align: "right"})
            .text(`${totalBillingApportionment.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 600, y, {width: 40, align: "right"})
            .text(totalRounding.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 640, y, {width: 40, align: "right"})
            .text(result[0].currency_cd, 690, y, {width: 40, align: "right"})
            .text(totalTrxAmt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 740, y, {width: 40, align: "right"})



        doc.end();

        try {
            await this.connect();
            const rootFolder = path.resolve(
                __dirname,
                '..',
                '..',
                process.env.ROOT_PDF_FOLDER,
            );
            const filePath = `${rootFolder}/schedule/${filenames4}`;
            if (!fs.existsSync(filePath)) {
                console.error(`Local file does not exist: ${filePath}`);
            }

            await this.upload(filePath, `/UNSIGNED/GQCINV/SCHEDULE/${filenames4}`);
        } catch (error) {
            console.log('Error during upload:.', error);
            throw new BadRequestException({
                statusCode: 400,
                message: 'Failed to upload to FTP',
                data: [error],
            });
        } finally {
            console.log('Disconnecting from FTP servers');
            await this.disconnect();
        }
    }

    async generateSummaryE(
        entity_cd: string,
        project_no: string,
        debtor_acct: string,
        read_date: string,
        filenames4: string,
    ){
        console.log("inside generateSummaryE");
        console.log({
            entity_cd,
            project_no,
            debtor_acct,
            read_date,
        });
        const result:Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT * FROM mgr.v_ar_monthly_elec_web
                WHERE entity_cd = '${entity_cd}' 
                    AND project_no = '${project_no}'
                    AND debtor_acct = '${debtor_acct}' 
                    AND read_date = '${read_date}'
            `)
        const currentDate = moment().format("DD/MM/YYYY")
        const currentTime = moment().format("HH:mm:ss")
        const docDate = moment(result[0].doc_date).format("MMMM YYYY")
        const readDate = moment(read_date).format("MMMM YYYY")
        console.log("summary table length : " + result.length)

        const doc = new PDFDocument({ margin: 0, size: 'a4', layout: 'landscape' });
        const rootFolder = path.resolve(
            __dirname,
            '..',
            '..',
            process.env.ROOT_PDF_FOLDER,
        );
        const filePath = `${rootFolder}/schedule/${filenames4}`;

        if (!fs.existsSync(`${rootFolder}/schedule`)) {
            fs.mkdirSync(`${rootFolder}/schedule`, { recursive: true });
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        doc.fontSize(5)
        .text(result[0].entity_name, 30, 30, { align: 'center', width:780 })
        .text(currentDate, 30, 30, { align: 'left', width:780 })
        .text('page 1 of 1', 30, 30, { align: 'right', width:780 })
        .text('"Monthly Water Monthly List"', 30, 40, { align: 'center', width:780 })
        .text(currentTime, 30, 40, { align: 'left', width:780 })

        .text('Period', 30, 100)
        .text('Reading Period', 30, 110)
        .text('Tower / Block', 30, 120)

        .text(':', 100, 100)
        .text(':', 100, 110)
        .text(':', 100, 120)

        .text(docDate, 110, 100)
        .text(readDate, 110, 110)
        .text(result[0].project_descs, 110, 120)

        
        .text('No', 30, 150)
        .text('ID#', 55, 150)
        .text('Name', 100, 150)
        .text('Doc Date', 200, 150)
        .text('Meter ID', 245, 150)
        .text('Standing Charge', 290, 140)
        .text('/ TTLB', 300, 150)
        .text('Finish', 340, 150)
        .text('Start', 380, 150)
        .text('PF', 420, 150)
        .text('Meter', 446, 140)
        .text('Usage', 445, 150)
        .text('Rate', 485, 150)
        .text('Consumption', 520, 150)
        .text('Billing Apportionment', 580, 150)
        .text('Rounded', 658, 140)
        .text('To', 665, 150)
        .text('After Withholding', 720, 140)
        .text('Gross-Up', 730, 150)

        .rect(30, 165, 780, 1).stroke()
        let y = 180
        let totalTtlb = 0
        let totalConsumption = 0
        let totalBillingApportionment = 0
        let totalRounding = 0
        let totalTrxAmt = 0
        for (let i = 0; i < result.length; i++){
            let ttlb:any;
            let usage11:any
            let billingApportionment:any
            let rounding:any
            if(result[i].as_reduction === 'N'){
                ttlb = Number(result[i].capacity_rate).toFixed(2)
                usage11 = Number(result[i].usage_11).toFixed(2)
                billingApportionment = (
                    Number(result[i].apportion_percent) / 100
                    * (Number(result[i].base_amt1) + Number(result[i].gen_amt1))
                ).toFixed(2)
                rounding = Number(result[i].rounding).toFixed(2)
            }
            else {
                ttlb = (Number(result[i].capacity_rate) - 1).toFixed(2)
                usage11 = (Number(result[i].usage_11) - 1).toFixed(2)
                billingApportionment = (
                    Number(result[i].apportion_percent) / 100
                    * (Number(result[i].base_amt1) + Number(result[i].gen_amt1) - 1)
                ).toFixed(2)
                rounding = (Number(result[i].rounding) - 1).toFixed(2)
            }
            totalTtlb += Number(ttlb)
            totalConsumption += Number(usage11)
            totalBillingApportionment += Number(billingApportionment)
            totalRounding += Number(rounding)
            totalTrxAmt += Number(result[i].trx_amt)
            doc.text(i+1, 35, y)
                .text(debtor_acct, 50, y)
                .text(result[i].name, 80, y)
                .text(moment(result[i].doc_date).format("DD/MM/YYYY"), 200, y)
                .text(result[i].meter_id, 240, y)
                .text(ttlb, 275, y, {width: 40, align: "right"})
                .text(this.formattedNumber(result[i].curr_read), 320, y, {width: 40, align: "right"})
                .text(this.formattedNumber(result[i].last_read), 360, y, {width: 40, align: "right"})
                .text(this.formattedNumber(result[i].multiplier), 420, y)
                .text(this.formattedNumber(result[i].usage), 430, y, {width: 40, align: "right"})
                .text(this.formattedNumber(result[i].usage_rate1), 480, y)
                .text(this.formattedNumber(usage11), 510, y, {width: 40, align: "right"})
                .text(`${this.formattedNumber(result[i].apportion_percent)} % = `, 570, y)
                .text(`${this.formattedNumber(billingApportionment)}`, 600, y, {width: 40, align: "right"})
                .text(this.formattedNumber(rounding), 640, y, {width: 40, align: "right"})
                .text(`${this.formattedNumber(result[i].deduct_markup_p)} % = ${result[i].currency_cd}`, 690, y, {width: 40, align: "right"})
                .text(this.formattedNumber(result[i].trx_amt), 740, y, {width: 40, align: "right"})
            y+=15
        }
        doc.rect(30, y, 780, 1).stroke()
        y+=10
        console.log("totalTtlb : " + totalTtlb)
        console.log("totalConsumption : " + totalConsumption)
        console.log("totalBillingApportionment : " + totalBillingApportionment)
        doc.text(totalTtlb.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 280, y,{width: 40, align: "right"})
            .text(totalConsumption.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 510, y, {width: 40, align: "right"})
            .text(`${totalBillingApportionment.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 600, y, {width: 40, align: "right"})
            .text(totalRounding.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 640, y, {width: 40, align: "right"})
            .text(result[0].currency_cd, 690, y, {width: 40, align: "right"})
            .text(totalTrxAmt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 740, y, {width: 40, align: "right"})



        doc.end();

        try {
            await this.connect();
            const rootFolder = path.resolve(
                __dirname,
                '..',
                '..',
                process.env.ROOT_PDF_FOLDER,
            );
            const filePath = `${rootFolder}/schedule/${filenames4}`;
            if (!fs.existsSync(filePath)) {
                console.error(`Local file does not exist: ${filePath}`);
            }

            await this.upload(filePath, `/UNSIGNED/GQCINV/SCHEDULE/${filenames4}`);
        } catch (error) {
            console.log('Error during upload:.', error);
            throw new BadRequestException({
                statusCode: 400,
                message: 'Failed to upload to FTP',
                data: [error],
            });
        } finally {
            console.log('Disconnecting from FTP servers');
            await this.disconnect();
        }
    }


    formattedNumber(string:string){
        return Number(string).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
        const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)
        const imagePath = path.resolve(__dirname, '../../public/images/first-jakarta-logo.png');
        doc.image(imagePath, 15, 25, { width: 40, height: 45 })
        doc.fontSize(12)
            .font('Times-Bold').text("PT FIRST JAKARTA INTERNATIONAL", 60, 32)
            .fontSize(8).font('Times-Roman')
            .text("Indonesia Stock Exchange Building Tower 2, 30th floor, SCBD", 60, 46)
            .text("Jl. Jend. Sudirman Kav. 52-53 Jakarta 12190", 60, 54)
            .text("Tel. (021) 515 1515 (Hunting) Fax : (021) 515 3008", 60, 62)

        //header tengah

        const cushmanPath = path.resolve(__dirname, '../../public/images/cushman-and-wakefield.png');
        doc.image(`images/cushman-and-wakefield-logo.png`, 280, 44, { width: 100, heigth: 30 })
        doc.fontSize(5)
            .text('Property Management', 280, 35, { width: 100, align: 'center' })

        //header kanan
        doc.roundedRect(385, 32, 200, 80, 20).stroke()
        doc.font('Times-Roman').fontSize(9)
            .text('TO :', 395, 40)
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
        doc.fontSize(11).text('xxxxx', 72, 220)
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
        }
        doc.fontSize(9)
            .text('Any objection to this invoice should be submitted within 7 days after the date of the invoice received', 35, tableYStart + 200)
            .text('(Pengajuan keberatan terhadap invoice ini dilakukan paling lambat 7 hari sejak tanggal invoice diterima)', 35, tableYStart + 210)

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

        if (data.currency_cd == "RP") {
            doc.fontSize(10).text(`Indonesian Rupiah ${this.numberToWords(total)} only`, 210, tableYStart + 265, { width: 365 })
        }

        else if (data.currency_cd == "USD") {
            doc.fontSize(10).text(`United States Dollar ${this.numberToWords(total)} only`, 210, tableYStart + 265, { width: 365 })
        }
        doc.fontSize(9).font('Times-Roman')
            .text('- Payment should be made to the form of the crossed cheque (Giro) payable to', 35, tableYStart + 295)
            .text('or transfer to our acount : ', 39, tableYStart + 305)
            //.text('- Please attach the PAYMENT ADVICE SLIP together with yout payment and sent to the Building Management Office', 35, tableYStart + 330)
            .text('- Receipt will be given after payment', 35, tableYStart + 340)
            .fontSize(10).font('Times-Bold')
            .text('PT. First Jakarta International', 325, tableYStart + 295)
            .text(`- ${data.bankNameRp} (IDR)   ${data.acctRp}`, 140, tableYStart + 305)
            .text(`- ${data.bankNameUsd} (USD)   ${data.acctUsd}`, 140, tableYStart + 318)
            // .text(`${data.acctRp}`, 300, tableYStart + 305)
            // .text(`${data.acctUsd}`, 300, tableYStart + 318)
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
        const filePathPublic = `http://192.168.0.212:3001/first_jakarta_2_${data.docNo}.pdf`;

        const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
        const filePath = `${rootFolder}/schedule/${data.filenames2}`;

        if (!fs.existsSync(`${rootFolder}/schedule`)) {
            fs.mkdirSync(`${rootFolder}/schedule`, { recursive: true });
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // --- Header Section (Company, Recipient, etc.) ---
        doc.font('Times-Roman').fontSize(12)
            .text('PT First Jakarta International', 0, 20, { align: 'center' })
            .text('Indonesia Stock Exchange Building, Lot 2 (SCBD)', { align: 'center' })
            .text('Jl. Jend Sudirman kav 52-53', { align: 'center' })
            .text('Jakarta 12190 - Indonesia', { align: 'center' });

        doc.rect(10, 80, 550, 1).stroke();
        doc.fontSize(10)
            .text('TO : ', 20, 90)
            .text(`${data.name}`, 20, 90, { indent: 20 })
            .text(`${data.address1}`, { indent: 20 })
            .text(`${data.address2}`, { indent: 20 })
            .text(`${data.address3} ${data.postCd}`, { indent: 20 });
        doc.rect(10, 150, 550, 1).stroke();

        doc.fontSize(12).font('Times-Bold')
            .text('CHILLED WATER FCU CHARGE CALCULATION', 0, 170, { align: 'center', underline: true });

        // Calculations
        const totalHours = data.currRead.map((curr, idx) => curr - data.lastRead[idx]);
        const totalTotalHours = totalHours.reduce((sum, hours) => sum + hours, 0).toFixed(2);

        const formattedCapacity = data.capacity.map(cap => cap.toLocaleString('id-ID', { minimumFractionDigits: 2 }));
        const totalCapacity = data.capacity.reduce((sum, cap) => sum + cap, 0)
            .toLocaleString('id-ID', { minimumFractionDigits: 2 });

        const totalMultiplier = data.multiplier.reduce((sum, mul) => sum + mul, 0).toFixed(2);

        const formattedUsageRate = data.usageRate.map(rate => rate.toLocaleString('id-ID', { minimumFractionDigits: 2 }));
        const formattedApportionPercent = data.apportionPercent.map(percent => `${percent.toFixed(2)}%`);

        const billingTotal = data.billingAmount.reduce((sum, amount) => sum + amount, 0)
            .toLocaleString('id-ID', { minimumFractionDigits: 2 });
        const roundedTo = data.roundingAmount.map(amount => amount.toLocaleString('id-ID', { minimumFractionDigits: 2 }));
        const totalRoundedTo = data.billingAmount.reduce((sum, amount) => sum + Math.round(amount), 0)
            .toLocaleString('id-ID', { minimumFractionDigits: 2 });
        const rawTotalRoundedTo = data.billingAmount.reduce((sum, amount) => sum + Math.round(amount), 0);

        // First and Last Meter ID
        const firstMeterId = data.meterId[0];
        const lastMeterId = data.meterId[data.meterId.length - 1];

        const period = moment(data.docDate).format('MMMM YYYY');
        doc.fontSize(10).font('Times-Roman')
            .text(`Hourly Basis Chilled Water, Fan Coil Unit (FCU) No : ${firstMeterId} tp ${lastMeterId}`, 10, 200)
            .text(`Period : ${period}`, 10, 215);

        // --- Table Header Setup ---
        let tableYStart = 250;
        let textYStart = 257;
        // Define reserved space at bottom for totals/disclaimer
        const reservedBottomSpace = 150;
        const pageHeight = doc.page.height; // e.g. 842 for A4

        // Draw the table header (rectangles and text)
        doc.rect(100, tableYStart - 20, 150, 20);
        doc.rect(10, tableYStart, 20, 20);
        doc.rect(30, tableYStart, 70, 20);
        doc.rect(100, tableYStart, 50, 20);
        doc.rect(150, tableYStart, 50, 20);
        doc.rect(200, tableYStart, 50, 20);
        doc.rect(250, tableYStart, 60, 20);
        doc.rect(310, tableYStart, 30, 20);
        doc.rect(340, tableYStart, 40, 20);
        doc.rect(380, tableYStart, 100, 20);
        doc.rect(480, tableYStart, 70, 20).stroke();
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
            .text(`Rounded to`, 480, textYStart, { align: 'center', width: 70 });
        tableYStart += 20;
        textYStart += 20;

        // --- Table Rows (with page break if too close to bottom) ---
        for (let idx = 0; idx < data.meterId.length; idx++) {
            // Check if the next row will be too close to the bottom.
            if (textYStart + 20 > pageHeight - reservedBottomSpace) {
                // Instead of drawing an empty row, just add a new page.
                doc.addPage({ size: 'a4', margin: 0 });
                // Reset y positions for the new page (adjust as desired)
                tableYStart = 50;
                textYStart = 57;
                // Re-draw table header on the new page:
                doc.rect(100, tableYStart - 20, 150, 20);
                doc.rect(10, tableYStart, 20, 20);
                doc.rect(30, tableYStart, 70, 20);
                doc.rect(100, tableYStart, 50, 20);
                doc.rect(150, tableYStart, 50, 20);
                doc.rect(200, tableYStart, 50, 20);
                doc.rect(250, tableYStart, 60, 20);
                doc.rect(310, tableYStart, 30, 20);
                doc.rect(340, tableYStart, 40, 20);
                doc.rect(380, tableYStart, 100, 20);
                doc.rect(480, tableYStart, 70, 20).stroke();
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
                    .text(`Rounded to`, 480, textYStart, { align: 'center', width: 70 });
                tableYStart += 20;
                textYStart += 20;
            }

            // Draw the row rectangles
            doc.rect(10, tableYStart, 20, 20);
            doc.rect(30, tableYStart, 70, 20);
            doc.rect(100, tableYStart, 50, 20);
            doc.rect(150, tableYStart, 50, 20);
            doc.rect(200, tableYStart, 50, 20);
            doc.rect(250, tableYStart, 60, 20);
            doc.rect(310, tableYStart, 30, 20);
            doc.rect(340, tableYStart, 40, 20);
            doc.rect(380, tableYStart, 100, 20);
            doc.rect(480, tableYStart, 70, 20).stroke();

            // Draw the row text
            doc.fontSize(8)
                .text(idx + 1, 10, textYStart, { align: 'center', width: 20 })
                .text(`${data.meterId[idx]}`, 35, textYStart, { align: 'left', width: 70 })
                .text(`${data.lastRead[idx]}`, 105, textYStart, { align: 'right', width: 40 })
                .text(`${data.currRead[idx]}`, 155, textYStart, { align: 'right', width: 40 })
                .text(`${totalHours[idx].toFixed(2)}`, 205, textYStart, { align: 'right', width: 40 })
                .text(`${formattedCapacity[idx]}`, 255, textYStart, { align: 'right', width: 50 })
                .text(`${data.multiplier[idx].toFixed(2)}`, 315, textYStart, { align: 'right', width: 20 })
                .text(`${formattedUsageRate[idx]}`, 340, textYStart, { align: 'center', width: 40 })
                .text(`${formattedApportionPercent[idx]}`, 385, textYStart, { align: 'left', width: 90 })
                .text(`${data.billingAmount[idx].toLocaleString('id-ID', { minimumFractionDigits: 2 })}`, 385, textYStart, { align: 'right', width: 90 })
                .text(`RP`, 485, textYStart, { align: 'left', width: 60 })
                .text(`${roundedTo[idx]}`, 485, textYStart, { align: 'right', width: 60 });

            tableYStart += 20;
            textYStart += 20;
        }

        // --- Totals Section (only on the last page) ---
        // If there isn’t enough room for totals, add a new page.
        if (textYStart + 40 > pageHeight - reservedBottomSpace) {
            doc.addPage({ size: 'a4', margin: 0 });
            tableYStart = 50;
            textYStart = 57;
        }
        doc.rect(10, tableYStart, 190, 20)
            .rect(200, tableYStart, 50, 20)
            .rect(250, tableYStart, 60, 20)
            .rect(310, tableYStart, 30, 20)
            .rect(340, tableYStart, 40, 20)
            .rect(380, tableYStart, 100, 20)
            .rect(480, tableYStart, 70, 20).stroke();

        doc.fontSize(8)
            .text(`Total`, 10, textYStart, { align: 'center', width: 70 })
            .text(totalTotalHours, 205, textYStart, { align: 'right', width: 40 })
            .text(totalCapacity, 255, textYStart, { align: 'right', width: 50 })
            .text(totalMultiplier, 315, textYStart, { align: 'right', width: 20 })
            .text(billingTotal, 385, textYStart, { align: 'right', width: 90 })
            .text(totalRoundedTo, 485, textYStart, { align: 'right', width: 60 });

        doc.fontSize(10)
            .text('In Words : ', 10, textYStart + 20);
        if (data.currencyCd === "RP") {
            doc.text(`Indonesian Rupiah ${this.numberToWords(rawTotalRoundedTo)} only`, { indent: 15, width: 400 });
        } else if (data.currencyCd === "USD") {
            doc.text(`United States Dollar ${this.numberToWords(rawTotalRoundedTo)} only`, { indent: 15, width: 400 });
        }

        doc.rect(10, tableYStart + 70, 550, 1).stroke()
            .text(`${data.formid}`, 0, 800, { width: 550, align: 'right' })
            .fontSize(9)
            .text('Note : This letter is an explanation of the Chilled Water, FCU calculation for Debit/Credit Note', 10, tableYStart + 85);

        doc.fontSize(8).font('Times-Bold')
            .text('Disclaimer : ', 225, tableYStart + 150)
            .font('Times-Italic')
            .text('This document does not need to be signed', 270, tableYStart + 150);

        doc.end();

        return {
            statusCode: 201,
            message: "invoice created",
            data: filePathPublic
        };
    }


    async generatePdfFirstJakarta3(data: Record<any, any>) {
        const doc = new PDFDocument({ margin: 0, size: 'a4', bufferPages: true });
        const filePathPublic = `http://192.168.0.212:3001/first_jakarta_2_${data.docNo}.pdf`;

        const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
        const filePath = `${rootFolder}/schedule/${data.filenames2}`;

        if (!fs.existsSync(`${rootFolder}/schedule`)) {
            fs.mkdirSync(`${rootFolder}/schedule`, { recursive: true });
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        let pageCount = 1

        // --- FIRST PAGE HEADER (only appears on first page) ---
        doc.font('Times-Roman').fontSize(12)
            .text('PT First Jakarta International', 0, 20, { align: 'center' })
            .text('Indonesia Stock Exchange Building, Lot 2 (SCBD)', { align: 'center' })
            .text('Jl. Jend Sudirman kav 52-53', { align: 'center' })
            .text('Jakarta 12190 - Indonesia', { align: 'center' })
            .text('Tel No : 5151515 Fax No : 5150909', { align: 'center' });

        // Draw a line for separation
        doc.rect(10, 90, 550, 1).stroke();

        // Recipient details
        doc.fontSize(10)
            .text('TO : ', 42, 110)
            .text(`${data.name}`, 42, 110, { indent: 29 })
            .text(`${data.address1}`, { indent: 29 })
            .text(`${data.address2}`, { indent: 29 })
            .text(`${data.address3} ${data.postCd}`, { indent: 29 })
            .text(`Remarks : `, 20, 180)
            .text(`${data.remarks}`, 70, 180);

        // Table title on first page (do not add page numbering here)
        doc.font('Times-Bold').fontSize(11)
            .text('CALCULATION OF OVERTIME', 20, 210, { align: 'left', width: 550 });

        // Starting coordinates for table (first page)
        let tableYStart = 250;
        let textYStart = 257;

        // Define reserved space at the bottom of each page for disclaimer/formid.
        const reservedBottomSpace = 100; // adjust as needed
        const pageHeight = doc.page.height; // usually 842 for A4

        // Draw header line for table columns on first page
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

        // Draw a line after the header
        doc.rect(10, tableYStart, 550, 1).stroke();

        let totalTimeConsumptionInMinutes = 0;
        let totalEquivalentHour = 0;
        let totalAmount = 0;

        const dbTimeResult: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT GETDATE() AS currentTime
        `);
        const dbTime = moment(dbTimeResult[0].currentTime);
        const localTime = moment();
        const offsetHours = dbTime.diff(localTime, 'hours');
        console.log("time difference : " + offsetHours);

        // Loop through each data row
        for (let idx = 0; idx < data.startDate.length; idx++) {
            // Before drawing the next row, check if there is enough space.
            // Each row is assumed to take about 20 points.
            if (textYStart + 20 > pageHeight - reservedBottomSpace) {
                // Draw bottom line for table on current page
                doc.rect(10, tableYStart, 550, 1).stroke();

                // Add a new page (no header on these pages)
                doc.addPage({ size: 'a4', margin: 0 })
                    .font('Times-Bold').fontSize(11)
                    .text('CALCULATION OF OVERTIME', 20, 50, { align: 'left', width: 550 });

                pageCount++
                // Reset y positions for the new page (you set these positions as desired)
                tableYStart = 90;
                textYStart = 97;

                // Redraw table header on the new page:
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
                // Draw a line after the header on the new page.
                doc.rect(10, tableYStart, 550, 1).stroke();
            }

            const start = moment(data.startDate[idx]).subtract(offsetHours, 'hours');
            const end = moment(data.endDate[idx]).subtract(offsetHours, 'hours');

            const diffInMinutes = end.diff(start, 'minutes');
            const timeConsumption = `${Math.floor(diffInMinutes / 60)}:${(diffInMinutes % 60).toString().padStart(2, '0')}`;
            const equivalentHour = parseFloat((diffInMinutes / 60).toFixed(2));

            const rate = data.rate[idx];
            const amount = data.amount[idx];
            totalTimeConsumptionInMinutes += diffInMinutes;
            totalEquivalentHour += equivalentHour;
            totalAmount += amount;

            // Draw the row
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
        }

        // Draw bottom line for table on current (final) page
        doc.rect(10, tableYStart, 550, 1).stroke();

        // Calculate totals
        const totalHours = `${Math.floor(totalTimeConsumptionInMinutes / 60)}:${totalTimeConsumptionInMinutes % 60}`;
        const totalEquivalentHourFormatted = totalEquivalentHour.toFixed(2);
        const totalAmountFormatted = totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // Add totals row
        doc.fontSize(8).font('Times-Roman')
            .text(totalHours, 175, textYStart, { align: 'center', width: 55 })
            .text(totalEquivalentHourFormatted, 230, textYStart, { align: 'center', width: 45 })
            .text(data.currency, 340, textYStart, { align: 'center', width: 50 })
            .text(totalAmountFormatted, 390, textYStart, { align: 'right', width: 70 });

        // Add period text and amount in words on the final page
        doc.fontSize(10)
            .text(`Periode Date ${moment(data.startPeriod).format('DD/MM/YYYY')} to ${moment(data.endPeriod).format('DD/MM/YYYY')}`, 20, textYStart + 20);

        if (data.currency === "RP") {
            doc.text(`In Words : Indonesian Rupiah ${this.numberToWords(parseFloat(totalAmount.toFixed(2)))} only`, 20, textYStart + 40, { width: 365 });
        } else if (data.currency === "USD") {
            doc.text(`In Words : United States Dollar ${this.numberToWords(parseFloat(totalAmount.toFixed(2)))} only`, 20, textYStart + 40, { width: 365 });
        }

        // Ensure formid is always at y=800 on the final page.
        if (800 < textYStart + reservedBottomSpace) {
            doc.addPage({ size: 'a4', margin: 0 });
        }
        // Place formid at y = 800
        doc.fontSize(9)
            .text(`${data.formid}`, 0, 800, { width: 550, align: 'right' });

        // Add disclaimer on the final page at textYStart + 90.
        doc.fontSize(8).font('Times-Bold')
            .text('Disclaimer : ', 225, textYStart + 90)
            .font('Times-Italic')
            .text('This document does not need to be signed', 270, textYStart + 90);

        // for (let i = 0; i < pageCount; i++) {
        //     console.log("page : " + i)
        //     doc.switchToPage(i);
        //     doc.font('Times-Bold').fontSize(11)
        //         .text(`Page ${i + 1} of ${pageCount}`, 20, 210, { align: 'right', width: 550 });
        // }


        const pageRange = doc.bufferedPageRange();
        for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
            console.log(pageRange)
            doc.switchToPage(i);
            if (i - pageRange.start + 1 == 1) {
                doc.font('Times-Bold').fontSize(11)
                    .text(`Page ${i - pageRange.start + 1} of ${pageRange.count}`, 20, 210, { align: 'right', width: 550 });
            } else {
                doc.font('Times-Bold').fontSize(11)
                    .text(`Page ${i - pageRange.start + 1} of ${pageRange.count}`, 20, 50, { align: 'right', width: 550 });
            }
        }



        doc.end();

        console.log(totalAmount);

        return {
            statusCode: 201,
            message: "invoice created",
            data: filePathPublic
        };
    }

    async generatePdfFirstJakarta4(data: Record<any, any>) {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 0,
        });

        const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)
        const filePath = `${rootFolder}/proforma/${data.fileName}`;

        if (!fs.existsSync(`${rootFolder}/proforma}`)) {
            fs.mkdirSync(`${rootFolder}/proforma`, { recursive: true });
        }

        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        //header kiri
        // doc
        //     .fontSize(10)
        //     .font('Times-Bold').text("PT. FIRST JAKARTA INTERNATIONAL", 20, 30)
        //     .moveDown()
        //     .fontSize(9).font('Times-Roman')
        //     .text("Sudirman Central Business District", 20)
        //     .text("Jl. Jend. Sudirman Kav. 52-53 Jakarta 12190", 20)
        //     .text("Jakarta 12190, Indonesia", 20)
        //     .text("Telp. (021) 515 1515  Fax : (021) 515 3008", 20)

        const imagePath = path.resolve(__dirname, '../../public/images/first-jakarta-logo.png');
        doc.image(imagePath, 15, 25, { width: 40, height: 45 })
        doc.fontSize(12)
            .font('Times-Bold').text("PT FIRST JAKARTA INTERNATIONAL", 60, 32)
            .fontSize(8).font('Times-Roman')
            .text("Indonesia Stock Exchange Building Tower 2, 30th floor, SCBD", 60, 46)
            .text("Jl. Jend. Sudirman Kav. 52-53 Jakarta 12190", 60, 54)
            .text("Tel. (021) 515 1515 (Hunting) Fax : (021) 515 3008", 60, 62)



        //header kanan
        doc.rect(300, 30, 260, 80).stroke()
        doc.font('Times-Roman').fontSize(10)
            .text('TO :', 305, 40)
        if (data.tradeName !== "") {
            doc.font('Times-Bold').text(data.tradeName, { width: 260 })
        }
        else {
            doc.text(data.debtorName, { width: 260 })
        }
        doc.moveDown()
            .font('Times-Roman')
            .text(data.address1, { width: 260 })
            .text(data.address2, { width: 260 })
            .text(`${data.address3}`, { width: 200 })

        const docDate = moment(data.docDate).format('DD/MM/YYYY')
        const dueDate = moment(data.dueDate).format('DD/MM/YYYY')
        doc
            .text('No', 400, 130, { lineGap: 2 }).text('Date', { lineGap: 2 }).text('Due Date')
            .text(':', 450, 130, { lineGap: 2 }).text(':', { lineGap: 2 }).text(':')
            .text(data.docNo, 470, 130, { lineGap: 2 }).text(docDate, { lineGap: 2 }).text(dueDate)


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
        let startDate = ''
        let endDate = ''
        if (data.startDate !== undefined && data.startDate !== null) {
            console.log("valid date : " + data.startDate)
            startDate = moment(data.startDate).format('DD/MM/YYYY')
        }
        if (data.endDate !== undefined && data.endDate !== null) {
            endDate = moment(data.endDate).format('DD/MM/YYYY')
        }
        doc
            .text('Description', 20, 240, { width: 340, align: 'center' })
            .text('Amount', 360, 240, { width: 200, align: 'center' })
            .text(`Charge Name : `, 30, 270).moveDown()
            .text('Period :', 30, 290, { lineGap: 5 }).text('VAT : ', 30, 305)
            .text(data.taxDesc, 100, 270).moveDown()
            .text(`${startDate} - ${endDate}`, 100, 290, { lineGap: 2 }).text(`${data.taxRate} %`, 100, 305)
            .text('Amount Should be paid', 210, 365)
        doc
            .text(data.currencyCd, 368, 270)
            .text(data.currencyCd, 368, 310)
            .text(data.currencyCd, 368, 368)
            .text(data.currencyCd, 368, 430)
            .text(data.currencyCd, 368, 470)

        const baseAmount = Number(data.baseAmount)
        const taxAmount = Number(data.taxAmount)
        const docAmt = Number(data.docAmount)
        const formattedBaseAmount = (baseAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const formattedTaxAmount = (taxAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const formattedTotal = (docAmt).toLocaleString('en-US', { minimumFractionDigits: 2 })

        doc.text(formattedBaseAmount, 460, 270)
            .text(formattedTaxAmount, 460, 310)
            .text(formattedTotal, 460, 368)
            .text('Total Transfer', 440, 394)
            .text(formattedTotal, 460, 430)
            .text(formattedTotal, 460, 470)

        doc.text('Please Transfer the amount to our account at :', 30, 400, { underline: true })
            .text(`${data.bankNameRp}   ${data.acctRp}`, 30, 430)
            //.text(`${data.acctRp}`, 190, 430)
            .text(`TOTAL`, 310, 470)
        if (data.bankNameUsd !== "" && data.acctUsd !== "") {
            doc.text(`${data.bankNameUsd}   ${data.acctUsd}`, 30, 470)
            //.text(`${data.acctUsd}`, 190, 470)
        }

        doc.text('Payment should be made to the form of crossed cheque or giro payable to', 30, 510)
            .font('Times-Bold').text('PT. FIRST JAKARTA INTERNATIONAL')
            .font('Times-Roman').text('or transfer to the above account bank', 240, 521)
            .text('We will send the original debit note after we received your payment', 30, 545)
            .text('Please call us if you have any question')

        doc.font('Times-Bold').fontSize(10)
            .text('PT. FIRST JAKARTA INTERNATIONAL', 370, 590)
            .text('Authorized Officer', { width: 190, align: 'center' })
            .font('Times-Roman').fontSize(9)
            .moveDown()
            .moveDown()
            .moveDown()
        // if (data.docAmount >= 5000000 || (data.currencyCd == "USD" && data.docAmount >= 300)) {
        //     doc.text('E-meterai', { width: 190, align: 'center' })
        // }
        doc.moveDown()
            .moveDown()
            .moveDown()
            .moveDown()
            .text(data.signature, { width: 290, align: 'center' })


        doc.fontSize(8).font('Times-Bold')
            .text('Disclaimer : ', 225, 700)
            .font('Times-Italic')
            .text('This document does not need to be signed', 270, 700)
        doc.end();

        return ({
            statusCode: 201,
            message: "invoice created",
            data: filePath
        })
    }

    async generatePdfFirstJakarta5(doc, data: Record<any, any>) {

        doc.font('Times-Roman').fontSize(12)
            .text('PT First Jakarta International', 0, 20, { align: 'center' })
            .text('Indonesia Stock Exchange Building, Lot 2 (SCBD)', { align: 'center' })
            .text('Jl. Jend Sudirman kav 52-53', { align: 'center' })
            .text('Jakarta 12190 - Indonesia', { align: 'center' })
            .text('Tel No : 5151515 Fax No : 5150909', { align: 'center' })

        console.log("5")
        doc.rect(20, 90, 550, 1).stroke()
        doc.fontSize(10)
            .text('TO : ', 42, 110)
            .text(`${data.name}`, 42, 110, { indent: 29 })
            .text(`${data.address1}`, { indent: 29 })
            .text(`${data.address2}`, { indent: 29 })
            .text(`${data.address3} ${data.postCd}`, { indent: 29 })

        doc.fontSize(11)
            .text('CALCULATION OF WATER', 20, 180, { align: 'left', width: 550 })

        doc.rect(20, 200, 550, 1).stroke()
            .fontSize(9)
            .text(`Reference No : ${data.meterId}`, 20, 210)
            .text(`${data.descs}`, 20, 250)


            .text(`Doc Date`, 350, 210)
            .text(`:`, 450, 210)
            .text(`${data.docDate}`, 470, 210)
            .text(`Meter Read Date`, 350, 230)
            .text(`:`, 450, 230)
            .text(`${data.readDate}`, 470, 230)
            .text(`Periode`, 350, 250)
            .text(`:`, 450, 250)
            .text(`${data.startDate} - ${data.endDate}`, 470, 250)

        doc.rect(20, 270, 550, 1).stroke()



        const currRead = Number(data.currRead).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const lastRead = Number(data.lastRead).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const currReadHigh = Number(data.currReadHigh).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const lastReadHigh = Number(data.lastReadHigh).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const multiplier = Number(data.multiplier).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const rate = Number(data.usageRate1).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const rate2 = Number(data.usageRate2).toLocaleString('en-US', { minimumFractionDigits: 2 })
        let reduction = 0
        if (data.asReduction === 'Y') {
            reduction = 1
        }

        console.log("usage11 : " + data.usage11)
        console.log("usage21 : " + data.usage21)
        const rawSubtotal = Number(data.usage11) + Number(data.usage21) - Number(reduction)
        const subtotal = (rawSubtotal).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const rawSubTotalTimesApportion = rawSubtotal * data.apportionPercent / 100
        const subTotalTimesApportion = (rawSubTotalTimesApportion).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const rounding = (Number(data.rounding)).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const apportionPercent = data.apportionPercent.toFixed(2)
        const rawRoundingReduction = data.rounding - rawSubTotalTimesApportion
        const roundingReduction = rawRoundingReduction.toLocaleString('en-US', { minimumFractionDigits: 2 })
        const inWords = this.numberToWords(Number(data.rounding))
        if (data.calculationMethod === 3) {
            doc
                .text('Consumption Charge 2', 20, 320)
                .text('=', 100, 320)
                .text('(Final Position LWBP - Starting Position LWBP) x Multiplier x Rate', 120, 290)
                .text(`(${currRead} - ${lastRead}) x ${multiplier} x RP ${rate}`, 120, 300)
                .text('(Final Position WBP - Starting Position WBP) x Multiplier x Rate', 120, 320)
                .text(`(${currReadHigh} - ${lastReadHigh}) x ${multiplier} x RP ${rate2}`, 120, 330)

        } else {
            doc.text('(Final Position - Starting Position) x Multiplier x Rate', 120, 290)
        }
        doc.text('Consumption Charge', 20, 290)
            .text('=', 100, 290)
            .text('Proportion Billing', 20, 350)
            .text('Rounding', 20, 365)
            .text('=', 100, 350)
            .text(`(${currRead} - ${lastRead}) x ${multiplier} x RP ${rate}`, 120, 300)
            .text(` =  RP`, 400, 300)
            .text(`${subtotal}`, 400, 300, { width: 170, align: 'right' })
            .rect(390, 320, 180, 1).stroke()
            .text(` =  RP`, 400, 330)
            .text(`${subtotal}`, 400, 330, { width: 170, align: 'right' })
            .text(` =  RP`, 400, 350)
            .text(`${subTotalTimesApportion}`, 400, 350, { width: 170, align: 'right' })
            .text(` =  RP`, 400, 365)
            .text(`${roundingReduction}`, 400, 365, { width: 170, align: 'right' })
            .rect(390, 378, 180, 1).stroke()
            .text('Subtotal', 300, 330, { align: 'right', width: 80 })
            .text(`${apportionPercent}%`, 300, 350, { align: 'right', width: 80 })

            .font('Times-Bold')
            .text('Total', 300, 385, { align: 'right', width: 80 })
            .text(` =  RP`, 400, 385)
            .text(`${rounding}`, 400, 385, { width: 170, align: 'right' })

            .font('Times-Roman')
            .text(`${data.formid}`, 0, 800, { width: 550, align: 'right' })
            .rect(20, 450, 550, 1).stroke()
            .text('In Words : ', 20, 460)
        if (data.currencyCd == "RP") {
            doc.text(`Indonesian Rupiah ${inWords} only`, 50, 475)
        }
        else if (data.currencyCd == "USD") {
            doc.text(`United States Dollar ${inWords} only`, 50, 475)
        }
        doc.rect(20, 500, 550, 1).stroke()
            .text('Note : This letter is an explanation of the water calculation for Debit/Credit Note',
                20, 515)
        // .text('xxxxx', 150, 515)
        doc.fontSize(8).font('Times-Bold')
            .text('Disclaimer : ', 225, 540)
            .font('Times-Italic')
            .text('This document does not need to be signed', 270, 540)
    }
    async generatePdfFirstJakarta6(doc, data: Record<any, any>) {

        doc.font('Times-Roman').fontSize(12)
            .text('PT First Jakarta International', 0, 20, { align: 'center' })
            .text('Indonesia Stock Exchange Building, Lot 2 (SCBD)', { align: 'center' })
            .text('Jl. Jend Sudirman kav 52-53', { align: 'center' })
            .text('Jakarta 12190 - Indonesia', { align: 'center' })
            .text('Tel No : 5151515 Fax No : 5150909', { align: 'center' })


        doc.rect(20, 90, 550, 1).stroke()
        doc.fontSize(10)
            .text('TO : ', 42, 110)
            .text(`${data.name}`, 42, 110, { indent: 29 })
            .text(`${data.address1}`, { indent: 29 })
            .text(`${data.address2}`, { indent: 29 })
            .text(`${data.address3} ${data.postCd}`, { indent: 29 })

        doc.fontSize(11)
            .text('ELECTRICITY CALCULATION', 20, 180, { align: 'left', width: 550 })

        doc.rect(20, 200, 550, 1).stroke()
            .fontSize(9)
            .text(`Reference No`, 20, 210)
            .text(`Doc/Meter No : ${data.meterId}`, 20, 225)
            .text(`${data.descs}`, 20, 250)


            .text(`Doc Date`, 350, 210)
            .text(`:`, 450, 210)
            .text(`${data.docDate}`, 470, 210)
            .text(`Meter Read Date`, 350, 230)
            .text(`:`, 450, 230)
            .text(`${data.readDate}`, 470, 230)
            .text(`Periode`, 350, 250)
            .text(`:`, 450, 250)
            .text(`${data.startDate} - ${data.endDate}`, 470, 250)



        doc.rect(20, 265, 550, 1).stroke()

        let reduction = 0
        if (data.asReduction === 'Y') {
            reduction = 1
        }

        const capacity = Number(data.capacity).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const multiplier = Number(data.multiplier).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const currRead = Number(data.currRead).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const lastRead = Number(data.lastRead).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const usage = Number(data.usage).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const currReadHigh = Number(data.currReadHigh).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const lastReadHigh = Number(data.lastReadHigh).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const usageHigh = Number(data.usageHigh).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const flashHours = Number(data.flashHours).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const minUsageHour = Number(data.minUsageHour)
        const usage11 = Number(data.usage11).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const usage21 = Number(data.usage21).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const usageRate1 = Number(data.usageRate1).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const usageRate2 = Number(data.usageRate2).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const kwh = Number(data.kwh).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const usageKwh11 = Number(data.usageKwh11).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const usageKwh21 = Number(data.usageKwh21).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const genRate = Number(data.genRate).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const genAmt1 = Number(data.genAmt1).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const apportionPercent = data.apportionPercent.toFixed(2)
        const rawSubtotal = Number(data.usage11) + Number(data.usage21) + Number(data.genAmt1)
        const subtotal = (rawSubtotal).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const rawSubTotalTimesApportion = rawSubtotal * Number(data.apportionPercent) / 100
        const subTotalTimesApportion = (rawSubTotalTimesApportion).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const trxAmt = (Number(data.trxAmt)).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const roundingAmount = (data.trxAmt - rawSubTotalTimesApportion).toLocaleString('en-US', { minimumFractionDigits: 2 })

        doc.text('Load Capacity', 20, 280).text('=', 130, 280).text(`${capacity} KVA`, 140, 280)
            .text('Load Factor', 20, 295).text('=', 130, 295).text(`${multiplier}`, 140, 295)

        if (data.calculationMethod === 5) {
            doc.text('Usage 1', 20, 310).text('=', 130, 310)
                .text(`( ${currRead} - ${lastRead} ) x ${multiplier} = ${usage} Kwh`, 140, 310)
                .text('Usage 2', 20, 325).text('=', 130, 325)
                .text(`( ${currReadHigh} - ${lastReadHigh} ) x ${multiplier} = ${usageHigh} Kwh`, 140, 325)
        }
        else {
            doc.text('Usage', 20, 310).text('=', 130, 310)
                .text(`( ${currRead} - ${lastRead} ) x ${multiplier} = ${usage} Kwh`, 140, 310)
        }

        doc.text('Usage Hours', 20, 340).text('=', 130, 340)
            .text(`${usage} / ${capacity} = ${flashHours} h`, 140, 340)

            .text('Consumption Charge', 20, 355).text('=', 130, 355)
            .text('Minimum Charge 40 hours', 140, 355)

        if (data.flashHours > 40) {
            doc.text(`40 x...(KVA) x... (Tarif Blok 1)...`)
        } else {
            doc.text(`${minUsageHour} h x ${capacity} KVA x Rp. ${usageRate1}`)
        }

        doc.text('Blok 1', 20, 380, { width: 100, align: 'right' })
            .text('=', 130, 380)
            .text(`( 60h x ${capacity} KVA ) X Rp. ${usageRate1}`, 140, 380)
        if (Number(data.flashHours) > 40) {
            if (Number(data.usageKwh11) > 0 && Number(data.usageKwh21) === 0) {
                doc.text(`${usage} Kwh X Rp. ${usageRate1}`, 140, 390)
                console.log(usage)
            } else {
                doc.text(`${kwh} Kwh X Rp. ${usageRate1}`, 140, 390)
                console.log(kwh)
            }
        }

        doc.text('Blok 2', 20, 410, { width: 100, align: 'right' })
            .text('=', 130, 410)
        if (data.calculationMethod === 5 && Number(data.usageRate2) > 0) {
            doc.text(`CC ${usage} Kwh ${usageHigh} Kwh X Rp. ${usageRate2}`, 140, 410)
        }
        if (Number(data.flashHours) > minUsageHour) {
            if (data.calculationMethod === 5 && data.usageRate2 > 0) {
                doc.text(`${usageKwh11} Kwh - ${usageKwh21} Kwh X Rp. ${usageRate2}`, 140, 420)
            }
            else if (data.usageRate2 > 0) {
                doc.text(`${usage} Kwh ${kwh} Kwh RP. ${usageRate2}`, 140, 420)
                console.log('if else if')
            }
        }
        doc.text('=', 130, 435)
            .text('Retribution Charge', 20, 435)
            .text(`( PPJ / RPJU ${data.genRate}% )`)
            .text(`${genRate} % X ( Rp. ${usage11} + Rp. ${usage21} )`, 140, 435)
            .text('Proportion Billing', 20, 470)
            .text('=', 130, 470)
            .text('Rounding', 20, 485)

        if (Number(data.flashHours) <= Number(data.minUsageHour)) {
            doc.text('= RP', 400, 365).text(`${usage11}`, 400, 360, { width: 170, align: 'right' })
                .text('= RP', 400, 390).text(`0.00`, 400, 390, { width: 170, align: 'right' })
        } else {
            doc.text('= RP', 400, 365).text(`0.00`, 400, 360, { width: 170, align: 'right' })
                .text('= RP', 400, 390).text(`${usage11}`, 400, 390, { width: 170, align: 'right' })
        }
        doc.text('= RP', 400, 420).text(`${usage21}`, 400, 420, { width: 170, align: 'right' })
            .text('= RP', 400, 435).text(`${genAmt1}`, 400, 435, { width: 170, align: 'right' })
            .text('= RP', 400, 465).text(`${subtotal}`, 400, 465, { width: 170, align: 'right' })
            .text('= RP', 400, 480).text(`${subTotalTimesApportion}`, 400, 480, { width: 170, align: 'right' })
            .text('= RP', 400, 495).text(`${roundingAmount}`, 400, 495, { width: 170, align: 'right' })

            .text('Subtotal', 300, 465, { align: 'right', width: 80 })
            .text(`${apportionPercent}%`, 300, 480, { align: 'right', width: 80 })
            .rect(390, 458, 180, 1).stroke()
            .rect(390, 508, 180, 1).stroke()

            .font('Times-Bold')
            .text('Total', 300, 515, { align: 'right', width: 80 })
            .text('= RP', 400, 515).text(`${trxAmt}`, 400, 515, { width: 170, align: 'right' })

            .font('Times-Roman')
        const inWords = this.numberToWords(data.trxAmt)
        doc.rect(20, 550, 550, 1).stroke()
            .text('In Words : ', 20, 560)
        if (data.currencyCd == "RP") {
            doc.text(`Indonesian Rupiah ${inWords} only`, 50, 575, { width: 500 })
        }
        else if (data.currencyCd == "USD") {
            doc.text(`United States Dollar ${inWords} only`, 50, 575, { width: 500 })
        }
        doc.rect(20, 600, 550, 1).stroke()
            .text('Note : This letter is an explanation of the electricity calculation for Debit/Credit Note',
                20, 615)
            // .text('xxxxx', 150, 615) 
            .text(`${data.formid}`, 0, 800, { width: 550, align: 'right' })
        doc.fontSize(8).font('Times-Bold')
            .text('Disclaimer : ', 225, 640)
            .font('Times-Italic')
            .text('This document does not need to be signed', 270, 640)

        console.log("6")

    }

    async generateOR(data: Record<any, any>) {
        const doc = new PDFDocument({ margin: 0, size: 'a4' });
        const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER)
        const filePath = `${rootFolder}/receipt/${data.filename}`;
        const raw_fdoc_amt = Number(data.fdoc_amt)
        const fdoc_amt = raw_fdoc_amt.toLocaleString('en-US', { minimumFractionDigits: 2 })
        const doc_date = moment(data.doc_date).format('DD/MM/YYYY')
        console.log("or created in local : " + filePath)

        if (!fs.existsSync(`${rootFolder}/receipt}`)) {
            fs.mkdirSync(`${rootFolder}/receipt`, { recursive: true });
        }
        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);
        //header kiri
        const imagePath = path.resolve(__dirname, '../../public/images/first-jakarta-logo.png');
        doc.image(imagePath, 15, 25, { width: 40, height: 45 })
        doc.fontSize(12)
            .font('Times-Bold').text("PT FIRST JAKARTA INTERNATIONAL", 60, 32)
            .fontSize(8).font('Times-Roman')
            .text("Indonesia Stock Exchange Building Tower 2, 30th floor, SCBD", 60, 46)
            .text("Jl. Jend. Sudirman Kav. 52-53 Jakarta 12190, Indonesia", 60, 54)
            .text("Tel. (021) 515 1515 Fax : (021) 515 3006", 60, 62)


        const cushmanPath = path.resolve(__dirname, '../../public/images/cushman-and-wakefield-logo.png');
        doc.image(cushmanPath, 400, 45, { width: 150, heigth: 30 })
            .fontSize(10)
            .text('Property Management : ', 400, 32, { width: 150, align: 'center' })

            .fontSize(16).font('Times-Bold')
            .text('OFFICIAL RECEIPT', 0, 130, { align: 'center' })

            .rect(350, 160, 200, 15).stroke()
            .rect(350, 175, 200, 15).stroke()
            .rect(450, 160, 100, 30).stroke()
            .fontSize(10)
            .text('O/R No. ', 360, 164)
            .text('Date ', 360, 179)
            .font('Times-Roman')
            .text(':', 440, 164)
            .text(':', 440, 179)
            .text(`${data.doc_no}`, 450, 164, { width: 100, align: 'center' })
            .text(`${doc_date}`, 450, 179, { width: 100, align: 'center' })

            .rect(20, 205, 150, 25).stroke()
            .rect(20, 205, 530, 25).stroke()

            .rect(20, 240, 150, 25).stroke()
            .rect(20, 240, 300, 25).stroke()

            .fontSize(11).font('Times-Bold')
            .text('RECEIVED FROM', 30, 215)
            .text('AMOUNT', 30, 250)
            .font('Times-Roman')
            .text(`${data.name}`, 190, 215)
            .text(`${data.currency_cd} ${fdoc_amt}`, 190, 250)

        doc.font('Times-Bold').fontSize(10)
            .text('In Words', 20, 300)
            .text('In Payment of', 20, 350)
            .text('Paid By', 20, 370)
            .text('Authorized Signature', 450, 400, { width: 100, align: 'center' })
            .font('Times-Roman')
            .text(':', 170, 300)
            .text(':', 170, 350)
            .text(':', 170, 370)
        if (data.currency_cd == "USD") {
            doc.text(`United States Dollar ${this.numberToWords(raw_fdoc_amt)} only`, 190, 300, { width: 365 })
        } else if (data.currency_cd == "RP") {
            doc.text(`Indonesian Rupiah ${this.numberToWords(raw_fdoc_amt)} only`, 190, 300, { width: 365 })

        }
        doc.text(`${data.descs}`, 190, 350)
        if (raw_fdoc_amt >= 5000000 || (data.currency_cd == "USD" && raw_fdoc_amt >= 300)) {
            doc.text('E-meterai', 450, 450, { width: 100, align: 'center' })
        }
        if (data.or_paid_by === 'C') {
            doc.text('Cash', 190, 370)
        }
        else if (data.or_paid_by === 'B') {
            doc.text('Bank', 190, 370)
        }
        else if (data.or_paid_by === 'T') {
            doc.text('Transfer', 190, 370)
        }
        else if (data.or_paid_by === 'Q') {
            doc.text('Cheque', 190, 370)
        }
        else if (data.or_paid_by === 'G') {
            doc.text('Giro / Cheque', 190, 370)
                .text('Giro No : ______________')
        }
        doc.fontSize(8)
            .text('The Official Receipt is valid only after the cheque (s) / Giro', 20, 400)
            .text('has been cleared')
        doc.fontSize(8).font('Times-Bold')
            .text('Disclaimer : ', 225, 500)
            .font('Times-Italic')
            .text('This document does not need to be signed', 270, 500)
            .font('Times-Roman').fontSize(9)
            .text(`${data.formid}`, 0, 800, { width: 550, align: 'right' })
        doc.end()

        try {
            await this.connect();
            const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
            const filePath = `${rootFolder}/receipt/${data.filename}`;
            if (!fs.existsSync(filePath)) {
                console.error(`Local file does not exist: ${filePath}`);
            }

            await this.upload(filePath, `/UNSIGNED/GQCINV/RECEIPT/${data.filename}`);

        } catch (error) {
            console.log("Error during upload:.", error);
            throw new BadRequestException({
                statusCode: 400,
                message: 'Failed to upload to FTP',
                data: [error],
            });
        } finally {
            console.log("Disconnecting from FTP servers");
            await this.disconnect();
        }
        return ({
            statusCode: 201,
            message: "invoice created!",
            data: filePath
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
            .text(`${data.namaPenerima}`, 350, 730, { align: 'center' })
        doc.end();

        return ({
            statusCode: 201,
            message: "invoice created",
            data: filePath
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

        if (amount === 0) return '';

        const [integerPart, decimalPart] = amount.toString().split('.');

        let words = '';
        let i = 0;
        let integerAmount = parseInt(integerPart, 10);

        // Convert the integer part
        while (integerAmount > 0) {
            const chunk = integerAmount % 1000;
            if (chunk > 0) {
                const chunkWords = this.convertChunk(chunk);
                words = chunkWords + (thousands[i] ? ' ' + thousands[i] : '') + (words ? ' and ' : '') + words;
            }
            integerAmount = Math.floor(integerAmount / 1000);
            i++;
        }

        words = words.trim();

        // Convert the decimal part if present
        if (decimalPart && parseInt(decimalPart, 10) > 0) {
            const decimalWords = this.convertChunk(parseInt(decimalPart, 10));
            words += ` point ${decimalWords} Cent${parseInt(decimalPart, 10) > 1 ? 's' : ''}`;
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


