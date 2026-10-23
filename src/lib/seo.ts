import { tools } from './tools';
import type { ToolId } from './tools';

export const siteOrigin = 'https://paperlight-kappa.vercel.app';
export interface SeoPage {
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
      'Documents with forms, bookmarks, attachments, tags, or internal links may be rejected when safe preservation is unsupported.',
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
      'Printing, copying, and editing permissions depend on PDF viewer enforcement. Paperlight cannot recover a forgotten password.',
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
      'Signatures are visual marks. Paperlight does not verify identities, request signatures from others, or create certified digital signatures.',
    related: ['watermark', 'page-numbers', 'protect'],
  },
};

export const homeSeo: SeoPage = {
  path: '/',
  title: 'Free PDF Tools — Merge, Split, Compress & Edit | Paperlight',
  description:
    'Merge, split, compress, convert and sign PDFs for free with Paperlight. Twelve private PDF tools that process your files in your browser. No account needed.',
  steps: [],
  features: [],
  limitations: '',
  related: [],
  faqs: [
    {
      question: 'Is Paperlight an iLovePDF alternative?',
      answer:
        'Paperlight is an independent alternative for twelve common PDF workflows, including merging, splitting, compression, conversion, and visual signing. Files are processed on your device. It is not affiliated with iLovePDF and does not offer every iLovePDF feature, such as cloud services or signature requests.',
    },
  ],
};

export const seoPages: SeoPage[] = [
  homeSeo,
  ...tools.map((tool): SeoPage => ({
    path: `/tools/${tool.id}`,
    title: `${tool.title === 'Page numbers' ? 'Add PDF Page Numbers' : tool.title === 'PDF to images' ? 'PDF to JPG & PNG' : tool.title} Online Free | Paperlight`,
    description: `${tool.detail} Free, private processing in your browser with Paperlight. No document uploads or account required.`,
    ...content[tool.id],
    faqs: [
      {
        question: `How do I use ${tool.title.toLowerCase()}?`,
        answer: content[tool.id].steps.join(' '),
      },
      {
        question: 'Are my documents uploaded?',
        answer:
          'No. Document processing happens in your browser. Files, passwords, signatures, and editing history are not uploaded or stored by Paperlight. The public site uses Vercel Web Analytics for page-view statistics.',
      },
      {
        question: 'What limits should I know about?',
        answer: `${content[tool.id].limitations} Jobs accept up to 100 MB of combined input and 500 pages, subject to additional image and memory limits.`,
      },
    ],
  })),
];

export function seoForPath(path: string) {
  return seoPages.find(
    (page) => page.path === path.replace(/\/$/, '') || (page.path === '/' && path === '/'),
  );
}

export function structuredData(page: SeoPage) {
  const application = {
    '@type': 'WebApplication',
    '@id': `${siteOrigin}${page.path}#application`,
    name:
      page.path === '/'
        ? 'Paperlight'
        : tools.find((tool) => page.path.endsWith(`/${tool.id}`))?.title,
    url: `${siteOrigin}${page.path}`,
    description: page.description,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web browser',
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
              name: 'Paperlight',
              url: `${siteOrigin}/`,
            },
            application,
          ]
        : [
            application,
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Paperlight', item: `${siteOrigin}/` },
                { '@type': 'ListItem', position: 2, name: application.name, item: application.url },
              ],
            },
          ],
  };
}
