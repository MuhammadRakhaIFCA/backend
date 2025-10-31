import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { FjiDatabaseService } from 'src/database/database-fji.service';

@Injectable()
export class PrintDocumentService {
  constructor(private readonly databaseService: FjiDatabaseService /* your PrismaService */) { }

  /**
   * 1) Fetch arbitrary tables from our own DB based on
   *    `body.requiredData` and `body.filters`.
   * 2) Return an object keyed by alias.
   */
  async templateData(body: {
    filters: Record<string, any>;
    requiredData: Array<{ table: string; columns: string[]; alias: string }>;
  }) {
    const { filters, requiredData } = body;
    const result: Record<string, any[]> = {};
    for (const { table, columns, alias } of requiredData) {
      // Build WHERE clauses from filters
      const whereClauses: any[] = [];
      for (const [key, val] of Object.entries(filters)) {
        // key format: "table.column"
        // console.log(Object.entries(filters))
        const lastDotIndex = key.lastIndexOf(".");
        const tbl = key.substring(0, lastDotIndex);
        const col = key.substring(lastDotIndex + 1);
        if (tbl === table) {
          whereClauses.push(
            Prisma.sql`${Prisma.raw(col)} = ${val}`
          );
        }
      }
      const whereSql = whereClauses.length
        ? Prisma.sql`WHERE ${Prisma.join(whereClauses, ' AND ')}`
        : Prisma.empty;

      console.log(whereSql)

      const rows: any[] = await this.databaseService.$queryRaw<any[]>`
        SELECT ${Prisma.join(columns.map(c => Prisma.raw(c)), ', ')}
        FROM ${Prisma.raw(table)}
        ${whereSql}
      `;
      result[alias] = rows;

    // Duplicate rows 50× for testing
    const multipliedRows: any[] = [];
    for (let i = 0; i < 50; i++) {
      multipliedRows.push(...rows);
    }

    result[alias] = multipliedRows;
    }
    return result;
  }

  /**
   * 1) Load template metadata (project_url, pages, items).
   * 2) Build a list of requiredData for the source API.
   * 3) Call sourceProjectUrl/api/template-data.
   * 4) Render PDF via PDFKit.
   */
  async printDocument(body: {
    document_id: string;
    filters: Record<string, any>;
  }) {
    try {
      const templateBuilderUrl = process.env.TEMPLATE_BUILDER_URL
      const resp = await axios.post<{ path: string }>(
        `${templateBuilderUrl}/api/template-print`,
        body,
      );
      return resp.data; // { path: '…/template/XYZ.pdf' }
    } catch (e) {
      console.error('Error calling Template Builder:', e);
      throw new InternalServerErrorException('Failed to generate PDF');
    }
  }

  async getTables() {
    try {
      return {
        statusCode: 200,
        message: "success getting tables",
        data: [
          {table : "mgr.ar_blast_inv"}, 
          {table : "mgr.ar_blast_or"}
        ]
      }
    } catch (error) {
      throw new NotFoundException({
        statusCode: 404,
        message: "no tables found",
        data: []
      })
    }
  }

  async getColumns(table_name: string) {
    try {
      // If table name includes ".", take only the part after the dot
      const cleanedTableName = table_name.includes(".")
        ? table_name.split(".").pop()
        : table_name;

      const columns: Array<any> = await this.databaseService.$queryRaw`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = ${cleanedTableName}
    `;

      return {
        statusCode: 200,
        message: "success getting table columns",
        data: columns.map((col: any) => col.COLUMN_NAME)
      };
    } catch (error) {
      throw new NotFoundException({
        statusCode: 404,
        message: "this table doesn't exist",
        data: []
      });
    }
  }
}

