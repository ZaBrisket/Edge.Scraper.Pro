declare module 'docx' {
  import { Buffer } from 'node:buffer';

  export class Document {
    constructor(options?: any);
  }

  export class Paragraph {
    constructor(options?: any);
  }

  export class TextRun {
    constructor(options?: any);
  }

  export class Packer {
    static toBuffer(document: Document): Promise<Buffer>;
  }
}
