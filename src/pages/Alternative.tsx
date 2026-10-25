import { Link } from 'react-router-dom';
import { alternativeSeo } from '../lib/seo';
import { getTool } from '../lib/tools';

export default function Alternative() {
  const page = alternativeSeo;
  return (
    <main id="main" className="container comparison-page">
      <span className="eyebrow">CHOOSE YOUR PDF WORKFLOW</span>
      <h1>An iLovePDF alternative for local PDF work.</h1>
      <p className="comparison-intro">
        Paperlight brings twelve common PDF workflows into your browser. Your files, passwords and
        signatures are processed on your device, with no account required.
      </p>
      <Link to="/tools/merge" className="button primary">
        Merge PDF files
      </Link>
      <section className="tool-guide">
        <h2>What you can do</h2>
        <ul>
          {page.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
        <h2>Choose the workflow that fits</h2>
        <div
          className="comparison-table-wrap"
          role="region"
          aria-label="PDF workflow comparison"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Workflow</th>
                <th scope="col">Paperlight</th>
                <th scope="col">iLovePDF</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Core PDF tasks</th>
                <td>
                  Merge, split, compress, organize, rotate, images, watermark, numbering, protect,
                  unlock and visual signing.
                </td>
                <td>A broader suite that also lists Office conversion and OCR.</td>
              </tr>
              <tr>
                <th scope="row">Signing</th>
                <td>Visual marks placed locally on your document.</td>
                <td>Lists signing yourself and requesting signatures from others.</td>
              </tr>
              <tr>
                <th scope="row">Processing and privacy</th>
                <td>
                  Document processing happens in your browser. Public page visits use disclosed
                  usage analytics.
                </td>
                <td>
                  Consult its security documentation for the policies applying to your selected
                  service.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Scope checked on October 25, 2026 using the{' '}
          <a href="https://www.ilovepdf.com/" rel="noreferrer">
            official iLovePDF tool directory
          </a>{' '}
          and{' '}
          <a href="https://www.ilovepdf.com/help/security" rel="noreferrer">
            security documentation
          </a>
          . Features and policies can change. Paperlight is independent and is not affiliated with
          iLovePDF.
        </p>
        <h2>Before choosing Paperlight</h2>
        <p>{page.limitations}</p>
        <h2>How to get started</h2>
        <ol>
          {page.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {page.faqs.map((faq) => (
          <details key={faq.question}>
            <summary>{faq.question}</summary>
            <p>{faq.answer}</p>
          </details>
        ))}
        <nav aria-label="Related PDF tools" className="guide-related">
          <span>Try a tool</span>
          {page.related.map((id) => (
            <Link key={id} to={`/tools/${id}`}>
              {getTool(id)!.title}
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
