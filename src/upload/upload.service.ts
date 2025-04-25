import { Injectable } from '@nestjs/common';
import Tesseract from 'tesseract.js';
import * as fs from 'fs';
import { PDFDocument, PDFPage, PDFStream, rgb } from 'pdf-lib';
import * as PDFParser from 'pdf2json';
import { extract as pdfExtract } from 'pdf-extraction';
import * as pdfjs from 'pdfjs-dist';
import path from 'path';
import axios from 'axios';

@Injectable()
export class UploadService {
  private readonly stampMarginVertical = -35;
  private readonly stampMarginHorizontal = -30;
  private readonly stampSize = 75;
  private readonly stampFontSize = 30;
  private readonly textUnderEmateraiPosition = 'emeterei';
  async extractWordCoordinates(filePath: string, targetWord: string) {
    console.log(filePath);
    const { data } = await Tesseract.recognize(filePath, 'eng', {
      logger: console.log,
    });
    const words = data.words; // Extracted words with their positions

    const matchingWord = words.find((word) => word.text === targetWord);

    if (matchingWord) {
      return {
        text: matchingWord.text,
        boundingBox: matchingWord.bbox, // Coordinates of the word
      };
    }

    return { message: `Word "${targetWord}" not found. ` };
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
        const x = item.transform[4];
        const y = item.transform[5];
        const itemWidth = item.width;
        const itemHeight = item.height;
        coordinates.push({
          visLLX: x,
          visLLY: y,
          visURX: width - x - itemWidth,
          visURY: height - y - itemHeight,
        });
        //console.log(item)
      }
    }
    console.log(coordinates)
    return {
      statusCode: 200,
      message: 'success',
      data: coordinates,
    };
  }

  async getCoordinatesAll(filePath, searchWord, pageNumber) {
    pdfjs.GlobalWorkerOptions.workerSrc = null;
    const data = new Uint8Array(fs.readFileSync(filePath));
    const pdfDocument = await pdfjs.getDocument({ data }).promise;

    const coordinates = [];
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const height = viewport.height;

    let previousFontName = null;
    let previousHeight = null;

    // Array to hold grouped lines
    const groupedLines = [];
    let currentLine = [];
    let currentY = null;

    for (const item of textContent.items) {
      if ('str' in item) {
        const textString = item.str;
        const x = Math.round(item.transform[4]);
        const y = Math.round(height - item.transform[5] - item.height);
        const width = Math.round(item.width); // Width of the text item
        const fontName = item.fontName;
        const textHeight = Math.round(item.height);

        if (item.str === ' ') continue;
        if (currentY === null || Math.abs(currentY - y) <= 2) {
          // Check if this item is horizontally close to the previous item
          if (
            currentLine.length > 0 &&
            x -
            (currentLine[currentLine.length - 1].x +
              currentLine[currentLine.length - 1].width) <=
            3
          ) {
            // Add to the current line
            currentLine.push({
              text: textString,
              x,
              width,
              fontName,
              textHeight,
            });
          } else if (currentLine.length === 0) {
            // Start a new line
            currentLine.push({
              text: textString,
              x,
              width,
              fontName,
              textHeight,
            });
            currentY = y;
          } else {
            // Close the current line and start a new one
            groupedLines.push({ y: currentY, line: currentLine });
            currentLine = [
              { text: textString, x, width, fontName, textHeight },
            ];
            currentY = y;
          }
        } else {
          // Close the current line and start a new one
          if (currentLine.length > 0)
            groupedLines.push({ y: currentY, line: currentLine });
          currentLine = [{ text: textString, x, width, fontName, textHeight }];
          currentY = y;
        }
      }
    }

    // Push the last line
    if (currentLine.length > 0)
      groupedLines.push({ y: currentY, line: currentLine });

    // Convert grouped lines to the desired format
    for (const { y, line } of groupedLines) {
      const sortedLine = line.sort((a, b) => a.x - b.x); // Sort items by x-coordinate
      let combinedText = '';
      let mergedText = '';
      let startX = null;

      for (let i = 0; i < sortedLine.length; i++) {
        const item = sortedLine[i];

        // Merge text if it's within a small horizontal range
        if (
          i === 0 ||
          item.x - (sortedLine[i - 1].x + sortedLine[i - 1].width) <= 3
        ) {
          if (mergedText === '') {
            startX = item.x; // Set starting x-coordinate for merged text
          }
          mergedText += item.text;
        } else {
          // Close merged text and start a new one
          combinedText += `.text('${mergedText}', ${startX}, ${y})`;
          mergedText = item.text;
          startX = item.x;
        }

        // Update font and size changes
        if (item.fontName !== previousFontName) {
          combinedText += `.font('${item.fontName}')`;
          previousFontName = item.fontName;
        }
        if (item.textHeight !== previousHeight) {
          combinedText += `.fontSize(${item.textHeight})`;
          previousHeight = item.textHeight;
        }
      }

      // Append any remaining merged text
      if (mergedText !== '') {
        combinedText += `.text('${mergedText}', ${startX}, ${y})`;
      }

      coordinates.push(combinedText);
    }

    return {
      statusCode: 200,
      message: 'success',
      data: coordinates,
    };
  }

  async getCoordinatesFromUrl(
    url: string,
    searchWord: string,
    pageNumber: number,
  ) {
    pdfjs.GlobalWorkerOptions.workerSrc = null;
    console.log(url);
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const data = new Uint8Array(response.data); // Convert the response to a format usable by pdfjs
    const pdfDocument = await pdfjs.getDocument({ data }).promise;

    const coordinates = [];

    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const height = viewport.height;
    const width = viewport.width;

    for (const item of textContent.items) {
      if ('str' in item && item.str === searchWord) {
        const x = item.transform[4];
        const y = item.transform[5];
        const itemWidth = item.width;
        const itemHeight = item.height;
        coordinates.push({
          visLLX: x,
          visLLY: y,
          visURX: width - x - itemWidth,
          visURY: height - y - itemHeight,
        });
      }
    }

    return {
      statusCode: 200,
      message: 'success',
      data: coordinates,
    };
  }

  async stampTest(
    pdfPath: string,
    outputPdfPath: string,
    imgBuffer: Buffer,
    pageNumber: number,
    fileName: string,
    boundingBoxes: {
      visLLX: number;
      visLLY: number;
      visURX: number;
      visURY: number;
    },
  ) {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const page = pages[pageNumber - 1];
    const image = await pdfDoc.embedJpg(imgBuffer);
    // const image = await pdfDoc.embedPng(imgBuffer);
    const { visLLX, visLLY, visURX, visURY } = boundingBoxes;
    page.drawImage(image, {
      x: visLLX - 30,
      y: visLLY - 35,
      width: 75,
      height: 75,
      opacity: 0.75,
    });
    //const outputPath = path.join('./uploads', `output-${fileName}`)
    const pdfBytesModified = await pdfDoc.save();
    fs.writeFileSync(outputPdfPath, pdfBytesModified);
  }

  async drawBoundingBox(
    pdfPath: string,
    outputPdfPath: string,
    boundingBoxes: {
      visLLX: number;
      visLLY: number;
      visURX: number;
      visURY: number;
    }[],
    pageNumber: number,
  ): Promise<void> {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const page = pages[pageNumber - 1];

    if (!page) {
      throw new Error(`Page ${pageNumber} does not exist in the document.`);
    }

    const { width, height } = page.getSize();
    //console.log(" width : " + width)
    //console.log(" height : " + height)

    // Draw rectangles based on bounding boxes
    boundingBoxes.forEach((box) => {
      const { visLLX, visLLY, visURX, visURY } = box;
      page.drawRectangle({
        x: 435.0002951245123,
        y: 304.4398782239999, // Convert to PDF-lib's coordinate system
        width: 40,
        height: 10,
        borderColor: rgb(1, 0, 0),
        borderWidth: 1,
      });
    });

    const pdfBytesModified = await pdfDoc.save();
    fs.writeFileSync(outputPdfPath, pdfBytesModified);
  }
}
