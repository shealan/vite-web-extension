import React, { useState } from 'react';
import { JSONTree } from 'react-json-tree';

interface JsonTreeProps {
  data: unknown;
  showCopyButton?: boolean;
}

// Custom theme matching our existing color scheme
const theme = {
  scheme: 'leonardo',
  author: 'Leonardo.Ai',
  base00: 'transparent', // background
  base01: '#2d2d4a',
  base02: '#3d3d5c',
  base03: '#9ca3af', // comments, invisibles
  base04: '#9ca3af',
  base05: '#e5e7eb', // default text
  base06: '#f3f4f6',
  base07: '#ffffff',
  base08: '#f472b6', // booleans, null
  base09: '#fbbf24', // numbers
  base0A: '#fbbf24',
  base0B: '#86efac', // strings
  base0C: '#7dd3fc',
  base0D: '#7dd3fc', // keys
  base0E: '#c4b5fd', // keywords
  base0F: '#f472b6',
};

function CopyButton({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = JSON.stringify(data, null, 2);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch (err) {
      // Fall through to fallback
    }

    // Fallback: use a temporary textarea
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 hover:bg-[#2d2d4a] rounded transition-colors"
      title="Copy JSON"
    >
      {copied ? (
        <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-gray-400 hover:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

export function JsonTree({ data, showCopyButton = false }: JsonTreeProps) {
  return (
    <div className="w-full block" style={{ width: '100%' }}>
      <div className="json-tree-wrapper w-full block" style={{ width: '100%' }}>
        <JSONTree
          data={data}
          theme={{
            ...theme,
            tree: {
              width: '100%',
              display: 'block',
            },
            nestedNode: {
              width: '100%',
            },
            nestedNodeItemString: {
              width: '100%',
            },
          }}
          invertTheme={false}
          hideRoot={true}
          shouldExpandNodeInitially={(_keyPath, _data, level) => level < 2}
        />
      </div>
      {showCopyButton && (
        <div className="fixed-copy-button">
          <CopyButton data={data} />
        </div>
      )}
    </div>
  );
}

// Export CopyButton for use in parent components
export { CopyButton };
