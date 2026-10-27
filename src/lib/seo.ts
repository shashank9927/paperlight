import { brand } from './brand';
import { tools } from './tools';
import type { ToolId } from './tools';

export const siteOrigin = brand.origin;
export interface SeoPage {
  kind: 'home' | 'tool' | 'comparison';
  path: string;
  title: string;
  description: string;
  steps: string[];
  features: string[];
  limitations: string;
  faqs: { question: string; answer: string }[];
  related: ToolId[];
}

type ToolContent = Pick<SeoPage, 'steps' | 'features' | 'limitations' | 'related'>;
const content: Record<ToolId, ToolContent> = {
  merge: {
    steps: [
      'Choose two or more PDF files from your device.',
      'Arrange files in your preferred order and rotate pages if needed.',
      'Merge the PDFs and download the combined document.',
    ],
    features: [
      'Multiple files with previews',
      'Manual or alphabetical ordering',
      'Page rotation before merging',
    ],
    limitations:
      'Bookmarks, tags, internal links, form fields, layers and embedded files are retained for supported documents. Encrypted files need their password. Editing a PDF may invalidate existing certificate signatures.',
    related: ['split', 'organize', 'compress'],
  },
  split: {
    steps: [
      'Choose a PDF and inspect its pages.',
      'Select custom ranges, fixed page groups, individual pages, or a maximum output size.',
      'Split the document and download the resulting PDF or ZIP.',
    ],
    features: [
      'Custom page groups and page extraction',
      'Fixed page counts',
      'Size limits measured from actual output bytes',
    ],
    limitations:
      'A single page that exceeds the selected size limit is reported explicitly. Compression is optional and must be selected.',
    related: ['merge', 'organize', 'compress'],
  },
  compress: {
    steps: [
      'Choose one or more PDFs.',
      'Keep lossless optimization or explicitly choose an image-compression level.',
      'Compress locally, review the actual savings, and download your results.',
    ],
    features: [
      'Lossless optimization by default',
      'Three image quality levels preserving text and vectors',
      'Batch processing with per-file results',
    ],
    limitations:
      'Some PDFs cannot be made smaller. The original is kept when optimization does not help. Advanced whole-page rasterization removes selectable text and interactive content.',
    related: ['split', 'merge', 'pdf-to-images'],
  },
  organize: {
    steps: [
      'Choose one or more PDFs to open their pages.',
      'Reorder, rotate, duplicate, delete, or insert pages using the page controls.',
      'Save the organized PDF or extract the pages you need.',
    ],
    features: [
      'Import pages and insert blank pages',
      'Keyboard and button alternatives to dragging',
      'Undo and redo page changes',
    ],
    limitations:
      'Some complex document structures are rejected to protect content preservation. Keep your original documents.',
    related: ['merge', 'split', 'rotate'],
  },
  rotate: {
    steps: [
      'Choose one or more PDF files.',
      'Select pages or ranges and rotate left or right; optionally target portrait or landscape pages.',
      'Preview the orientation and download the rotated PDFs.',
    ],
    features: [
      'Individual page and file rotation',
      'Page ranges and orientation targeting',
      'Reset rotation before exporting',
    ],
    limitations:
      'Rotation changes page orientation. It does not straighten skewed scans or edit the text inside a page.',
    related: ['organize', 'merge', 'images-to-pdf'],
  },
  'images-to-pdf': {
    steps: [
      'Choose JPEG, PNG, or WebP images.',
      'Arrange and rotate images, then choose page size, orientation, margins, and image fit.',
      'Download a combined PDF or separate PDFs.',
    ],
    features: [
      'JPEG, PNG, and WebP input',
      'Page size, margins, orientation, and image fit',
      'Combined or separate output',
    ],
    limitations:
      'Images must fit the app’s image and memory limits. This tool does not perform OCR or make image text selectable.',
    related: ['pdf-to-images', 'merge', 'rotate'],
  },
  'pdf-to-images': {
    steps: [
      'Choose one or more PDFs.',
      'Select page rendering or embedded-image extraction and configure the output.',
      'Download clearly named PNG or JPEG images in a ZIP.',
    ],
    features: [
      'Render selected pages as PNG or JPEG',
      'Resolution and JPEG quality controls',
      'Extract supported embedded images',
    ],
    limitations:
      'Page images do not preserve selectable text, links, forms, bookmarks, or attachments. Embedded-image extraction depends on supported PDF image structures.',
    related: ['images-to-pdf', 'split', 'compress'],
  },
  watermark: {
    steps: [
      'Choose one or more PDFs.',
      'Add a text or image watermark and set its appearance, page range, position, and layer.',
      'Preview placement and download the watermarked PDFs.',
    ],
    features: [
      'Text and image watermarks',
      'Opacity, rotation, positioning, and tiled repetition',
      'Above or below existing content',
    ],
    limitations:
      'Bundled text fonts support Latin, Greek, and Cyrillic. Unsupported glyphs are rejected rather than silently substituted.',
    related: ['page-numbers', 'sign', 'protect'],
  },
  'page-numbers': {
    steps: [
      'Choose one or more PDFs.',
      'Set the starting number, page range, cover handling, layout, and number template.',
      'Preview the numbering and download the updated PDFs.',
    ],
    features: [
      'Single and facing-page layouts',
      'Cover-page exclusion and custom templates',
      'Font, position, and margin controls',
    ],
    limitations:
      'An excluded cover does not advance the counter. Templates support {n} for the current counter, {p} for document pages, {r} for selected pages, and {rf} for the final counter.',
    related: ['organize', 'watermark', 'merge'],
  },
  protect: {
    steps: [
      'Choose the PDFs you want to protect.',
      'Enter and confirm an opening password, then optionally configure owner permissions.',
      'Download the AES-256 encrypted PDFs and keep your password safe.',
    ],
    features: [
      'AES-256 opening-password protection',
      'Advanced owner-password permissions',
      'Batch protection without uploading documents',
    ],
    limitations:
      'Printing, copying, and editing permissions depend on PDF viewer enforcement. Havisu PDF cannot recover a forgotten password.',
    related: ['unlock', 'watermark', 'sign'],
  },
  unlock: {
    steps: [
      'Choose one or more encrypted PDFs.',
      'Enter the current password for each file when requested.',
      'Download verified, unencrypted copies of successfully unlocked files.',
    ],
    features: [
      'Per-file password prompts',
      'Permissions-only encryption handling',
      'Batch results with explicit file failures',
    ],
    limitations:
      'This tool does not crack unknown opening passwords. Only unlock documents you have permission to modify.',
    related: ['protect', 'merge', 'organize'],
  },
  sign: {
    steps: [
      'Choose a PDF and draw, type, or upload your signature.',
      'Place signatures, initials, text, dates, or stamps and adjust their size and rotation.',
      'Preview your fields and download the signed PDF.',
    ],
    features: [
      'Drawn, typed, and uploaded signatures',
      'Multiple fields with resize, rotation, duplication, and undo',
      'Repeat fields across selected pages',
    ],
    limitations:
      'Signatures are visual marks. Havisu PDF does not verify identities, request signatures from others, or create certified digital signatures.',
    related: ['watermark', 'page-numbers', 'protect'],
  },
};

export const homeSeo: SeoPage = {
  kind: 'home',
  path: '/',
  title: 'Free PDF Tools — Merge, Split, Compress & Edit | Havisu PDF',
  description:
    'Merge, split, compress, convert and sign PDFs for free with Havisu PDF. Twelve private PDF tools that process your files in your browser. No account needed.',
  steps: [],
  features: [],
  limitations: '',
  related: [],
  faqs: [
    {
      question: 'Is Havisu PDF an iLovePDF alternative?',
      answer:
        'Havisu PDF is an independent alternative for twelve common PDF workflows, including merging, splitting, compression, conversion, and visual signing. Files are processed on your device. It is not affiliated with iLovePDF and does not offer every iLovePDF feature, such as cloud services or signature requests.',
    },
  ],
};

export const alternativeSeo: SeoPage = {
  kind: 'comparison',
  path: '/alternatives/ilovepdf',
  title: 'iLovePDF Alternative for Private PDF Tools | Havisu PDF',
  description:
    'Compare Havisu PDF’s twelve free, local PDF workflows with the broader iLovePDF suite. Merge, split, compress and sign without uploading your documents.',
  steps: [
    'Choose a supported PDF tool for your task.',
    'Select files from your device and review the available settings.',
    'Process locally and download the result.',
  ],
  features: [
    'Twelve PDF workflows with no document uploads or account required',
    'Lossless compression by default, with explicit image-quality controls',
    'Local previews, batch results, and offline use after the required assets load',
  ],
  limitations:
    'Havisu PDF does not provide Office conversion, OCR, cloud imports, signature requests or certified signing. Jobs share 100 MB input and 500-page limits, with additional memory and image ceilings. Unsupported document structures are rejected rather than silently removed.',
  related: ['merge', 'split', 'compress'],
  faqs: [
    {
      question: 'Is Havisu PDF affiliated with iLovePDF?',
      answer:
        'No. Havisu PDF is an independent PDF application. iLovePDF is a separate service with its own tools, terms and security policies.',
    },
    {
      question: 'Does Havisu PDF replace every iLovePDF feature?',
      answer:
        'No. Havisu PDF focuses on twelve local workflows. The iLovePDF suite also lists Office conversions, OCR and requests for signatures, which Havisu PDF does not offer.',
    },
    {
      question: 'Can I process PDFs offline?',
      answer:
        'Once the application and required tool assets are loaded, supported workflows run offline. Document processing uses your browser’s resources; limits and browser capabilities still apply.',
    },
  ],
};

const specificFaq: Record<ToolId, { question: string; answer: string }> = {
  merge: {
    question: 'Can I merge PDFs without uploading them?',
    answer:
      'Yes. Choose two or more files, order and rotate them, and merge in your browser. Supported bookmarks, accessibility tags and internal links are mapped into the combined PDF. Unsupported structures are identified before a download is offered.',
  },
  split: {
    question: 'Can I split a PDF into files below a size limit?',
    answer:
      'Use Maximum file size to measure actual serialized PDF bytes. A page that cannot fit alone is reported explicitly. Optional image compression requires your selection. Internal links to excluded pages may require a different grouping to preserve navigation.',
  },
  compress: {
    question: 'Can I reduce PDF size while keeping selectable text?',
    answer:
      'Lossless optimization keeps text and vectors. The three image-optimization levels also retain them while reducing embedded-image quality. Whole-page rasterization is a separate advanced choice that removes selectable text. If output is larger, Havisu PDF keeps the exact original.',
  },
  organize: {
    question: 'Can I combine, duplicate and reorder PDF pages?',
    answer:
      'Import multiple PDFs, insert blank pages, reorder, rotate, duplicate or delete pages, and undo or redo changes. Links and accessibility relationships are remapped where supported. A selection that leaves unresolved destinations is rejected.',
  },
  rotate: {
    question: 'Can I rotate only landscape or selected PDF pages?',
    answer:
      'Choose a page range or target portrait/landscape pages, rotate left or right, and preview the result. Page rotation changes orientation; it does not deskew scanned content.',
  },
  'images-to-pdf': {
    question: 'Can I turn JPG, PNG and WebP into one PDF?',
    answer:
      'Yes. Arrange and rotate supported still images, select page size, orientation, margins and fit, then download combined or separate PDFs. Transparent PNG artwork is retained.',
  },
  'pdf-to-images': {
    question: 'What is the difference between rendering pages and extracting images?',
    answer:
      'Rendering creates a complete PNG or JPEG of each selected page. Extraction exports supported embedded image data instead of text or vector artwork. PNG can retain image transparency; JPEG uses a white background.',
  },
  watermark: {
    question: 'Can I add a text or image watermark to multiple PDFs?',
    answer:
      'Yes. Choose text or artwork, position, size, opacity, rotation and selected pages. You can repeat a watermark in a tile pattern and place it above or below existing content.',
  },
  'page-numbers': {
    question: 'Can numbering skip a cover page and use a custom format?',
    answer:
      'Yes. Exclude the cover, set the starting counter and selected range, then use {n}, {p}, {r} and {rf} for the current counter, document pages, selected pages and final counter. The excluded cover does not advance numbering.',
  },
  protect: {
    question: 'Does PDF password protection prevent copying in every viewer?',
    answer:
      'An opening password uses AES-256 encryption. Optional owner permissions request restrictions on printing, copying and editing, but enforcement depends on the PDF viewer. They cannot prevent screenshots.',
  },
  unlock: {
    question: 'Can Havisu PDF unlock a PDF if I forgot its password?',
    answer:
      'No. Supply the current opening password when required. Permissions-only encryption can open with an empty user password. Successful outputs are verified as unencrypted copies.',
  },
  sign: {
    question: 'Is a signature added here a certified digital signature?',
    answer:
      'No. Draw, type or upload a visual signature and add independently positioned initials, name, date, text or stamp fields. Havisu PDF does not certify identity or request signatures from other people.',
  },
};

export const seoPages: SeoPage[] = [
  homeSeo,
  ...tools.map((tool): SeoPage => ({
    kind: 'tool',
    path: `/tools/${tool.id}`,
    title: `${tool.title === 'Page numbers' ? 'Add PDF Page Numbers' : tool.title === 'PDF to images' ? 'PDF to JPG & PNG' : tool.title} Online Free | Havisu PDF`,
    description: `${tool.detail} Free, private processing in your browser with Havisu PDF. No document uploads or account required.`,
    ...content[tool.id],
    faqs: [
      specificFaq[tool.id],
      {
        question: 'Are my documents uploaded?',
        answer:
          'No. Document processing happens in your browser. Files, passwords, signatures, and editing history are not uploaded or stored by Havisu PDF. The public site uses Vercel Web Analytics for page-view statistics.',
      },
      {
        question: 'What limits should I know about?',
        answer: `${content[tool.id].limitations} Jobs accept up to 100 MB of combined input and 500 pages, subject to additional image and memory limits.`,
      },
    ],
  })),
  alternativeSeo,
];

export function seoForPath(path: string) {
  return seoPages.find(
    (page) => page.path === path.replace(/\/$/, '') || (page.path === '/' && path === '/'),
  );
}

export function structuredData(page: SeoPage) {
  const application = {
    '@type': page.kind === 'comparison' ? 'WebPage' : 'WebApplication',
    '@id': `${siteOrigin}${page.path}#${page.kind === 'comparison' ? 'page' : 'application'}`,
    name:
      page.kind === 'comparison'
        ? `${brand.productName} as an iLovePDF alternative`
        : page.path === '/'
          ? brand.productName
          : tools.find((tool) => page.path.endsWith(`/${tool.id}`))?.title,
    url: `${siteOrigin}${page.path}`,
    description: page.description,
    ...(page.kind === 'comparison'
      ? {}
      : { applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web browser' }),
    isAccessibleForFree: true,
  };
  return {
    '@context': 'https://schema.org',
    '@graph':
      page.path === '/'
        ? [
            {
              '@type': 'WebSite',
              '@id': `${siteOrigin}/#website`,
              name: brand.productName,
              url: `${siteOrigin}/`,
            },
            application,
          ]
        : [
            application,
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                {
                  '@type': 'ListItem',
                  position: 1,
                  name: brand.productName,
                  item: `${siteOrigin}/`,
                },
                { '@type': 'ListItem', position: 2, name: application.name, item: application.url },
              ],
            },
          ],
  };
}
