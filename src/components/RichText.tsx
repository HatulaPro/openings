import type { ReactNode } from 'react';

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

/**
 * Prose from the repertoire notes: paragraphs separated by a blank line,
 * "- " list items on their own lines, **bold** and *italic*.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  text.split('\n\n').forEach((block, b) => {
    let items: string[] = [];
    const flush = (key: string) => {
      if (!items.length) return;
      blocks.push(
        <ul key={key}>
          {items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>,
      );
      items = [];
    };
    block.split('\n').forEach((line, l) => {
      if (line.startsWith('- ')) {
        items.push(line.slice(2));
      } else {
        flush(`${b}-${l}-list`);
        blocks.push(<p key={`${b}-${l}`}>{inline(line)}</p>);
      }
    });
    flush(`${b}-list`);
  });
  return <div className={className ? `prose ${className}` : 'prose'}>{blocks}</div>;
}

/** The first sentence or two of a note, for a one-glance preview. */
export function teaser(text: string, max = 110): string {
  const plain = text.replace(/\*\*|\*|`/g, '').split('\n')[0]!;
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '), cut.lastIndexOf(': '));
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}
