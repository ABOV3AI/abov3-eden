/**
 * Type declarations for external modules without TypeScript types
 * These are placeholder declarations to allow TypeScript compilation
 */

// PDF libraries
declare module 'pdf-parse' {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    text: string;
    version: string;
  }
  function parse(dataBuffer: Buffer, options?: Record<string, unknown>): Promise<PDFData>;
  export = parse;
}

declare module 'pdf-lib' {
  export class PDFDocument {
    static load(data: Uint8Array | ArrayBuffer | string | Buffer): Promise<PDFDocument>;
    static create(): Promise<PDFDocument>;
    getPages(): PDFPage[];
    getPageCount(): number;
    getPageIndices(): number[];
    copyPages(srcDoc: PDFDocument, indices: number[]): Promise<PDFPage[]>;
    addPage(page?: PDFPage | [number, number]): PDFPage;
    removePage(index: number): void;
    save(): Promise<Uint8Array>;
    embedFont(font: StandardFonts | Uint8Array): Promise<PDFFont>;
    setTitle(title: string): void;
    setAuthor(author: string): void;
    setSubject(subject: string): void;
    setKeywords(keywords: string[]): void;
    setProducer(producer: string): void;
    setCreator(creator: string): void;
  }
  export class PDFPage {
    getSize(): { width: number; height: number };
    drawText(text: string, options: Record<string, unknown>): void;
  }
  export class PDFFont {
    widthOfTextAtSize(text: string, size: number): number;
  }
  export enum StandardFonts {
    Helvetica = 'Helvetica',
    HelveticaBold = 'Helvetica-Bold',
    TimesRoman = 'Times-Roman',
    Courier = 'Courier',
  }
  export function rgb(r: number, g: number, b: number): { type: string; red: number; green: number; blue: number };
}

// Excel library
declare module 'exceljs' {
  export class Workbook {
    xlsx: {
      readFile(filename: string): Promise<void>;
      writeFile(filename: string): Promise<void>;
      writeBuffer(): Promise<Buffer>;
    };
    addWorksheet(name: string): Worksheet;
    getWorksheet(id: number | string): Worksheet | undefined;
    worksheets: Worksheet[];
    eachSheet(callback: (worksheet: Worksheet, id: number) => void): void;
  }
  export interface Worksheet {
    name: string;
    rowCount: number;
    columnCount: number;
    columns: Column[];
    getRow(row: number): Row;
    getCell(ref: string): Cell;
    eachRow(options: { includeEmpty?: boolean }, callback: (row: Row, rowNumber: number) => void): void;
    eachRow(callback: (row: Row, rowNumber: number) => void): void;
    addRow(data: unknown[]): Row;
  }
  export interface Column {
    key?: string;
    header?: string;
    width?: number;
    eachCell?(options?: { includeEmpty?: boolean }, callback?: (cell: Cell, rowNumber: number) => void): void;
  }
  export interface Row {
    values: unknown[];
    getCell(col: number): Cell;
    eachCell(options: { includeEmpty?: boolean }, callback: (cell: Cell, colNumber: number) => void): void;
    font: any;
  }
  export interface Cell {
    value: unknown;
  }
}

// Word document library
declare module 'docx' {
  export class Document {
    constructor(options: Record<string, unknown>);
  }
  export class Packer {
    static toBuffer(doc: Document): Promise<Buffer>;
  }
  export class Paragraph {
    constructor(options: Record<string, unknown>);
  }
  export class TextRun {
    constructor(options: string | Record<string, unknown>);
  }
  export const HeadingLevel: {
    TITLE: string;
    HEADING_1: string;
    HEADING_2: string;
    HEADING_3: string;
    HEADING_4: string;
    HEADING_5: string;
    HEADING_6: string;
  };
  export class PageBreak {}
}

// CSV libraries
declare module 'csv-parse/sync' {
  export function parse(input: string | Buffer, options?: Record<string, unknown>): any[];
}

declare module 'csv-stringify/sync' {
  export function stringify(input: any[], options?: Record<string, unknown>): string;
}

// Image library
declare module 'sharp' {
  interface Sharp {
    metadata(): Promise<Metadata>;
    resize(width?: number, height?: number, options?: Record<string, unknown>): Sharp;
    extract(region: { left: number; top: number; width: number; height: number }): Sharp;
    rotate(angle?: number, options?: Record<string, unknown>): Sharp;
    flip(): Sharp;
    flop(): Sharp;
    toFormat(format: string, options?: Record<string, unknown>): Sharp;
    jpeg(options?: Record<string, unknown>): Sharp;
    png(options?: Record<string, unknown>): Sharp;
    webp(options?: Record<string, unknown>): Sharp;
    gif(options?: Record<string, unknown>): Sharp;
    tiff(options?: Record<string, unknown>): Sharp;
    avif(options?: Record<string, unknown>): Sharp;
    grayscale(): Sharp;
    blur(sigma?: number): Sharp;
    sharpen(sigma?: number, flat?: number, jagged?: number): Sharp;
    modulate(options: { brightness?: number; saturation?: number; hue?: number }): Sharp;
    composite(images: Array<{ input: Buffer | string; gravity?: string; blend?: string }>): Sharp;
    extend(options: Record<string, unknown>): Sharp;
    negate(options?: Record<string, unknown>): Sharp;
    toBuffer(): Promise<Buffer>;
    toFile(path: string): Promise<{ width: number; height: number; size: number }>;
  }
  interface Metadata {
    format?: string;
    width?: number;
    height?: number;
    space?: string;
    channels?: number;
    depth?: string;
    density?: number;
    hasAlpha?: boolean;
    orientation?: number;
    exif?: Buffer;
    isProgressive?: boolean;
    pages?: number;
    loop?: number;
    delay?: number[];
  }
  interface SharpOptions {
    create?: {
      width: number;
      height: number;
      channels: 3 | 4;
      background: { r: number; g: number; b: number; alpha?: number };
    };
  }
  function sharp(input?: Buffer | string, options?: SharpOptions): Sharp;
  export = sharp;
}

// QR Code library
declare module 'qrcode' {
  export function toFile(path: string, text: string, options?: Record<string, unknown>): Promise<void>;
  export function toBuffer(text: string, options?: Record<string, unknown>): Promise<Buffer>;
  export function toString(text: string, options?: Record<string, unknown>): Promise<string>;
}

// Barcode library
declare module 'bwip-js' {
  export function toBuffer(options: Record<string, unknown>): Promise<Buffer>;
}

// OCR library
declare module 'tesseract.js' {
  export function createWorker(lang?: string, oem?: number, options?: Record<string, unknown>): Promise<Worker>;
  export function recognize(image: string | Buffer, lang?: string, options?: Record<string, unknown>): Promise<{ data: { text: string; confidence: number } }>;
  export interface Worker {
    loadLanguage(lang: string): Promise<void>;
    initialize(lang: string): Promise<void>;
    recognize(image: string | Buffer): Promise<{ data: { text: string; confidence: number } }>;
    terminate(): Promise<void>;
  }
}

// FFmpeg library
declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    input(source: string): FfmpegCommand;
    inputOptions(options: string[]): FfmpegCommand;
    output(target: string): FfmpegCommand;
    outputOptions(options: string[]): FfmpegCommand;
    setStartTime(time: number | string): FfmpegCommand;
    setDuration(duration: number | string): FfmpegCommand;
    frames(count: number): FfmpegCommand;
    size(size: string): FfmpegCommand;
    noVideo(): FfmpegCommand;
    noAudio(): FfmpegCommand;
    audioFilters(filter: string): FfmpegCommand;
    videoFilters(filter: string): FfmpegCommand;
    audioBitrate(bitrate: string): FfmpegCommand;
    videoBitrate(bitrate: string): FfmpegCommand;
    audioFrequency(freq: number): FfmpegCommand;
    audioCodec(codec: string): FfmpegCommand;
    videoCodec(codec: string): FfmpegCommand;
    complexFilter(filters: string[]): FfmpegCommand;
    on(event: 'end', callback: () => void): FfmpegCommand;
    on(event: 'error', callback: (err: Error) => void): FfmpegCommand;
    on(event: 'progress', callback: (progress: Record<string, unknown>) => void): FfmpegCommand;
    run(): void;
  }
  function ffmpeg(input?: string): FfmpegCommand;
  namespace ffmpeg {
    function setFfmpegPath(path: string): void;
    function ffprobe(file: string, callback: (err: Error | null, data: Record<string, unknown>) => void): void;
  }
  export = ffmpeg;
}

declare module '@ffmpeg-installer/ffmpeg' {
  export const path: string;
}

// Web scraping libraries
declare module 'cheerio' {
  export function load(html: string, options?: Record<string, unknown>): CheerioAPI;
  export interface CheerioAPI {
    (selector: string): Cheerio;
    root(): Cheerio;
  }
  export interface Cheerio {
    text(): string;
    html(): string | null;
    attr(name: string): string | undefined;
    find(selector: string): Cheerio;
    first(): Cheerio;
    each(callback: (index: number, element: any) => void): Cheerio;
    map<T>(callback: (index: number, element: any) => T): CheerioMapResult<T>;
    get(): any[];
    length: number;
    slice(start: number, end?: number): Cheerio;
  }
  export interface CheerioMapResult<T> {
    get(): T[];
  }
}

declare module 'puppeteer' {
  export function launch(options?: Record<string, unknown>): Promise<Browser>;
  export interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }
  export interface Page {
    goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
    setViewport(viewport: { width: number; height: number }): Promise<void>;
    waitForSelector(selector: string, options?: Record<string, unknown>): Promise<unknown>;
    content(): Promise<string>;
    screenshot(options?: Record<string, unknown>): Promise<Buffer>;
    evaluate<T>(fn: () => T): Promise<T>;
  }
}

declare module 'marked' {
  export function parse(markdown: string): Promise<string>;
  export function setOptions(options: Record<string, unknown>): void;
}

declare module 'turndown' {
  class TurndownService {
    constructor(options?: Record<string, unknown>);
    turndown(html: string): string;
  }
  export = TurndownService;
}

// Template library
declare module 'handlebars' {
  export function compile(template: string): (data: Record<string, unknown>) => string;
  export function registerHelper(name: string, fn: Function): void;
  export function registerPartial(name: string, partial: string): void;
  const Handlebars: {
    compile: typeof compile;
    registerHelper: typeof registerHelper;
    registerPartial: typeof registerPartial;
  };
  export default Handlebars;
}

// Email library
declare module 'nodemailer' {
  export function createTransport(options: Record<string, unknown>): Transporter;
  export interface Transporter {
    sendMail(options: Record<string, unknown>): Promise<{
      messageId: string;
      accepted: string[];
      rejected: string[];
    }>;
  }
}

// Calendar library
declare module 'ical-generator' {
  interface ICalCalendar {
    createEvent(options: Record<string, unknown>): ICalEvent;
    toString(): string;
  }
  interface ICalEvent {
    organizer(org: Record<string, unknown>): ICalEvent;
    createAttendee(att: Record<string, unknown>): ICalEvent;
    createAlarm(alarm: Record<string, unknown>): ICalEvent;
    repeating(rule: Record<string, unknown>): ICalEvent;
  }
  function ical(options?: Record<string, unknown>): ICalCalendar;
  export { ical };
  export default ical;
}

// Code formatting libraries
declare module 'prettier' {
  export function format(source: string, options?: Record<string, unknown>): Promise<string>;
}

declare module 'terser' {
  export function minify(code: string, options?: Record<string, unknown>): Promise<{
    code?: string;
    map?: string;
  }>;
}

declare module 'diff' {
  export function createPatch(
    fileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: Record<string, unknown>
  ): string;
  export function applyPatch(str: string, patch: string): string | false;
  export function diffLines(oldStr: string, newStr: string): Array<{
    value: string;
    added?: boolean;
    removed?: boolean;
    count?: number;
  }>;
}

// AI library
declare module '@xenova/transformers' {
  export function pipeline(task: string, model: string): Promise<(input: string) => Promise<Array<{ label: string; score: number }>>>;
  export const env: {
    allowRemoteModels: boolean;
    allowLocalModels: boolean;
    useBrowserCache: boolean;
  };
}

// Math library
declare module 'mathjs' {
  export function evaluate(expr: string): unknown;
  export function simplify(expr: string, rules?: unknown[]): { toString(): string };
  export function derivative(expr: string, variable: string): { toString(): string };
  export function rationalize(expr: string): { toString(): string };
  export function typeOf(x: unknown): string;
  export function format(x: unknown, options?: Record<string, unknown>): string;
  export function matrix(arr: number[][]): Matrix;
  export function multiply(a: Matrix, b: Matrix): Matrix;
  export function add(a: Matrix, b: Matrix): Matrix;
  export function inv(a: Matrix): Matrix;
  export function det(a: Matrix): number;
  export function transpose(a: Matrix): Matrix;
  export function eigs(a: Matrix): { values: Matrix };
  export function mean(arr: number[]): number;
  export function std(arr: number[]): number;
  interface Matrix {
    toArray(): number[][];
  }
}

// Zip library
declare module 'adm-zip' {
  class AdmZip {
    constructor(path?: string | Buffer);
    getEntries(): Array<{ entryName: string; getData(): Buffer }>;
    readAsText(entryName: string, encoding?: string): string;
    extractAllTo(targetPath: string, overwrite?: boolean): void;
    addFile(entryName: string, content: Buffer, comment?: string): void;
    writeZip(targetFileName?: string): void;
  }
  export = AdmZip;
}
