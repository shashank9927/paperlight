import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Search,
  ShieldCheck,
  Zap,
  HardDrive,
  FileText,
  Check,
  LockKeyhole,
} from 'lucide-react';
import { categories, tools } from '../lib/tools';
import type { Category } from '../lib/tools';
import { homeSeo } from '../lib/seo';
const privacyItems = [
  {
    icon: HardDrive,
    title: 'Local processing',
    description: 'Files and passwords stay in this tab.',
  },
  {
    icon: LockKeyhole,
    title: 'No document storage',
    description: 'Only your appearance preference is saved.',
  },
  {
    icon: Zap,
    title: 'Works offline',
    description: 'Once the required tool assets are loaded, you can disconnect.',
  },
];
export default function Home() {
  const [category, setCategory] = useState<Category>('All tools');
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  const visible = tools.filter(
    (tool) =>
      (category === 'All tools' || tool.category === category) &&
      (tool.title + ' ' + tool.description).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <main id="main">
      <section className="hero container">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="status-dot" /> YOUR DOCUMENTS. YOUR DEVICE.
          </div>
          <h1>
            Free PDF tools.
            <br />
            <span>Private by design.</span>
          </h1>
          <p>
            Merge, split, compress, convert and sign PDFs.
            <br />
            Your documents stay on your device.
          </p>
          <div className="hero-actions">
            <a href="#tools" className="button primary">
              Explore the tools <ArrowRight size={16} />
            </a>
            <a href="#privacy" className="text-link">
              Private by design <ShieldCheck size={16} />
            </a>
          </div>
          <div className="hero-meta">
            12 tools <span>·</span> No account required <span>·</span> Free to use
          </div>
        </div>
        <div className="hero-product" aria-hidden="true">
          <div className="product-bar">
            <span className="window-dots">
              <i />
              <i />
              <i />
            </span>
            <span>Paperlight / Merge PDF</span>
            <LockKeyhole size={12} />
          </div>
          <div className="product-body">
            <div className="product-rail">
              <span className="product-rail-active">
                <FileText size={15} /> Documents <small>3</small>
              </span>
              <span>
                01 &nbsp; Project brief.pdf <Check size={12} />
              </span>
              <span>
                02 &nbsp; Research.pdf <Check size={12} />
              </span>
              <span>
                03 &nbsp; Next steps.pdf <Check size={12} />
              </span>
              <div className="product-local">
                <ShieldCheck size={13} /> Processing locally
              </div>
            </div>
            <div className="product-preview">
              <div className="sample-paper">
                <span>PROJECT OVERVIEW</span>
                <h3>
                  A clearer
                  <br />
                  perspective.
                </h3>
                <div className="sample-rule" />
                <div className="sample-lines">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="sample-columns">
                  <i />
                  <i />
                  <i />
                </div>
                <small>
                  Paperlight <span>01</span>
                </small>
              </div>
              <div className="product-caption">Your next document, together.</div>
            </div>
          </div>
          <div className="product-status">
            <span>
              <span className="status-dot" /> Ready to merge
            </span>
            <span className="product-action">
              Merge PDFs <ArrowRight size={12} />
            </span>
          </div>
        </div>
      </section>
      <section id="tools" className="tools-section container">
        <div className="section-heading">
          <div className="eyebrow">THE TOOLKIT</div>
          <h2>A place for every PDF task.</h2>
          <p>Choose a tool. Add your files. Get back to your work.</p>
        </div>
        <div className="tool-controls">
          <div className="category-tabs" role="group" aria-label="Tool categories">
            {categories.map((item) => (
              <button
                key={item}
                aria-pressed={category === item}
                className={category === item ? 'active' : ''}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="tool-search">
            <Search size={16} />
            <input
              ref={search}
              aria-label="Search tools"
              placeholder="Search tools…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>/</kbd>
          </label>
        </div>
        <div className="tool-grid">
          {visible.map((tool) => (
            <Link className="tool-card" to={'/tools/' + tool.id} key={tool.id}>
              <div className="tool-card-top">
                <span className="tool-icon">
                  <tool.icon size={22} strokeWidth={1.6} />
                </span>
                <ArrowRight className="card-arrow" size={16} />
              </div>
              <h3>{tool.title}</h3>
              <p>{tool.description}</p>
              <span className="tool-category">{tool.category}</span>
            </Link>
          ))}
        </div>
        {!visible.length && (
          <div className="empty-search" role="status">
            No tools match “{query}”. Try another search.
          </div>
        )}
      </section>
      <section id="how-it-works" className="container how-section">
        <div className="section-heading">
          <div className="eyebrow">A SIMPLE WORKFLOW</div>
          <h2>From open to done.</h2>
        </div>
        <div className="steps-grid">
          {[
            [
              '01',
              'Choose your files',
              'Open documents from your device. They stay in your browser.',
            ],
            ['02', 'Make your changes', 'Arrange pages, adjust settings, and preview your work.'],
            ['03', 'Save the result', 'Download a new copy. Your original file stays untouched.'],
          ].map(([n, title, description]) => (
            <article key={n}>
              <span>{n}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
      <section id="privacy" className="container privacy-section">
        <div>
          <div className="eyebrow">
            <ShieldCheck size={14} /> PRIVACY BUILT IN
          </div>
          <h2>
            Your files never
            <br />
            leave your device.
          </h2>
          <p>
            Paperlight processes documents locally in your browser. No document uploads, document
            history, or accounts. The public site uses Vercel Web Analytics for page-view
            statistics. Documents, passwords, signatures, and editing data are never sent to
            analytics.
          </p>
        </div>
        <div className="privacy-features">
          {privacyItems.map((item) => (
            <div key={item.title}>
              <item.icon size={20} strokeWidth={1.5} />
              <div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section id="faq" className="container faq-section">
        <h2>A few useful details.</h2>
        {[
          ...homeSeo.faqs.map(({ question, answer }) => [question, answer]),
          [
            'Are my files really private?',
            'Yes. We never upload your documents or passwords. Processing stays in your browser, and no document history is stored.',
          ],
          [
            'How large can my files be?',
            'Up to 100 MB of combined input and 500 pages per job, with additional image and memory limits. Large documents may need smaller batches.',
          ],
          [
            'Does compression preserve my content?',
            'Lossless optimization is the default. Image optimization changes image quality while keeping text. Whole-page rasterization is an explicit advanced option that removes interactive content.',
          ],
          [
            'Is a signature certified?',
            'Signatures are visual marks placed on the PDF. Paperlight does not verify identities or create certified digital signatures.',
          ],
          [
            'Which documents are supported?',
            'Standard PDFs and JPEG, PNG, or WebP images. Some complex PDF structures are rejected when safe preservation cannot be guaranteed.',
          ],
        ].map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
    </main>
  );
}
