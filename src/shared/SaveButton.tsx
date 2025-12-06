import React, { useState, useCallback, useRef } from "react";

interface SaveButtonProps {
  /** The content to save */
  content: string;
  /** The suggested filename */
  filename: string;
  /** The MIME type (default: application/json) */
  mimeType?: string;
  /** Optional className for styling */
  className?: string;
  /** Optional title for the button */
  title?: string;
  /** Size of the icon in pixels (default: 16) */
  size?: number;
}

/**
 * Downloads content as a file using the best available method.
 * Works in DevTools panels, popups, and regular pages.
 */
async function downloadFile(
  content: string,
  filename: string,
  mimeType: string
): Promise<boolean> {
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up the URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 100);

    return true;
  } catch (error) {
    console.error("Failed to download file:", error);
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

// Save/Download icon SVG
const SaveIcon = ({ size = 15 }: { size?: number }) => (
  <svg
    className="text-gray-500 hover:text-gray-200"
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
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
    />
  </svg>
);

/**
 * A reusable save button component that downloads content as a file
 */
export const SaveButton = React.memo(function SaveButton({
  content,
  filename,
  mimeType = "application/json",
  className = "",
  title = "Save as file",
  size = 16,
}: SaveButtonProps) {
  const [saved, setSaved] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = useCallback(async () => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const success = await downloadFile(content, filename, mimeType);

    if (success) {
      setSaved(true);
      timeoutRef.current = setTimeout(() => {
        setSaved(false);
        timeoutRef.current = null;
      }, 2000);
    }
  }, [content, filename, mimeType]);

  return (
    <button
      onClick={handleSave}
      className={`p-1 rounded transition-colors hover:bg-[#2d2d4a] ${className}`}
      title={saved ? "Saved!" : title}
    >
      {saved ? <CheckIcon size={size} /> : <SaveIcon size={size} />}
    </button>
  );
});

export { downloadFile };
