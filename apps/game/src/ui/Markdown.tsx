import type { ReactNode } from 'react';

/**
 * Kleiner Markdown-Renderer für Mails, Datenblätter und das Handbuch: Überschriften, Listen,
 * Tabellen, Codeblöcke, **fett**, `code`. Links werden als Text dargestellt.
 */
function inline(text: string): ReactNode[] {
  const parts = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>;
    return p;
  });
}

/** `joinLines`: Zeilenumbrüche innerhalb eines Absatzes ignorieren (Dokumente statt Mails) */
export function Markdown({ text, joinLines = false }: { text: string; joinLines?: boolean }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith('```')) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i]!.startsWith('```'); i++) code.push(lines[i]!);
      out.push(
        <pre key={i} className="md-code">
          {code.join('\n')}
        </pre>,
      );
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith('|')) {
        const cells = lines[i]!.split('|')
          .slice(1, -1)
          .map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <table key={i} className="md-table">
          <thead>
            <tr>
              {head?.map((c, k) => (
                <th key={k}>{inline(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, k) => (
              <tr key={k}>
                {r.map((c, j) => (
                  <td key={j}>{inline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    if (/^\d+\. /.test(line) || line.startsWith('- ')) {
      const ordered = /^\d+\. /.test(line);
      const items: string[] = [];
      while (
        i < lines.length &&
        (ordered ? /^\d+\. /.test(lines[i]!) : lines[i]!.startsWith('- '))
      ) {
        let item = lines[i]!.replace(/^(\d+\.|-) /, '');
        // eingerückte Folgezeilen gehören zum Listenpunkt
        for (i++; i < lines.length && /^ {2,}\S/.test(lines[i]!); i++)
          item += ` ${lines[i]!.trim()}`;
        items.push(item);
      }
      const List = ordered ? 'ol' : 'ul';
      out.push(
        <List key={i}>
          {items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </List>,
      );
      continue;
    }
    if (line.startsWith('# ')) out.push(<h2 key={i}>{inline(line.slice(2))}</h2>);
    else if (line.startsWith('## ')) out.push(<h3 key={i}>{inline(line.slice(3))}</h3>);
    else if (line.startsWith('### ')) out.push(<h4 key={i}>{inline(line.slice(4))}</h4>);
    else if (line.trim()) {
      // aufeinanderfolgende Textzeilen bilden einen Absatz
      let text = line;
      while (
        joinLines &&
        i + 1 < lines.length &&
        /^[^\s#|`>-]/.test(lines[i + 1]!) &&
        !/^\d+\. /.test(lines[i + 1]!)
      ) {
        text += ` ${lines[++i]!}`;
      }
      out.push(<p key={i}>{inline(text)}</p>);
    }
    i++;
  }
  return <div className="md">{out}</div>;
}
