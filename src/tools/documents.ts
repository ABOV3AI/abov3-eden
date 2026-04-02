/**
 * ABOV3 Eden - Document Tools
 * PDF and Office document manipulation (DOCX, XLSX, PPTX)
 */

import fs from 'fs/promises';
import path from 'path';
import type { MCPTool, ToolResult } from './index.js';
import { jsonResult, textResult, errorResult } from './index.js';

// ============================================================
// PDF Tools
// ============================================================

const pdfReadTextTool: MCPTool = {
  name: 'pdf_read_text',
  description: 'Extract text content from a PDF file.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the PDF file',
      },
      pages: {
        type: 'string',
        description: 'Page range to extract (e.g., "1-5", "1,3,5", or "all")',
        default: 'all',
      },
    },
    required: ['path'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: filePath, pages = 'all' } = args as { path: string; pages?: string };

    try {
      const resolvedPath = path.resolve(context.workingDirectory, filePath);
      const dataBuffer = await fs.readFile(resolvedPath);

      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(dataBuffer);

      return jsonResult({
        text: data.text,
        numPages: data.numpages,
        info: data.info,
        metadata: data.metadata,
      });
    } catch (error) {
      return errorResult(`Failed to read PDF: ${(error as Error).message}`);
    }
  },
};

const pdfInfoTool: MCPTool = {
  name: 'pdf_info',
  description: 'Get metadata and information about a PDF file.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the PDF file',
      },
    },
    required: ['path'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: filePath } = args as { path: string };

    try {
      const resolvedPath = path.resolve(context.workingDirectory, filePath);
      const dataBuffer = await fs.readFile(resolvedPath);

      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(dataBuffer);

      const stats = await fs.stat(resolvedPath);

      return jsonResult({
        fileName: path.basename(filePath),
        filePath: resolvedPath,
        fileSize: stats.size,
        numPages: data.numpages,
        info: data.info,
        metadata: data.metadata,
      });
    } catch (error) {
      return errorResult(`Failed to get PDF info: ${(error as Error).message}`);
    }
  },
};

const pdfMergeTool: MCPTool = {
  name: 'pdf_merge',
  description: 'Merge multiple PDF files into one.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'Array of PDF file paths to merge',
        items: { type: 'string' },
      },
      output: {
        type: 'string',
        description: 'Output file path for the merged PDF',
      },
    },
    required: ['files', 'output'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { files, output } = args as { files: string[]; output: string };

    try {
      const { PDFDocument } = await import('pdf-lib');
      const mergedPdf = await PDFDocument.create();

      for (const file of files) {
        const resolvedPath = path.resolve(context.workingDirectory, file);
        const pdfBytes = await fs.readFile(resolvedPath);
        const pdf = await PDFDocument.load(pdfBytes);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedPdfBytes = await mergedPdf.save();
      const outputPath = path.resolve(context.workingDirectory, output);
      await fs.writeFile(outputPath, mergedPdfBytes);

      return jsonResult({
        success: true,
        output: outputPath,
        pageCount: mergedPdf.getPageCount(),
        filesmerged: files.length,
      });
    } catch (error) {
      return errorResult(`Failed to merge PDFs: ${(error as Error).message}`);
    }
  },
};

const pdfSplitTool: MCPTool = {
  name: 'pdf_split',
  description: 'Split a PDF into separate pages or page ranges.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the PDF file to split',
      },
      outputDir: {
        type: 'string',
        description: 'Output directory for split pages',
      },
      ranges: {
        type: 'array',
        description: 'Page ranges to extract (e.g., ["1-3", "5", "7-10"]). If empty, splits into individual pages.',
        items: { type: 'string' },
      },
    },
    required: ['path', 'outputDir'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: filePath, outputDir, ranges } = args as {
      path: string;
      outputDir: string;
      ranges?: string[];
    };

    try {
      const { PDFDocument } = await import('pdf-lib');
      const resolvedPath = path.resolve(context.workingDirectory, filePath);
      const pdfBytes = await fs.readFile(resolvedPath);
      const pdf = await PDFDocument.load(pdfBytes);
      const totalPages = pdf.getPageCount();

      const outputDirPath = path.resolve(context.workingDirectory, outputDir);
      await fs.mkdir(outputDirPath, { recursive: true });

      const baseName = path.basename(filePath, '.pdf');
      const outputFiles: string[] = [];

      if (!ranges || ranges.length === 0) {
        // Split into individual pages
        for (let i = 0; i < totalPages; i++) {
          const newPdf = await PDFDocument.create();
          const [page] = await newPdf.copyPages(pdf, [i]);
          newPdf.addPage(page);
          const outputPath = path.join(outputDirPath, `${baseName}_page${i + 1}.pdf`);
          await fs.writeFile(outputPath, await newPdf.save());
          outputFiles.push(outputPath);
        }
      } else {
        // Split by ranges
        for (let idx = 0; idx < ranges.length; idx++) {
          const range = ranges[idx];
          const newPdf = await PDFDocument.create();
          const pageIndices = parsePageRange(range, totalPages);

          for (const pageIdx of pageIndices) {
            const [page] = await newPdf.copyPages(pdf, [pageIdx]);
            newPdf.addPage(page);
          }

          const outputPath = path.join(outputDirPath, `${baseName}_${range.replace(/[^0-9-]/g, '')}.pdf`);
          await fs.writeFile(outputPath, await newPdf.save());
          outputFiles.push(outputPath);
        }
      }

      return jsonResult({
        success: true,
        totalPages,
        outputFiles,
        outputCount: outputFiles.length,
      });
    } catch (error) {
      return errorResult(`Failed to split PDF: ${(error as Error).message}`);
    }
  },
};

const pdfCreateTool: MCPTool = {
  name: 'pdf_create',
  description: 'Create a simple PDF from text content.',
  inputSchema: {
    type: 'object',
    properties: {
      output: {
        type: 'string',
        description: 'Output file path',
      },
      content: {
        type: 'string',
        description: 'Text content for the PDF',
      },
      title: {
        type: 'string',
        description: 'Document title',
      },
      fontSize: {
        type: 'number',
        description: 'Font size (default: 12)',
        default: 12,
      },
    },
    required: ['output', 'content'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { output, content, title, fontSize = 12 } = args as {
      output: string;
      content: string;
      title?: string;
      fontSize?: number;
    };

    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();

      if (title) {
        pdfDoc.setTitle(title);
      }

      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const margin = 50;
      const lineHeight = fontSize * 1.5;
      const pageWidth = 612;
      const pageHeight = 792;
      const contentWidth = pageWidth - margin * 2;

      const lines = wrapText(content, font, fontSize, contentWidth);
      let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      let y = pageHeight - margin;

      for (const line of lines) {
        if (y < margin + lineHeight) {
          currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }

        currentPage.drawText(line, {
          x: margin,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
        y -= lineHeight;
      }

      const pdfBytes = await pdfDoc.save();
      const outputPath = path.resolve(context.workingDirectory, output);
      await fs.writeFile(outputPath, pdfBytes);

      return jsonResult({
        success: true,
        output: outputPath,
        pageCount: pdfDoc.getPageCount(),
        fileSize: pdfBytes.length,
      });
    } catch (error) {
      return errorResult(`Failed to create PDF: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Excel (XLSX) Tools
// ============================================================

const xlsxReadTool: MCPTool = {
  name: 'xlsx_read',
  description: 'Read an Excel spreadsheet and return data as JSON.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the Excel file',
      },
      sheet: {
        type: 'string',
        description: 'Sheet name or index (default: first sheet)',
      },
      headers: {
        type: 'boolean',
        description: 'Treat first row as headers (default: true)',
        default: true,
      },
    },
    required: ['path'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: filePath, sheet, headers = true } = args as {
      path: string;
      sheet?: string;
      headers?: boolean;
    };

    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const resolvedPath = path.resolve(context.workingDirectory, filePath);
      await workbook.xlsx.readFile(resolvedPath);

      let worksheet: any;
      if (sheet) {
        worksheet = workbook.getWorksheet(sheet) || workbook.getWorksheet(parseInt(sheet));
      } else {
        worksheet = workbook.worksheets[0];
      }

      if (!worksheet) {
        return errorResult('Worksheet not found');
      }

      const data: Record<string, unknown>[] = [];
      let headerRow: string[] = [];

      worksheet.eachRow((row: any, rowNumber: number) => {
        const rowData: (string | number | boolean | null)[] = [];
        row.eachCell({ includeEmpty: true }, (cell: any) => {
          rowData.push(cell.value);
        });

        if (headers && rowNumber === 1) {
          headerRow = rowData.map((v) => String(v || `Col${rowData.indexOf(v)}`));
        } else {
          if (headers) {
            const obj: Record<string, unknown> = {};
            headerRow.forEach((h, i) => {
              obj[h] = rowData[i] ?? null;
            });
            data.push(obj);
          } else {
            data.push({ row: rowNumber, values: rowData });
          }
        }
      });

      return jsonResult({
        sheetName: worksheet.name,
        rowCount: data.length,
        columnCount: headerRow.length || (data[0] as any)?.values?.length || 0,
        headers: headers ? headerRow : undefined,
        data,
      });
    } catch (error) {
      return errorResult(`Failed to read Excel: ${(error as Error).message}`);
    }
  },
};

const xlsxCreateTool: MCPTool = {
  name: 'xlsx_create',
  description: 'Create an Excel spreadsheet from JSON data.',
  inputSchema: {
    type: 'object',
    properties: {
      output: {
        type: 'string',
        description: 'Output file path',
      },
      data: {
        type: 'array',
        description: 'Array of objects to write (keys become headers)',
        items: { type: 'object' },
      },
      sheetName: {
        type: 'string',
        description: 'Name of the worksheet',
        default: 'Sheet1',
      },
    },
    required: ['output', 'data'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { output, data, sheetName = 'Sheet1' } = args as {
      output: string;
      data: Record<string, unknown>[];
      sheetName?: string;
    };

    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(sheetName);

      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        worksheet.addRow(headers);

        // Style header row
        worksheet.getRow(1).font = { bold: true };

        for (const item of data) {
          const row = headers.map((h) => item[h]);
          worksheet.addRow(row);
        }

        // Auto-fit columns
        worksheet.columns.forEach((column) => {
          let maxLength = 10;
          column.eachCell?.({ includeEmpty: true }, (cell) => {
            const cellLength = cell.value ? String(cell.value).length : 0;
            if (cellLength > maxLength) maxLength = cellLength;
          });
          column.width = Math.min(maxLength + 2, 50);
        });
      }

      const outputPath = path.resolve(context.workingDirectory, output);
      await workbook.xlsx.writeFile(outputPath);

      return jsonResult({
        success: true,
        output: outputPath,
        rowCount: data.length,
        sheetName,
      });
    } catch (error) {
      return errorResult(`Failed to create Excel: ${(error as Error).message}`);
    }
  },
};

const xlsxQueryTool: MCPTool = {
  name: 'xlsx_query',
  description: 'Query Excel data with filters and return matching rows.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the Excel file',
      },
      sheet: {
        type: 'string',
        description: 'Sheet name (default: first sheet)',
      },
      filter: {
        type: 'object',
        description: 'Filter conditions as key-value pairs (column: value)',
      },
      columns: {
        type: 'array',
        description: 'Columns to return (default: all)',
        items: { type: 'string' },
      },
      limit: {
        type: 'number',
        description: 'Maximum rows to return',
      },
    },
    required: ['path'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: filePath, sheet, filter, columns, limit } = args as {
      path: string;
      sheet?: string;
      filter?: Record<string, unknown>;
      columns?: string[];
      limit?: number;
    };

    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const resolvedPath = path.resolve(context.workingDirectory, filePath);
      await workbook.xlsx.readFile(resolvedPath);

      let worksheet: any = sheet
        ? workbook.getWorksheet(sheet)
        : workbook.worksheets[0];

      if (!worksheet) {
        return errorResult('Worksheet not found');
      }

      const headers: string[] = [];
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell: any, colNumber: number) => {
        headers[colNumber - 1] = String(cell.value || `Col${colNumber}`);
      });

      const results: Record<string, unknown>[] = [];
      let count = 0;

      worksheet.eachRow((row: any, rowNumber: number) => {
        if (rowNumber === 1) return; // Skip header
        if (limit && count >= limit) return;

        const rowData: Record<string, unknown> = {};
        row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
          const header = headers[colNumber - 1];
          if (header) rowData[header] = cell.value;
        });

        // Apply filter
        if (filter) {
          const matches = Object.entries(filter).every(([key, value]) => {
            return rowData[key] === value;
          });
          if (!matches) return;
        }

        // Select columns
        if (columns && columns.length > 0) {
          const filteredRow: Record<string, unknown> = {};
          columns.forEach((col) => {
            filteredRow[col] = rowData[col];
          });
          results.push(filteredRow);
        } else {
          results.push(rowData);
        }

        count++;
      });

      return jsonResult({
        rowCount: results.length,
        data: results,
      });
    } catch (error) {
      return errorResult(`Failed to query Excel: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Word (DOCX) Tools
// ============================================================

const docxReadTool: MCPTool = {
  name: 'docx_read',
  description: 'Read text content from a Word document.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the Word document',
      },
    },
    required: ['path'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: filePath } = args as { path: string };

    try {
      const resolvedPath = path.resolve(context.workingDirectory, filePath);
      const buffer = await fs.readFile(resolvedPath);

      // Simple extraction - docx files are ZIP archives with XML
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(buffer);
      const documentXml = zip.readAsText('word/document.xml');

      // Extract text from XML (basic extraction)
      const textContent = documentXml
        .replace(/<w:p[^>]*>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .trim();

      return jsonResult({
        text: textContent,
        fileName: path.basename(filePath),
      });
    } catch (error) {
      return errorResult(`Failed to read Word document: ${(error as Error).message}`);
    }
  },
};

const docxCreateTool: MCPTool = {
  name: 'docx_create',
  description: 'Create a Word document from text or structured content.',
  inputSchema: {
    type: 'object',
    properties: {
      output: {
        type: 'string',
        description: 'Output file path',
      },
      content: {
        type: 'string',
        description: 'Text content (paragraphs separated by newlines)',
      },
      title: {
        type: 'string',
        description: 'Document title',
      },
    },
    required: ['output', 'content'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { output, content, title } = args as {
      output: string;
      content: string;
      title?: string;
    };

    try {
      const docx = await import('docx');
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;

      const paragraphs: any[] = [];

      if (title) {
        paragraphs.push(
          new Paragraph({
            text: title,
            heading: HeadingLevel.TITLE,
          })
        );
      }

      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          paragraphs.push(
            new Paragraph({
              children: [new TextRun(line)],
            })
          );
        }
      }

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: paragraphs,
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      const outputPath = path.resolve(context.workingDirectory, output);
      await fs.writeFile(outputPath, buffer);

      return jsonResult({
        success: true,
        output: outputPath,
        paragraphCount: paragraphs.length,
      });
    } catch (error) {
      return errorResult(`Failed to create Word document: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// CSV to Excel Conversion
// ============================================================

const csvToXlsxTool: MCPTool = {
  name: 'csv_to_xlsx',
  description: 'Convert a CSV file to Excel format.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Path to the CSV file',
      },
      output: {
        type: 'string',
        description: 'Output Excel file path',
      },
      delimiter: {
        type: 'string',
        description: 'CSV delimiter (default: comma)',
        default: ',',
      },
    },
    required: ['input', 'output'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { input, output, delimiter = ',' } = args as {
      input: string;
      output: string;
      delimiter?: string;
    };

    try {
      const { parse } = await import('csv-parse/sync');
      const ExcelJS = await import('exceljs');

      const inputPath = path.resolve(context.workingDirectory, input);
      const csvContent = await fs.readFile(inputPath, 'utf-8');

      const records = parse(csvContent, {
        delimiter,
        columns: true,
        skip_empty_lines: true,
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sheet1');

      if (records.length > 0) {
        const headers = Object.keys(records[0]);
        worksheet.addRow(headers);
        worksheet.getRow(1).font = { bold: true };

        for (const record of records) {
          worksheet.addRow(Object.values(record));
        }
      }

      const outputPath = path.resolve(context.workingDirectory, output);
      await workbook.xlsx.writeFile(outputPath);

      return jsonResult({
        success: true,
        input: inputPath,
        output: outputPath,
        rowCount: records.length,
      });
    } catch (error) {
      return errorResult(`Failed to convert CSV to Excel: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Helper Functions
// ============================================================

function parsePageRange(range: string, totalPages: number): number[] {
  const indices: number[] = [];

  const parts = range.split(',').map((p) => p.trim());
  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map((n) => parseInt(n));
      for (let i = start - 1; i < Math.min(end, totalPages); i++) {
        if (i >= 0 && i < totalPages && !indices.includes(i)) {
          indices.push(i);
        }
      }
    } else {
      const pageNum = parseInt(part) - 1;
      if (pageNum >= 0 && pageNum < totalPages && !indices.includes(pageNum)) {
        indices.push(pageNum);
      }
    }
  }

  return indices;
}

function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);

      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

// ============================================================
// Export all document tools
// ============================================================
export const documentTools: MCPTool[] = [
  pdfReadTextTool,
  pdfInfoTool,
  pdfMergeTool,
  pdfSplitTool,
  pdfCreateTool,
  xlsxReadTool,
  xlsxCreateTool,
  xlsxQueryTool,
  docxReadTool,
  docxCreateTool,
  csvToXlsxTool,
];
