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
    description: 'Combine documents in the order you choose.',
    detail: 'Combine PDF files, arrange their order, and rotate pages before merging.',
    category: 'Organize',
    icon: Combine,
    color: 'violet',
    popular: true,
    action: 'Merge PDFs',
  },
  {
    id: 'split',
    title: 'Split PDF',
    description: 'Extract pages or split by range, count, or size.',
    detail: 'Split into custom groups, fixed page counts, or files within a size limit.',
    category: 'Organize',
    icon: Scissors,
    color: 'rose',
    action: 'Split PDF',
  },
  {
    id: 'compress',
    title: 'Compress PDF',
    description: 'Reduce file size with control over quality.',
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
    detail: 'Import, reorder, insert, rotate, duplicate, or remove pages.',
    category: 'Organize',
    icon: LayoutGrid,
    color: 'blue',
    action: 'Save organized PDF',
  },
  {
    id: 'images-to-pdf',
    title: 'Images to PDF',
    description: 'Turn your images into a polished document.',
    detail: 'Convert JPEG, PNG, and WebP images with precise page and margin settings.',
    category: 'Convert',
    icon: ImagePlus,
    color: 'amber',
    action: 'Create PDF',
  },
  {
    id: 'pdf-to-images',
    title: 'PDF to images',
    description: 'Render pages or extract embedded images.',
    detail: 'Render PDF pages or extract embedded images. Batch results arrive in a named ZIP.',
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
    description: 'Apply text or image watermarks to your PDFs.',
    detail: 'Apply text or image watermarks with precise placement, tiling, and opacity.',
    category: 'Edit & sign',
    icon: Stamp,
    color: 'rose',
    action: 'Add watermark',
  },
  {
    id: 'page-numbers',
    title: 'Page numbers',
    description: 'Add consistent page numbers and custom labels.',
    detail: 'Add clean, consistent page numbers exactly where you need them.',
    category: 'Edit & sign',
    icon: ListOrdered,
    color: 'amber',
    action: 'Add page numbers',
  },
  {
    id: 'protect',
    title: 'Protect PDF',
    description: 'Encrypt documents and manage PDF permissions.',
    detail: 'Protect your documents with AES-256 encryption and configurable PDF permissions.',
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
    description: 'Place signatures, initials, text, dates, and stamps.',
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
