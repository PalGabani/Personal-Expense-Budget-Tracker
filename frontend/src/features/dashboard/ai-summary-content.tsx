/**
 * Renders the small Markdown subset that Gemini returns for a monthly summary.
 *
 * Everything is turned into React elements rather than injected HTML, so model
 * output can never introduce markup into the page.
 */

// Captures **bold**, `code`, and *italic* while keeping the delimiters.
const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g;
const HEADING_PATTERN = /^(#{1,4})\s+(.*)$/;
const BULLET_PATTERN = /^\s*[-*+]\s+(.*)$/;
const ORDERED_PATTERN = /^\s*\d+\.\s+(.*)$/;
// A short line wrapped in ** ** reads as a heading (e.g. **Category Breakdown:**).
const BOLD_HEADING_PATTERN = /^\*\*([^*\n]{1,60})\*\*:?$/;

function renderInline(text: string): React.ReactNode[] {
  // Keys are derived from the token text with an occurrence suffix, so repeated
  // identical tokens stay unique without relying on array position.
  const seen = new Map<string, number>();
  const keyFor = (token: string) => {
    const count = seen.get(token) ?? 0;
    seen.set(token, count + 1);
    return count === 0 ? token : `${token}#${count}`;
  };

  return text.split(INLINE_PATTERN).flatMap((part) => {
    if (!part) return [];
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return [
        <strong className="font-semibold text-slate-900" key={keyFor(part)}>
          {part.slice(2, -2)}
        </strong>,
      ];
    }
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
      return [
        <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]" key={keyFor(part)}>
          {part.slice(1, -1)}
        </code>,
      ];
    }
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) {
      return [<em key={keyFor(part)}>{part.slice(1, -1)}</em>];
    }
    return [<span key={keyFor(part)}>{part}</span>];
  });
}

export function AiSummaryContent({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let ordered = false;

  const listKey = `list-${blocks.length}`;

  function flushList() {
    if (bullets.length === 0) return;
    const occurrences = new Map<string, number>();
    const items = bullets.map((item) => {
      const count = occurrences.get(item) ?? 0;
      occurrences.set(item, count + 1);
      const key = count === 0 ? `${listKey}-${item}` : `${listKey}-${item}#${count}`;
      return <li key={key}>{renderInline(item)}</li>;
    });
    blocks.push(
      ordered ? (
        <ol
          className="ml-5 list-decimal space-y-1.5 text-sm leading-6 text-slate-700 marker:font-semibold marker:text-slate-400"
          key={listKey}
        >
          {items}
        </ol>
      ) : (
        <ul
          className="ml-5 list-disc space-y-1.5 text-sm leading-6 text-slate-700 marker:text-slate-400"
          key={listKey}
        >
          {items}
        </ul>
      ),
    );
    bullets = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      continue;
    }

    const heading = HEADING_PATTERN.exec(line);
    if (heading) {
      flushList();
      blocks.push(
        <p
          className={`mt-1 font-semibold tracking-tight text-slate-900 ${
            heading[1].length === 1 ? "text-base" : "text-sm"
          }`}
          key={`heading-${blocks.length}`}
        >
          {renderInline(heading[2])}
        </p>,
      );
      continue;
    }

    const boldHeading = BOLD_HEADING_PATTERN.exec(line);
    if (boldHeading) {
      flushList();
      blocks.push(
        <p
          className="mt-2 text-sm font-semibold tracking-tight text-slate-900 first:mt-0"
          key={`bold-heading-${blocks.length}`}
        >
          {boldHeading[1]}
        </p>,
      );
      continue;
    }

    const orderedItem = ORDERED_PATTERN.exec(line);
    if (orderedItem) {
      if (ordered && bullets.length === 0) flushList();
      if (!ordered) flushList();
      ordered = true;
      bullets.push(orderedItem[1]);
      continue;
    }

    const bullet = BULLET_PATTERN.exec(line);
    if (bullet) {
      if (!ordered && bullets.length === 0) flushList();
      if (ordered) flushList();
      ordered = false;
      bullets.push(bullet[1]);
      continue;
    }

    flushList();
    blocks.push(
      <p className="text-sm leading-6 text-slate-700" key={`para-${blocks.length}`}>
        {renderInline(line)}
      </p>,
    );
  }
  flushList();

  return <div className="space-y-2">{blocks}</div>;
}
