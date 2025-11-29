import React from 'react';

interface GraphQLHighlightProps {
  query: string;
}

export function GraphQLHighlight({ query }: GraphQLHighlightProps) {
  const highlighted = highlightGraphQL(query);

  return (
    <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed">
      {highlighted.map((token, i) => (
        <span key={i} className={token.className}>
          {token.text}
        </span>
      ))}
    </pre>
  );
}

interface Token {
  text: string;
  className: string;
}

function highlightGraphQL(query: string): Token[] {
  const tokens: Token[] = [];
  let remaining = query;

  const patterns: { regex: RegExp; className: string }[] = [
    // Comments
    { regex: /^#[^\n]*/, className: 'text-gray-500 italic' },
    // Keywords
    { regex: /^(query|mutation|subscription|fragment|on|type|interface|union|enum|scalar|input|extend|schema|directive)\b/, className: 'text-purple-400 font-semibold' },
    // Built-in directives
    { regex: /^@(skip|include|deprecated|specifiedBy)\b/, className: 'text-yellow-400' },
    // Custom directives
    { regex: /^@\w+/, className: 'text-yellow-400' },
    // Type names (capitalized words, often after : or in fragments)
    { regex: /^(ID|String|Int|Float|Boolean)\b/, className: 'text-emerald-400' },
    // Variables
    { regex: /^\$\w+/, className: 'text-orange-400' },
    // Field arguments / parameters
    { regex: /^(true|false|null)\b/, className: 'text-blue-400' },
    // Numbers
    { regex: /^-?\d+\.?\d*/, className: 'text-amber-300' },
    // Strings
    { regex: /^"(?:[^"\\]|\\.)*"/, className: 'text-green-400' },
    // Triple-quoted strings
    { regex: /^"""[\s\S]*?"""/, className: 'text-green-400' },
    // Operation/Fragment names and Type names (PascalCase)
    { regex: /^[A-Z]\w*/, className: 'text-cyan-400' },
    // Field names (camelCase after newline/space or at start)
    { regex: /^[a-z_]\w*(?=\s*[:\({\s])/, className: 'text-sky-300' },
    // Other identifiers
    { regex: /^[a-z_]\w*/i, className: 'text-gray-200' },
    // Punctuation - braces
    { regex: /^[{}]/, className: 'text-gray-400' },
    // Punctuation - parens
    { regex: /^[()]/, className: 'text-gray-500' },
    // Punctuation - other
    { regex: /^[:\[\]!,=]/, className: 'text-gray-500' },
    // Spread operator
    { regex: /^\.\.\./, className: 'text-purple-400' },
    // Whitespace
    { regex: /^\s+/, className: '' },
  ];

  while (remaining.length > 0) {
    let matched = false;

    for (const { regex, className } of patterns) {
      const match = remaining.match(regex);
      if (match) {
        tokens.push({ text: match[0], className });
        remaining = remaining.slice(match[0].length);
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Push single character if nothing matches
      tokens.push({ text: remaining[0], className: 'text-gray-200' });
      remaining = remaining.slice(1);
    }
  }

  return tokens;
}
