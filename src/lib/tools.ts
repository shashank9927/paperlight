import {
  Combine,
  Scissors,
  Minimize2,
  LayoutGrid,
  RotateCw,
  ImagePlus,
  Images,
  Stamp,
  ListOrdered,
  LockKeyhole,
  LockKeyholeOpen,
  PenLine,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ToolId =
  | 'merge'
  | 'split'
  | 'compress'
  | 'organize'
  | 'rotate'
  | 'images-to-pdf'
  | 'pdf-to-images'
  | 'watermark'
  | 'page-numbers'
  | 'protect'
  | 'unlock'
  | 'sign';
export type Category =
  'All tools' | 'Organize' | 'Convert' | 'Optimize' | 'Edit & sign' | 'Security';
export interface ToolDefinition {
  id: ToolId;
  title: string;
  description: string;
  detail: string;
  category: Category;
  icon: LucideIcon;
  color: string;
  popular?: boolean;
  action: string;
}
export const tools: ToolDefinition[] = [
  {
    id: 'merge',
    title: 'Merge PDF',
    description: 'Bring your PDFs together in one tidy file.',
    detail: 'A few files. One seamless document. Arrange your PDFs just how you like them.',
    category: 'Organize',
    icon: Combine,
    color: 'violet',
    popular: true,
    action: 'Merge PDFs',
  },
  {
    id: 'split',
    title: 'Split PDF',
    description: 'Keep the pages you need. Leave the rest.',
    detail: 'Extract a page range or give every page a PDF of its own.',
    category: 'Organize',
    icon: Scissors,
    color: 'rose',
    action: 'Split PDF',
  },
  {
    id: 'compress',
    title: 'Compress PDF',
    description: 'Less file size. More room for everything else.',
    detail: 'Lighten your document with local, text-preserving optimization or image compression.',
    category: 'Optimize',
    icon: Minimize2,
    color: 'mint',
    popular: true,
    action: 'Compress PDF',
  },
  {
    id: 'organize',
    title: 'Organize PDF',
    description: 'Reorder, remove, or duplicate your pages.',
    detail: 'Your document, in perfect order. Drag pages to rearrange, or use the arrow controls.',
    category: 'Organize',
    icon: LayoutGrid,
    color: 'blue',
    action: 'Save organized PDF',
  },
  {
    id: 'images-to-pdf',
    title: 'Images to PDF',
    description: 'Turn your images into a polished document.',
    detail: 'Bring JPEG, PNG, and WebP images together in a beautifully simple PDF.',
    category: 'Convert',
    icon: ImagePlus,
    color: 'amber',
    action: 'Create PDF',
  },
  {
    id: 'pdf-to-images',
    title: 'PDF to images',
    description: 'Every page, a picture. In PNG or JPG.',
    detail:
      'Export crisp images from your PDF, one page at a time. Multiple images arrive in a ZIP.',
    category: 'Convert',
    icon: Images,
    color: 'blue',
    action: 'Convert to images',
  },
  {
    id: 'rotate',
    title: 'Rotate PDF',
    description: 'Get every page facing the right direction.',
    detail: 'Turn your document around. Rotate all pages or just the ones you choose.',
    category: 'Organize',
    icon: RotateCw,
    color: 'violet',
    action: 'Rotate PDF',
  },
  {
    id: 'watermark',
    title: 'Watermark PDF',
    description: 'Add a little ownership to every page.',
    detail: 'Add a custom text watermark, with just the right position, angle, and opacity.',
    category: 'Edit & sign',
    icon: Stamp,
    color: 'rose',
    action: 'Add watermark',
  },
  {
    id: 'page-numbers',
    title: 'Page numbers',
    description: 'Give your document a sense of direction.',
    detail: 'Add clean, consistent page numbers exactly where you need them.',
    category: 'Edit & sign',
    icon: ListOrdered,
    color: 'amber',
    action: 'Add page numbers',
  },
  {
    id: 'protect',
    title: 'Protect PDF',
    description: 'A password. A little extra peace of mind.',
    detail:
      'Secure your document with AES-256 encryption. Only people with the password can open it.',
    category: 'Security',
    icon: LockKeyhole,
    color: 'mint',
    action: 'Protect PDF',
  },
  {
    id: 'unlock',
    title: 'Unlock PDF',
    description: 'Remove a password you already know.',
    detail: 'Enter your PDF’s current password to create a copy that opens freely.',
    category: 'Security',
    icon: LockKeyholeOpen,
    color: 'violet',
    action: 'Unlock PDF',
  },
  {
    id: 'sign',
    title: 'Sign PDF',
    description: 'Your signature. Your finishing touch.',
    detail: 'Draw, type, or upload your signature, then place it right where it belongs.',
    category: 'Edit & sign',
    icon: PenLine,
    color: 'blue',
    popular: true,
    action: 'Sign PDF',
  },
];
export const categories: Category[] = [
  'All tools',
  'Organize',
  'Convert',
  'Optimize',
  'Edit & sign',
  'Security',
];
export const getTool = (id: string) => tools.find((tool) => tool.id === id);
