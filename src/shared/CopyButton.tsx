import React, { useState, useCallback, useRef } from "react";

interface CopyButtonProps {
  /** The text to copy to clipboard */
  text: string;
  /** Optional className for styling */
  className?: string;
  /** Optional title for the button */
  title?: string;
  /** Size of the icon in pixels (default: 16) */
  size?: number;
}

/**
 * Copies text to clipboard using multiple fallback methods.
 * Works in DevTools panels, popups, and regular pages.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  // Method 1: For DevTools panels, use inspectedWindow.eval
  // This is more reliable than chrome.scripting for passing large strings
  if (
    typeof chrome !== "undefined" &&
    chrome.devtools?.inspectedWindow?.eval
  ) {
    try {
      // Encode the text as base64 to avoid any escaping issues with special characters
      const base64Text = btoa(unescape(encodeURIComponent(text)));

      const success = await new Promise<boolean>((resolve) => {
        chrome.devtools.inspectedWindow.eval(
          `(function() {
            try {
              var text = decodeURIComponent(escape(atob("${base64Text}")));
              var textarea = document.createElement("textarea");
              textarea.value = text;
              textarea.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;";
              document.body.appendChild(textarea);
              textarea.focus();
              textarea.select();
              var success = document.execCommand("copy");
              document.body.removeChild(textarea);
              return success;
            } catch (e) {
              return false;
            }
          })()`,
          (result, error) => {
            if (error) {
              resolve(false);
            } else {
              resolve(result === true);
            }
          }
        );
      });

      if (success) {
        return true;
      }
      // Fall through if it didn't work
    } catch {
      // Fall through to other methods
    }
  }

  // Method 2: Try navigator.clipboard API directly
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  // Method 3: Fallback using textarea and execCommand
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.cssText =
      "position:fixed;left:-9999px;top:-9999px;opacity:0;";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

// Check icon SVG
const CheckIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    className="text-green-400"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 13l4 4L19 7"
    />
  </svg>
);

// Copy icon SVG
const CopyIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    className="text-gray-400 hover:text-gray-200"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);

/**
 * A reusable copy button component that handles clipboard operations
 * across different Chrome extension contexts (DevTools panel, popup, etc.)
 */
export const CopyButton = React.memo(function CopyButton({
  text,
  className = "",
  title = "Copy to clipboard",
  size = 16,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const success = await copyToClipboard(text);

    if (success) {
      setCopied(true);
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, 2000);
    } else {
      console.error("Failed to copy to clipboard");
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={`p-1 rounded transition-colors hover:bg-[#2d2d4a] ${className}`}
      title={copied ? "Copied!" : title}
    >
      {copied ? <CheckIcon size={size} /> : <CopyIcon size={size} />}
    </button>
  );
});

/**
 * Hook for copying text to clipboard with status tracking
 */
export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const success = await copyToClipboard(text);

    if (success) {
      setCopied(true);
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, 2000);
    }

    return success;
  }, []);

  return { copied, copy };
}

export { copyToClipboard };
