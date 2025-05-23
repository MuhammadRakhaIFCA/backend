import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import * as fs from 'fs';
import * as path from 'path';
import { UploadService } from 'src/upload/upload.service';
import { StampDto } from './dto/stamp.dto';
import { FjiDatabaseService } from 'src/database/database-fji.service';
import { Prisma } from '@prisma/client';
import * as pdfjs from 'pdfjs-dist';
import * as ftp from 'basic-ftp';
import * as moment from 'moment'

const token =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImlmY2FfZW1ldEB5b3BtYWlsLmNvbSIsInN1YiI6IjE0YjNiNDIzLWQzM2EtNGJkOS1hNzFkLTg0Mjk3MTJiYWQwNyIsImF1ZCI6Imh0dHBzOi8vZS1tZXRlcmFpLmNvLmlkIiwiaXNzIjoiZW1ldGVyYWkiLCJqdGkiOiIzMzA4MGY4Yi1iM2EzLTQxN2YtOWYxOS1lNDY4ZTFiZWYyNmIiLCJleHAiOjE3MzMyODA5MzYsImlhdCI6MTczMzE5NDUzNn0.8esgXb4W5q2LNMUgsX3R0B39RZu5orwsjbZkSGkMuMM';
@Injectable()
export class PeruriService {
  private client: ftp.Client;
  constructor(
    private readonly httpService: HttpService,
    private readonly fjiDatabase: FjiDatabaseService,
  ) {
    this.client = new ftp.Client();
    this.client.ftp.verbose = true;
  }

  async connect(): Promise<void> {
    console.log(this.client.closed);
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

  async stamping(body: Record<any, any>) {
    const { company_cd, file_name, file_type, process_id, audit_user } = body;
    const mode = process.env.NEST_PUBLIC_ENV_MODE
    if (this.isEmpty(company_cd) || this.isEmpty(file_name) || this.isEmpty(file_type) || this.isEmpty(audit_user)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Company CD, File Name, File Type and audit user are required ',
        data: []
      })
    }
    try {
      const response = await this.checkSaldo(company_cd);
      if (response.data <= 0) {
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'Sorry, you have insufficient balance. Please top up first',
          data: []
        });
      }
    } catch (error) {
      throw error;
    }
    const rootFolder = path.resolve(__dirname, '..', '..', process.env.ROOT_PDF_FOLDER);
    const upper_file_type = file_type.toUpperCase();
    let approved_file: Array<any>
    if (file_type === 'receipt') {
      approved_file = await this.fjiDatabase.$queryRawUnsafe(`
        SELECT * FROM mgr.ar_blast_or WHERE filenames = '${file_name}' AND process_id = '${process_id}'
        `);
    } else {
      approved_file = await this.fjiDatabase.$queryRawUnsafe(`
          SELECT * FROM mgr.ar_blast_inv WHERE filenames = '${file_name}' AND process_id = '${process_id}'
          `);
    }

    if (!approved_file[0]) {
      throw new NotFoundException({
        statusCode: 404,
        message: "file doesn't exist",
        data: [],
      });
    }
    const doc_no = approved_file[0]?.doc_no;

    //1. ambil data dari peruri account usesrname dan password

    const loginBody = {
      user: process.env.PERURI_ACCOUNT,
      password: process.env.PERURI_PASSWORD,
    };

    //2 . login ke peruri dengan menggunakan username dan password dari database tadi untuk dapat token
    let loginUrl:string = ''
    if(mode === 'sandbox'){
      loginUrl = 'https://backendservicestg.e-meterai.co.id/api/users/login'
    }
    else if (mode === 'production'){
      loginUrl = 'https://backendservice.e-meterai.co.id/api/users/login'
    }
    else if (mode === 'local'){
      loginUrl = 'https://backendservicestg.e-meterai.co.id/api/users/login'
    }
    let loginData
    try {
       loginData = await firstValueFrom(
        this.httpService.post(
          loginUrl,
          loginBody,
        ),
      );
    } catch (error) {
      // if (loginData.data.statusCode !== '00') {
        const updateTableBody = {
          file_status_sign: 'P',
          doc_no,
          project_no: approved_file[0].project_no,
          entity_cd: approved_file[0].entity_cd,
          debtor_acct: approved_file[0].debtor_acct,
          invoice_tipe: approved_file[0].invoice_tipe,
        }
  
        if (file_type === 'receipt') {
          await this.updateBlastOrTable(updateTableBody)
        } else {
          await this.updateBlastInvTable(updateTableBody)
        }
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'peruri login failed',
          data: [],
        });
      // }
    }



    const signedFileName = `${file_name.slice(0, -4)}_signed.pdf`;

    const signedFile: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT * FROM mgr.peruri_stamp_file_log
                WHERE file_name_sign = '${signedFileName}'
            `);
    console.log(signedFile.length);
    if (signedFile.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'document already signed',
        data: [],
      });
    }
    let file: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
            SELECT * FROM mgr.peruri_stamp_file_log
            WHERE file_name_sign = '${file_name}'
        `);

    //3. masukkan token login ke header request
    const token = loginData.data.token;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    if (file.length === 0) {
      await this.fjiDatabase.$executeRaw(Prisma.sql`
                INSERT INTO mgr.peruri_stamp_file_log
                (file_type, file_name_sign, file_status_sign,
                company_cd, file_token_sign, audit_date, audit_user) 
                VALUES 
                (${file_type}, ${file_name}, 'P', ${company_cd}, ${token}, GETDATE(), ${audit_user})
            `);
      file = await this.fjiDatabase.$queryRawUnsafe(`
                SELECT * FROM mgr.peruri_stamp_file_log
                WHERE file_name_sign = '${file_name}'
            `);
      const updateTableBody = {
        file_token_sign: token,
        file_status_sign: 'P',
        doc_no,
        project_no: approved_file[0].project_no,
        entity_cd: approved_file[0].entity_cd,
        debtor_acct: approved_file[0].debtor_acct,
        invoice_tipe: approved_file[0].invoice_tipe,
        //process_id: approved_file[0].process_id
      }

      if (file_type === 'receipt') {
        await this.updateBlastOrTable(updateTableBody)
      } else {
        await this.updateBlastInvTable(updateTableBody)
      }
    }

    let imagePath;
    // if (file[0].file_status_sign === 'F' || file[0].file_status_sign === 'A') {
    //     await this.fjiDatabase.$executeRaw(Prisma.sql`
    //         UPDATE peruri_stamp_file_log
    //         SET restamp_date = NOW()
    //         WHERE file_name = '${file.file_name}'
    //       `)
    // }
    if (file[0]?.file_status_sign === `P`) {
      console.log("getting sn")
      let gettingSnUrl:string = ''
      if(mode === 'sandbox'){
        gettingSnUrl = 'https://stampv2stg.e-meterai.co.id/chanel/stampv2'
      }
      else if (mode === 'production'){
        gettingSnUrl = 'https://stampv2.e-meterai.co.id/chanel/stampv2'
      }
      else if(mode === 'local'){
        gettingSnUrl = 'https://stampv2stg.e-meterai.co.id/chanel/stampv2'
      }
      const currentDate = moment().format("YYYY-MM-DD")
      const sn = await firstValueFrom(
        this.httpService.post(
          gettingSnUrl,
          {
            isUpload: false,
            namadoc: '2',
            namafile: file_name,
            nilaidoc: '',
            namejidentitas: '',
            noidentitas: '',
            namedipungut: '',
            snOnly: false,
            nodoc: '1',
            tgldoc: currentDate,
          },
          { headers },
        ),
      );
      if (sn.data.statusCode !== '00') {
        throw new NotFoundException({
          statusCode: 401,
          message: 'failed to get serial number ',
          data: [],
        });
      }
      //6. masukkin sn ke table sn
      await this.fjiDatabase.$executeRawUnsafe(`
                UPDATE mgr.peruri_stamp_file_log
                SET file_status_sign = 'A', file_sn_sign = '${sn.data.result.sn}', file_token_sign ='${token}'
                WHERE file_name_sign = '${file_name}'
              `);
      const updateTableBody = {
        file_token_sign: token,
        file_sn_sign: sn.data.result.sn,
        file_status_sign: 'A',
        doc_no,
        project_no: approved_file[0].project_no,
        entity_cd: approved_file[0].entity_cd,
        debtor_acct: approved_file[0].debtor_acct,
        invoice_tipe: approved_file[0].invoice_tipe,
        //process_id: approved_file[0].process_id
      }

      if (file_type === 'receipt') {
        await this.updateBlastOrTable(updateTableBody)
      } else {
        await this.updateBlastInvTable(updateTableBody)
      }

      //this.useStamp(body.company_cd, company[0].nama_company, 1, sn.data.result.sn)

      const base64Image = sn.data.result.image;

      const folderPath = `${rootFolder}/stamp-images`;
      const fileName = `${file_name.replace(/\.pdf$/, '')}.png`;
      imagePath = path.join(folderPath, fileName);

      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      const stampImage = Buffer.from(base64Image, 'base64');
      await fs.promises.writeFile(imagePath, stampImage);

    }

    const snResponse = await this.fjiDatabase.$queryRawUnsafe(
      `SELECT file_sn_sign FROM mgr.peruri_stamp_file_log
             where file_name_sign = '${file_name}'
             and company_cd = '${company_cd}'
             and file_type = '${file_type}'
             `,
    );
    //https://stampv2stg.e-meterai.co.id/snqr/qrimage

    const sn = snResponse[0]?.file_sn_sign;
    let gettingImageUrl:string = ''
    if(mode === 'sandbox'){
      gettingImageUrl = `https://stampv2stg.e-meterai.co.id/snqr/qrimage?serialnumber=${sn}&onprem=true`
    }
    else if (mode === 'production'){
      gettingImageUrl = `https://stampv2.e-meterai.co.id/snqr/qrimage?serialnumber=${sn}&onprem=true`
    }
    else if(mode === 'local'){
      gettingImageUrl = `https://stampv2stg.e-meterai.co.id/snqr/qrimage?serialnumber=${sn}&onprem=true`
    }
    try {
      const getStampImage = await firstValueFrom(
        this.httpService.get(
          gettingImageUrl,
          { headers },
        ),
      );
      console.log(getStampImage)

      const base64Image = getStampImage.data.result.base64;

      const folderPath = `${rootFolder}/stamp-images`;
      const fileName = `${file_name.replace(/\.pdf$/, '')}.png`;
      imagePath = path.join(folderPath, fileName);

      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      const stampImage = Buffer.from(base64Image, 'base64');
      await fs.promises.writeFile(imagePath, stampImage);


      // const folderPath = `${rootFolder}/stamp-images`;
      // const fileName = `${file_name.replace(/\.pdf$/, '')}.png`;


      imagePath = path.join(folderPath, fileName);
      const remoteImagePath = `/STAMP/${company_cd}/${upper_file_type}/${fileName}`;

      try {
        await this.connect();
        await this.upload(imagePath, remoteImagePath);
        await this.disconnect();
      } catch (error) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'fail to save image',
          data: [error],
        });
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error
      }
      throw new InternalServerErrorException({
        statusCode: 500,
        message: 'fail to get or save stamp image',
        data: [error],
      })
    }

    const fileName = `${file_name.replace(/\.pdf$/, '')}.png`;


    //7. hit api untuk dapat coordinate llx, lly, urx dan ury
    const pdfpath = `${rootFolder}/${file_type}/${file_name}`;
    const coordinates = await this.getCoordinates(pdfpath, 'E-meterai', 1);

    // console.log("pdf path : " + pdfpath)
    // console.log("coordinates : " + coordinates.data[0])
    const { visLLX, visLLY, visURX, visURY } = coordinates.data[0];
    console.log(coordinates.data[0])

    let stamp;

    try {
      console.log('sn : ' + sn);
      console.log('token : ' + token);
      
      let stampingUrl:string = ''
      if (mode === 'local'){
        stampingUrl = 'http://emstag.property365.co.id:8010/adapter/pdfsigning/rest/docSigningZ'
      } 
      else if(mode === 'sandbox'){
        stampingUrl = `http://10.10.0.10:8080/adapter/pdfsigning/rest/docSigningZ`
      }
      else if (mode === 'production'){
        stampingUrl = 'http://103.84.193.220:8080/adapter/pdfsigning/rest/docSigningZ'
      }
      console.log("mode : " + mode)
      console.log("stampingUrl : " + stampingUrl)
      //8. ambil sn dari nomer 5, ambil token dari nomer 2 lalu lakukan stamping
      stamp = await firstValueFrom(
        this.httpService.post(
          stampingUrl,
          {
            certificatelevel: 'NOT_CERTIFIED',
            dest: `/sharefolder/SIGNED/${company_cd}/${upper_file_type}/${signedFileName}`,
            docpass: '',
            jwToken: token,
            location: 'JAKARTA',
            profileName: 'emeteraicertificateSigner',
            reason: 'Dokumen',
            refToken: sn,
            spesimenPath: `/sharefolder/STAMP/${company_cd}/${upper_file_type}/${fileName}`,
            src: `/sharefolder/UNSIGNED/${company_cd}/${upper_file_type}/${file_name}`,
            visLLX: visLLX,
            visLLY: visLLY,
            visURX: visURX,
            visURY: visURY,
            visSignaturePage: 1,
          },
          { headers },
        ),
      );
    } catch (error) {
      console.log(error)
      //10. jika gagal ubah status menjadi f
      const updateTableBody = {
        file_token_sign: token,
        file_sn_sign: sn,
        file_status_sign: 'F',
        doc_no,
        project_no: approved_file[0].project_no,
        entity_cd: approved_file[0].entity_cd,
        debtor_acct: approved_file[0].debtor_acct,
        invoice_tipe: approved_file[0].invoice_tipe,
        //process_id: approved_file[0].process_id
      }

      if (file_type === 'receipt') {
        await this.updateBlastOrTable(updateTableBody)
      } else {
        await this.updateBlastInvTable(updateTableBody)
      }
      await this.fjiDatabase.$executeRawUnsafe(`
                         UPDATE mgr.peruri_stamp_file_log SET file_status_sign = 'F'
                         WHERE file_name_sign = '${file_name}'
                        `);
      console.log(error)
      throw new BadRequestException({

        statusCode: 400,
        message: 'stamping failed',
        data: [error],
      });
    }

    //9. jika stamping berhasil ubah nama file di database dengan ditambah '_signed' dan ubah status menjadi s
    await this.fjiDatabase.$executeRawUnsafe(`
            UPDATE mgr.peruri_stamp_file_log 
            SET file_status_sign = 'S', file_name_sign = '${signedFileName}'
            WHERE file_name_sign = '${file_name}'
            `);
    const updateTableBody = {
      file_name_sign: signedFileName,
      file_token_sign: token,
      file_sn_sign: sn,
      file_status_sign: 'S',
      doc_no,
      project_no: approved_file[0].project_no,
      entity_cd: approved_file[0].entity_cd,
      debtor_acct: approved_file[0].debtor_acct,
      invoice_tipe: approved_file[0].invoice_tipe,
      // process_id: approved_file[0].process_id
    }

    if (file_type === 'receipt') {
      await this.updateBlastOrTable(updateTableBody)
    } else {
      await this.updateBlastInvTable(updateTableBody)
    }

    try {
      await this.useSaldo(company_cd, sn)
    } catch (error) {
      throw new BadRequestException(error.response)
    }

    return {
      statusCode: 201,
      message: 'stamping successful',
      data: [
        {
          signed_file_name: `${file_name.slice(0, -4)}_signed.pdf`,
          unsigned_file_name: `${file_name}`,
          image_file_name: `${fileName}`,
        },
      ],
    };
  }

  async noStampOr(doc_no: string) {
    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
        UPDATE mgr.ar_blast_or
        SET status_process_sign = 'N', file_status_sign = 'N'
        WHERE doc_no = '${doc_no}' AND status_process_sign IS NULL
      `);
      if (result === 0) {
        throw new NotFoundException({
          statusCode: 404,
          message: 'File not found',
          data: [],
        });
      }

      return {
        statusCode: 200,
        message: 'Successfully set file to no stamp',
        data: [],
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Database query failed:', error);
      throw new BadRequestException({
        statusCode: 400,
        message: 'Failed to set file to no stamp',
        data: [],
      });
    }
  }
  async noStamp(doc_no: string) {
    try {
      const result = await this.fjiDatabase.$executeRawUnsafe(`
        UPDATE mgr.ar_blast_inv
        SET status_process_sign = 'N', file_status_sign = 'N'
        WHERE doc_no = '${doc_no}' AND status_process_sign IS NULL
      `);
      if (result === 0) {
        throw new NotFoundException({
          statusCode: 404,
          message: 'File not found',
          data: [],
        });
      }

      return {
        statusCode: 200,
        message: 'Successfully set file to no stamp',
        data: [],
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Database query failed:', error);
      throw new BadRequestException({
        statusCode: 400,
        message: 'Failed to set file to no stamp',
        data: [],
      });
    }
  }


  async updateBlastOrTable(data: Record<any, any>) {
    //console.log('Data:', JSON.stringify(data, null, 2));
    const {
      file_name_sign, file_token_sign, file_sn_sign, file_status_sign,
      doc_no, project_no, entity_cd, debtor_acct, invoice_tipe, process_id
    } = data
    try {
      await this.fjiDatabase.$executeRaw(Prisma.sql`
        UPDATE mgr.ar_blast_or SET file_name_sign = ${file_name_sign}, status_process_sign = 'Y',
        file_token_sign = ${file_token_sign}, file_sn_sign = ${file_sn_sign}, file_status_sign = ${file_status_sign}
        WHERE doc_no = ${doc_no}
        AND project_no = ${project_no}
        AND entity_cd = ${entity_cd}
        AND debtor_acct = ${debtor_acct}
        AND invoice_tipe = ${invoice_tipe}
        `)
    } catch (error) {
      console.log(error)
      throw new BadRequestException({
        statusCode: 400,
        message: 'fail to update ar_blast_or table',
        data: []
      })
    }
    return ({
      statusCode: 200,
      message: 'update ar_blast_inv table successfully',
      data: []
    })
  }
  async updateBlastInvTable(data: Record<any, any>) {
    //console.log('Data:', JSON.stringify(data, null, 2));
    const {
      file_name_sign, file_token_sign, file_sn_sign, file_status_sign,
      doc_no, project_no, entity_cd, debtor_acct, invoice_tipe, process_id
    } = data
    try {
      await this.fjiDatabase.$executeRaw(Prisma.sql`
        UPDATE mgr.ar_blast_inv SET file_name_sign = ${file_name_sign}, status_process_sign = 'Y',
        file_token_sign = ${file_token_sign}, file_sn_sign = ${file_sn_sign}, file_status_sign = ${file_status_sign}
        WHERE doc_no = ${doc_no}
        AND project_no = ${project_no}
        AND entity_cd = ${entity_cd}
        AND debtor_acct = ${debtor_acct}
        AND invoice_tipe = ${invoice_tipe}
        `)
    } catch (error) {
      console.log(error)
      throw new BadRequestException({
        statusCode: 400,
        message: 'fail to update ar_blast_inv table',
        data: []
      })
    }
    return ({
      statusCode: 200,
      message: 'update ar_blast_inv table successfully',
      data: []
    })
  }

  private isEmpty(value: any): boolean {
    if (value === undefined || value === null || value === '') {
      return true;
    }
    return false;
  }

  async getCoordinates(
    filePath: string,
    searchWord: string,
    pageNumber: number,
  ) {
    pdfjs.GlobalWorkerOptions.workerSrc = null;
    const data = new Uint8Array(fs.readFileSync(filePath));
    const pdfDocument = await pdfjs.getDocument({ data }).promise;

    const coordinates = [];

    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const height = viewport.height;
    const width = viewport.width;

    for (const item of textContent.items) {
      if ('str' in item && item.str === searchWord) {
        const stampSize = 75;
        const stampMarginVertical = -35;
        const x = item.transform[4];
        const y = item.transform[5];
        const itemWidth = item.width;
        const itemHeight = item.height;
        coordinates.push({
          visLLX: x - stampSize / 2 + itemWidth / 2,
          visLLY: y + stampMarginVertical,
          visURX: x + stampSize / 2 + itemWidth / 2,
          visURY: y + stampMarginVertical + stampSize,
        });
        //console.log(item)
      }
    }

    return {
      statusCode: 200,
      message: 'success',
      data: coordinates,
    };
  }

  async checkSaldo(company_cd: string) {
    try {
      const saldo = await this.fjiDatabase.$queryRawUnsafe(`
        SELECT TOP(1) * FROM mgr.peruri_stamp_balance
        WHERE company_cd = '${company_cd}'
        ORDER BY audit_date desc
        `)

      // if (saldo && saldo[0]?.saldo > 0) {
      //   return true
      // } else {
      //   return false
      // }

      if (saldo && saldo[0]?.saldo) {
        return {
          statusCode: 200,
          message: 'get saldo success',
          data: Number(saldo[0].saldo)
        }
      } else {
        throw new NotFoundException({
          statusCode: 200,
          message: 'get saldo success',
          data: 0
        })
      }

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException({
        statusCode: 400,
        message: 'fail to check mgr.peruri_stamp_balance table',
        data: []
      })
    }
  }

  async useSaldo(company_cd: string, sn: string) {
    try {
      const saldo = await this.fjiDatabase.$queryRawUnsafe(`
        SELECT * FROM mgr.peruri_stamp_balance
        WHERE company_cd = '${company_cd}'
        ORDER BY audit_date desc
        `)

      const newSaldo = Number(saldo[0].saldo) - 1
      await this.fjiDatabase.$executeRawUnsafe(`
        INSERT INTO mgr.peruri_stamp_balance
        (company_cd, transaction_number, qty, type, saldo, audit_date)
        VALUES
        ('${company_cd}', '${sn}', 1, 'K', '${newSaldo}', GETDATE())
        `)
    } catch (error) {
      console.log(error)
      throw new BadRequestException({
        statusCode: 400,
        message: 'fail to insert data into mgr.peruri_stamp_balance table',
        data: []
      })
    }
  }

  async topup(body: Record<any, any>) {
    const { company_cd, transaction_number, type_topup } = body
    try {
      const saldo: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
        SELECT top(1) saldo, qty FROM mgr.peruri_stamp_balance
        WHERE company_cd = '${company_cd}'
        AND type_topup = '${type_topup}'
        ORDER BY audit_date desc
        `)
      const transaction: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
        SELECT * FROM mgr.finpay_transaction
        WHERE order_id = '${transaction_number}'
        AND company_cd = '${company_cd}'
        `)
      if (!transaction || transaction.length === 0) {
        throw new NotFoundException({
          statusCode: 404,
          message: "this order id doesn't exist",
          data: []
        })
      }
      if (transaction[0]?.status_payment === "COMPLETED") {
        throw new BadRequestException({
          statusCode: 400,
          message: "this order is already completed",
          data: []
        })
      }
      if (transaction[0].status_payment !== "PAID") {
        throw new BadRequestException({
          statusCode: 400,
          message: "you haven't paid your transaction",
          data: []
        })
      }
      const qty = Number(transaction[0].order_qty)
      let newSaldo: number = 0
      if (!saldo || saldo.length === 0) {
        newSaldo = qty
      } else {
        newSaldo = Number(saldo[0].saldo) + qty
      }

      await this.fjiDatabase.$executeRawUnsafe(`
        INSERT INTO mgr.peruri_stamp_balance
        (company_cd, transaction_number, qty, type, saldo, audit_date)
        VALUES
        ('${company_cd}', '${transaction_number}', ${qty}, 'D', ${newSaldo}, GETDATE())
        `)
    } catch (error) {
      throw error
    }

    try {
      await this.fjiDatabase.$executeRawUnsafe(`
        UPDATE mgr.finpay_transaction 
        SET status_payment = 'COMPLETED', audit_date = GETDATE()
        WHERE order_id = '${transaction_number}'
        `)
    } catch (error) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'fail to update mgr.finpay_transaction table',
        data: [error]
      })
    }
    return ({
      statusCode: 201,
      message: "top up success",
      data: []
    })
  }



  async sycnOrTable() {
    const result: Array<any> = await this.fjiDatabase.$queryRawUnsafe(`
      SELECT * FROM mgr.ar_blast_or
      WHERE file_status_sign = 'S'
      AND rowID < 38
      `)
    for (let i = 0; i < result.length; i++) {
      await this.fjiDatabase.$executeRaw(Prisma.sql`
          INSERT INTO mgr.peruri_stamp_file_log
          (file_type, file_name_sign, file_status_sign,
          company_cd, file_token_sign, file_sn_sign, audit_date, audit_user) 
          VALUES 
          (${result[i].invoice_tipe}, ${result[i].file_name_sign}, 'S', 
          'GQCINV', ${result[i].file_token_sign}, ${result[i].file_sn_sign},
          ${result[i].audit_date}, ${result[i].audit_user})
      `);
    }
  }
}
