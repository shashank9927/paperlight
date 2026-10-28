import type { ToolId } from './tools';

export interface ToolSearchContent {
  title: string;
  description: string;
  heading: string;
  introduction: string;
  example: string;
  troubleshooting: string;
}

export const toolSearchContent: Record<ToolId, ToolSearchContent> = {
  merge: {
    title: 'Merge PDF Files Online Free | Havisu PDF',
    description:
      'Combine PDF files in your chosen order. Preview and rotate pages, then merge locally in your browser without uploading documents.',
    heading: 'Merge PDF',
    introduction: 'Combine related PDFs into one document while controlling their order.',
    example:
      'For a report and its appendix, add both PDFs and move the appendix after the report before merging.',
    troubleshooting:
      'If a file asks for a password, enter its current password. Some complex structures cannot be safely preserved and are reported before export.',
  },
  split: {
    title: 'Split PDF & Extract Pages Online Free | Havisu PDF',
    description:
      'Split a PDF into page ranges, separate pages, or size-limited files. Extract selected pages privately in your browser.',
    heading: 'Split PDF',
    introduction: 'Extract the pages you need or divide a long PDF into smaller documents.',
    example:
      'To keep pages 1 through 8 together, choose Extract into one PDF and enter 1-8 in Pages.',
    troubleshooting:
      'If a page cannot fit within a maximum file size on its own, choose a larger limit or explicitly enable compression.',
  },
  compress: {
    title: 'Compress PDF Online Free | Havisu PDF',
    description:
      'Reduce PDF file size with lossless optimization or selectable image quality. Check actual savings and process files locally.',
    heading: 'Compress PDF',
    introduction: 'Reduce document size while choosing how images are handled.',
    example:
      'Start with lossless optimization; if an image-heavy document remains too large, choose an image compression level.',
    troubleshooting:
      'Some PDFs are already optimized. When a result is larger, the original is kept. Whole-page rasterization is separate and removes selectable text.',
  },
  organize: {
    title: 'Organize PDF Pages Online Free | Havisu PDF',
    description:
      'Reorder, rotate, duplicate, delete and insert PDF pages. Combine pages from multiple PDFs on your device.',
    heading: 'Organize PDF',
    introduction: 'Rearrange pages, combine documents, and remove pages you no longer need.',
    example:
      'Add two PDFs, move pages into the desired order, and use the page controls to remove an unwanted page.',
    troubleshooting:
      'Use Undo to reverse a page edit. Links to excluded pages are deactivated; unsupported structures are reported instead of silently removed.',
  },
  rotate: {
    title: 'Rotate PDF Pages Online Free | Havisu PDF',
    description:
      'Rotate selected PDF pages or whole files, target portrait or landscape pages, and preview your results locally.',
    heading: 'Rotate PDF',
    introduction: 'Correct page orientation across one or more PDF files.',
    example: 'Enter 2 in Pages and choose 90° to rotate the second page clockwise.',
    troubleshooting:
      'Page rotation changes orientation but does not straighten a skewed scan. Reset rotation before processing if needed.',
  },
  'images-to-pdf': {
    title: 'JPG, PNG & WebP to PDF Online Free | Havisu PDF',
    description:
      'Convert JPG, PNG and WebP images to a PDF. Arrange images and choose page size, margins and fit in your browser.',
    heading: 'Images to PDF',
    introduction: 'Turn one or more JPEG, PNG or WebP images into PDF documents.',
    example:
      'Add photos, select A4 under Page size, and use Contain under Image fit to show each whole image.',
    troubleshooting:
      'Choose Contain if Cover crops the image. Image text remains an image; this tool does not perform OCR.',
  },
  'pdf-to-images': {
    title: 'PDF to JPG or PNG & Extract Images | Havisu PDF',
    description:
      'Render PDF pages as JPG or PNG, or extract supported embedded images. Choose pages and image quality locally.',
    heading: 'PDF to images',
    introduction: 'Create images of complete PDF pages or extract supported embedded artwork.',
    example: 'Enter 1-2 in Pages and choose PNG to render the first two pages as images.',
    troubleshooting:
      'Rendering creates a picture of the whole page; extraction returns supported embedded images and may not find artwork drawn as vectors.',
  },
  watermark: {
    title: 'Add Watermark to PDF Online Free | Havisu PDF',
    description:
      'Add text or image watermarks to PDF pages. Adjust position, opacity and rotation without uploading files.',
    heading: 'Watermark PDF',
    introduction: 'Place a text or image watermark on selected pages of one or more PDFs.',
    example:
      'Enter a watermark such as DRAFT, set its opacity, and choose the pages and position before processing.',
    troubleshooting:
      'A watermark placed below opaque page content can be hidden. Choose above content when it must remain visible.',
  },
  'page-numbers': {
    title: 'Add Page Numbers to PDF Online Free | Havisu PDF',
    description:
      'Number PDF pages with custom starting numbers, positions and cover-page handling. Preview and process locally.',
    heading: 'Page numbers',
    introduction: 'Add consistent page numbers to a PDF, including documents with a cover.',
    example:
      'Exclude the cover and set Start numbering at to 1 so the first numbered page starts at one.',
    troubleshooting:
      'An excluded cover does not advance the counter. Check your selected range and preview if numbering is not where expected.',
  },
  protect: {
    title: 'Password Protect PDF Online Free | Havisu PDF',
    description:
      'Protect PDF files with AES-256 opening passwords and optional owner permissions. Files stay on your device.',
    heading: 'Protect PDF',
    introduction: 'Add an opening password or configure supported PDF permission controls.',
    example:
      'Enter and confirm an opening password, then download the protected copy and keep the password safe.',
    troubleshooting:
      'Passwords must match. Permission restrictions depend on the PDF viewer and do not prevent screenshots.',
  },
  unlock: {
    title: 'Unlock PDF with a Known Password | Havisu PDF',
    description:
      'Remove PDF encryption using the current password, with per-file prompts and verified unencrypted results.',
    heading: 'Unlock PDF',
    introduction: 'Create an unencrypted copy when you know the PDF’s opening password.',
    example:
      'Select an encrypted PDF, enter its existing password when prompted, and download the unlocked copy.',
    troubleshooting:
      'Check the current password if opening fails. Havisu PDF cannot recover or crack forgotten passwords.',
  },
  sign: {
    title: 'Sign PDF Online with a Visual Signature | Havisu PDF',
    description:
      'Draw, type or upload a visual signature and place it on PDF pages privately in your browser.',
    heading: 'Sign PDF',
    introduction: 'Place visual signatures, initials, dates or text fields on a PDF.',
    example: 'Draw a signature, position it on the page, and preview its size before downloading.',
    troubleshooting:
      'These are visual marks, not certified digital signatures. Existing cryptographic signatures may become invalid after editing.',
  },
};
