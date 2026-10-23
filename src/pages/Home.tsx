import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileText,
  Fingerprint,
  Heart,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  WandSparkles,
  Zap,
} from 'lucide-react';
import { categories, tools } from '../lib/tools';
import type { Category } from '../lib/tools';

function PaperIllustration() {
  return (
    <div className="paper-illustration" aria-hidden="true">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="illustration-spark s1">✧</div>
      <div className="illustration-spark s2">✧</div>
      <div className="back-paper">
        <div />
        <div />
        <div />
      </div>
      <div className="main-paper">
        <div className="paper-top">
          <span className="mini-brand">p.</span>
          <span>YOUR NEXT BIG THING</span>
          <span>↗</span>
        </div>
        <div className="paper-heading">
          Good things.
          <br />
          Coming together.
        </div>
        <div className="paper-rule" />
        <div className="paper-lines">
          <i />
          <i />
          <i />
        </div>
        <div className="paper-chart">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <div className="chart-line" />
        </div>
        <div className="paper-bottom">
          <span>A fresh perspective.</span>
          <span>01 / 03</span>
        </div>
      </div>
      <div className="floating-file file-one">
        <span className="floating-file-icon">
          <FileText size={23} />
        </span>
        <div>
          <strong>Big ideas.pdf</strong>
          <span>Ready for what’s next</span>
        </div>
        <span className="file-check">
          <Check size={12} />
        </span>
      </div>
      <div className="floating-action">
        <Sparkles size={16} />
        <span>A little lighter. A lot simpler.</span>
      </div>
      <div className="floating-security">
        <LockKeyhole size={15} />
        <span>Stays on your device</span>
        <span className="status-dot" />
      </div>
      <div className="paper-shadow" />
    </div>
  );
}
const faqs = [
  [
    'Are my files really private?',
    'Yes. Your documents are processed locally in your browser. We never upload your files or passwords, store document history, or use analytics to track your work. Closing or resetting your workspace clears its file references.',
  ],
  [
    'Is Paperlight completely free?',
    'Every tool is free, with no account, subscription, or watermark added by Paperlight. There are no usage credits or hidden premium buttons.',
  ],
  [
    'How large can my files be?',
    'You can work with up to 100 MB of combined input and 500 pages per job. Your device’s available memory also matters, especially when exporting high-resolution images. For large scans, try a smaller batch or a lower resolution.',
  ],
  [
    'Will compression change my document?',
    'Text-preserving mode optimizes the PDF without rasterizing its pages, though some files cannot get smaller. Stronger image-based mode rebuilds the pages as pictures and removes selectable text, links, and interactive fields. You choose the tradeoff.',
  ],
  [
    'Can I use Paperlight on my phone?',
    'Yes. Paperlight works in modern mobile and desktop browsers. Use the arrow controls to reorder files and pages, or drag them on a larger screen. No app installation is needed.',
  ],
  [
    'Does signing create a certified digital signature?',
    'The signature tool places a visual signature on your PDF. You can draw it, type it, or upload an image. It does not create a certificate-backed digital signature or verify anyone’s identity.',
  ],
];
export default function Home() {
  const [category, setCategory] = useState<Category>('All tools');
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.title = 'Paperlight — A little less paperwork.';
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  const visible = tools.filter(
    (tool) =>
      (category === 'All tools' || tool.category === category) &&
      `${tool.title} ${tool.description} ${tool.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <main id="main">
      <section className="hero">
        <div className="container hero-layout">
          <div className="hero-copy">
            <div className="hero-badge">
              <span className="badge-spark">
                <Sparkles size={13} />
              </span>
              A fresh take on everyday PDFs
              <span className="badge-line" />
            </div>
            <h1>
              Big plans.
              <br />
              <span>Small paperwork.</span>
            </h1>
            <p>
              All the PDF tools you need, in one calm little corner.
              <br className="desktop-break" /> Simple, free, and completely yours.
            </p>
            <div className="hero-actions">
              <a href="#tools" className="button primary">
                Find your tool <ArrowDown size={17} />
              </a>
              <span className="hero-free">
                <Check size={14} /> No sign-up. No fuss.
              </span>
            </div>
            <div className="hero-proof">
              <span>
                <ShieldCheck size={16} /> Private by design
              </span>
              <i />
              <span>
                <Zap size={16} /> Ready in your browser
              </span>
            </div>
          </div>
          <PaperIllustration />
        </div>
      </section>
      <div className="trust-strip">
        <div className="container trust-inner">
          <span>LESS BUSYWORK. MORE POSSIBILITY.</span>
          <div>
            <LockKeyhole size={15} /> Your files never leave your device
          </div>
          <i />
          <div>
            <Heart size={15} /> Free for everyone, always
          </div>
        </div>
      </div>
      <section id="tools" className="tools-section container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE EVERYDAY TOOLKIT</span>
            <h2>
              A tool for every <span className="serif-word">to-do.</span>
            </h2>
          </div>
          <p>
            Small tasks. Big relief.
            <br />
            Pick a tool and make a little progress.
          </p>
        </div>
        <div className="tool-toolbar">
          <div className="category-tabs" role="group" aria-label="Filter tools by category">
            {categories.map((item) => (
              <button
                key={item}
                className={category === item ? 'selected' : ''}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item}
                {item === 'All tools' && <span>12</span>}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              ref={search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a tool…"
              aria-label="Search tools"
            />
            <kbd>/</kbd>
          </label>
        </div>
        <div className="tool-grid">
          {visible.map((tool) => (
            <Link className="tool-card" key={tool.id} to={`/tools/${tool.id}`}>
              <div className="tool-card-top">
                <span className={`tool-icon ${tool.color}`}>
                  <tool.icon size={24} strokeWidth={1.65} />
                </span>
                {tool.popular && <span className="popular-tag">POPULAR</span>}
                <ArrowUpRight className="card-arrow" size={18} />
              </div>
              <h3>{tool.title}</h3>
              <p>{tool.description}</p>
            </Link>
          ))}
        </div>
        {!visible.length && (
          <div className="empty-search">
            <Search size={28} />
            <h3>No tools found</h3>
            <p>Try another search, or explore all twelve tools.</p>
            <button
              className="button secondary"
              onClick={() => {
                setQuery('');
                setCategory('All tools');
              }}
            >
              Show all tools
            </button>
          </div>
        )}
        <p className="tool-grid-foot">
          <span className="status-dot" /> Every tool. Entirely in your browser.{' '}
          <span>That’s the Paperlight way.</span>
        </p>
      </section>
      <section id="privacy" className="privacy-section container">
        <div className="privacy-art" aria-hidden="true">
          <div className="privacy-orbit" />
          <div className="privacy-doc">
            <FileText size={33} strokeWidth={1.3} />
            <i />
            <i />
            <i />
          </div>
          <div className="privacy-lock">
            <LockKeyhole size={37} strokeWidth={1.4} />
          </div>
          <span className="privacy-label">
            <span className="status-dot" /> Just between you and your browser.
          </span>
          <span className="privacy-star">✧</span>
        </div>
        <div className="privacy-copy">
          <span className="eyebrow">
            <Fingerprint size={14} /> PRIVACY ISN’T AN EXTRA
          </span>
          <h2>
            Your files.
            <br />
            Your business.
            <br />
            <span>Let’s keep it that way.</span>
          </h2>
          <p>
            No uploads. No cloud storage. No wondering where your document ended up. Everything
            happens right on your device, so your files stay yours.
          </p>
          <a href="#faq" className="text-link">
            A little more peace of mind <ArrowRight size={16} />
          </a>
        </div>
      </section>
      <section id="how-it-works" className="how-section container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LESS TO LEARN. MORE TO GET DONE.</span>
            <h2>
              Three steps. <span className="serif-word">And breathe.</span>
            </h2>
          </div>
          <span className="handwritten">
            Really, that’s it. <span>↴</span>
          </span>
        </div>
        <div className="steps-grid">
          {[
            {
              number: '01',
              icon: Upload,
              title: 'Make yourself at home',
              text: 'Pick a tool and drop in your files. They stay right here, on your device.',
            },
            {
              number: '02',
              icon: WandSparkles,
              title: 'A few little adjustments',
              text: 'Arrange, customize, and preview. We keep the settings simple and useful.',
            },
            {
              number: '03',
              icon: ArrowDown,
              title: 'On with your day',
              text: 'Download your finished file. No email address, account, or extra steps.',
            },
          ].map((step) => (
            <div className="step-card" key={step.number}>
              <span className="step-number">{step.number}</span>
              <span className="step-icon">
                <step.icon size={21} strokeWidth={1.6} />
              </span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </section>
      <section id="faq" className="faq-section container">
        <div>
          <span className="eyebrow">GOOD QUESTIONS</span>
          <h2>
            A few things
            <br />
            you might <span className="serif-word">wonder.</span>
          </h2>
          <p>Clear answers. No fine print.</p>
          <span className="faq-doodle" aria-hidden="true">
            ?
          </span>
        </div>
        <div className="faq-list">
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <ChevronDown size={17} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="bottom-cta container">
        <div>
          <span className="eyebrow">ONE LESS THING ON YOUR LIST</span>
          <h2>Let’s make light work of it.</h2>
        </div>
        <a href="#tools" className="button primary">
          Explore the toolkit <ArrowUpRight size={17} />
        </a>
      </section>
    </main>
  );
}
