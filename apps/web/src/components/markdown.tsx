import type { ReactNode } from "react";

/** **bold** and _italic_ inside a line; everything else stays plain text. */
function inline(line: string): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*|\b_[^_]+_\b)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      return (
        <em key={i} className="text-muted-foreground">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

/**
 * Minimal, safe markdown for model and report text: headings, paragraphs, bullet
 * lists, bold and italic. Rendered as React nodes, never as HTML.
 */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length > 0) {
      blocks.push(
        <ul key={`l${String(blocks.length)}`} className="grid gap-1 pl-5 [list-style:disc]">
          {list.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet?.[1] !== undefined) {
      list.push(bullet[1]);
      continue;
    }
    flush();
    if (line.trim() === "") continue;
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading?.[2] !== undefined) {
      const level = heading[1]?.length ?? 1;
      blocks.push(
        <p
          key={blocks.length}
          className={
            level === 1
              ? "font-serif text-xl font-semibold"
              : "pt-2 font-serif text-base font-semibold text-primary"
          }
        >
          {inline(heading[2])}
        </p>,
      );
    } else {
      blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="grid gap-2">{blocks}</div>;
}
