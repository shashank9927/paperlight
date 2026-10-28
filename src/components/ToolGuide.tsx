import { Link } from 'react-router-dom';
import { seoForPath } from '../lib/seo';
import { getTool } from '../lib/tools';
import type { ToolId } from '../lib/tools';

export function ToolGuide({ toolId }: { toolId: ToolId }) {
  const page = seoForPath(`/tools/${toolId}`)!;
  const tool = getTool(toolId)!;
  return (
    <section className="tool-guide" aria-label={`${tool.title} guide`}>
      <div className="guide-columns">
        <div>
          <h2>How to use {tool.title}</h2>
          <ol>
            {page.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <div>
          <h2>What you can do</h2>
          <ul>
            {page.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          <p>{page.limitations}</p>
        </div>
      </div>
      <h2>Example</h2>
      <p>{page.example}</p>
      <h2>Troubleshooting</h2>
      <p>{page.troubleshooting}</p>
      <h2>Useful details</h2>
      {page.faqs.map(({ question, answer }) => (
        <details key={question}>
          <summary>{question}</summary>
          <p>{answer}</p>
        </details>
      ))}
      <nav aria-label="Related PDF tools" className="guide-related">
        <span>Related tools</span>
        {page.related.map((id) => (
          <Link key={id} to={`/tools/${id}`}>
            {getTool(id)!.title}
          </Link>
        ))}
      </nav>
    </section>
  );
}
