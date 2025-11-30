import { useEffect, useState, useCallback } from "react";

// Only used for loading/empty states
import logo from "@assets/img/logo.svg";

interface UserDetails {
  id: string;
  username: string;
  user_details: Array<{
    auth0Email?: string;
    apiCredit: number;
    apiConcurrencySlots?: number;
    apiPlan?: { planLevel?: number };
    plan?: string;
    paidTokens?: number;
    subscriptionTokens?: number;
    streamTokens?: number;
    tokenRenewalDate?: string;
  }>;
  interests?: Array<{ interest: string }>;
}

// Copy icon SVG
const CopyIcon = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

// Checkmark icon SVG
const CheckIcon = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// Copiable field component
function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = value;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [value]);

  return (
    <div className="flex flex-col gap-1 [&:not(:last-child)]:mb-3">
      <span className="text-[11px] uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <div className="flex items-center gap-2 bg-leo-elevated border border-leo-border-strong rounded-md px-3 py-2">
        <span className="flex-1 font-mono text-[13px] text-gray-200 truncate">
          {value}
        </span>
        <button
          className={`flex-shrink-0 p-1 rounded transition-colors ${
            copied
              ? "text-green-500"
              : "text-gray-500 hover:text-gray-200 hover:bg-white/10"
          }`}
          onClick={handleCopy}
          title={copied ? "Copied!" : "Copy to clipboard"}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

export default function Popup() {
  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [timestamp, setTimestamp] = useState<number | null>(null);

  useEffect(() => {
    chrome.storage.local
      .get(["leoUserData", "leoUserDataTimestamp"])
      .then((result) => {
        if (result.leoUserData) {
          setUser(result.leoUserData);
          setTimestamp(result.leoUserDataTimestamp);
        }
        setLoading(false);
      });

    // Listen for updates
    const handleStorageChange = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (changes.leoUserData?.newValue) {
        setUser(changes.leoUserData.newValue);
      }
      if (changes.leoUserDataTimestamp?.newValue) {
        setTimestamp(changes.leoUserDataTimestamp.newValue);
      }
    };

    chrome.storage.local.onChanged.addListener(handleStorageChange);
    return () =>
      chrome.storage.local.onChanged.removeListener(handleStorageChange);
  }, []);

  const details = user?.user_details?.[0];

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString();
  };

  const formatTokens = (num?: number) => {
    if (num === undefined || num === null) return "0";
    return num.toLocaleString();
  };

  const formatTimeAgo = (ts: number) => {
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  };

  if (loading) {
    return (
      <div className="w-[400px] bg-leo-base text-gray-200 font-sans text-sm">
        <div className="flex flex-col items-center justify-center py-10 px-5 text-gray-400">
          <img
            src={logo}
            className="w-16 h-16 animate-spin-slow"
            alt="Leonardo.Ai"
          />
          <p className="mt-3">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="w-[400px] bg-leo-base text-gray-200 font-sans text-sm">
        <div className="flex flex-col items-center justify-center py-8 px-5 text-center">
          <img src={logo} className="w-16 h-16" alt="Leonardo.Ai" />
          <h2 className="text-base font-semibold text-gray-200 mt-4 mb-2">
            No User Data
          </h2>
          <p className="text-gray-500 text-xs leading-relaxed">
            Visit Leonardo.Ai and sign in to see your account info here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[400px] bg-leo-base text-gray-200 font-sans text-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-leo-elevated border-b border-leo-border">
        <span className="flex items-center gap-0.5 text-base font-semibold text-gray-200 truncate">
          <span className="text-leo-purple-400 font-semibold text-xl">@</span>
          {user.username}
        </span>
        {details?.plan && (
          <span className="flex-shrink-0 text-[11px] font-semibold uppercase tracking-wide text-leo-purple-400 bg-purple-700/20 px-2.5 py-1 rounded">
            {details.plan}
          </span>
        )}
      </div>

      {/* User Info Section */}
      <div className="px-4 py-3 border-b border-leo-border">
        <CopyableField label="Email" value={details?.auth0Email || "N/A"} />
        <CopyableField label="User ID" value={user.id} />
      </div>

      {/* Tokens Section */}
      <div className="px-4 py-3 border-b border-leo-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-leo-purple-400 mb-2.5">
          Tokens
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase text-gray-500">
              Subscription
            </span>
            <span className="text-[15px] font-semibold text-gray-200">
              {formatTokens(details?.subscriptionTokens)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase text-gray-500">Stream</span>
            <span className="text-[15px] font-semibold text-gray-200">
              {formatTokens(details?.streamTokens)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase text-gray-500">Paid</span>
            <span className="text-[15px] font-semibold text-gray-200">
              {formatTokens(details?.paidTokens)}
            </span>
          </div>
        </div>
        {details?.tokenRenewalDate && (
          <div className="mt-2 pt-2 border-t border-leo-border text-[10px] text-gray-400">
            Renews: {formatDate(details.tokenRenewalDate)}
          </div>
        )}
      </div>

      {/* API Section */}
      <div className="px-4 py-3 border-b border-leo-border last:border-b-0">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-leo-purple-400 mb-2.5">
          API
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase text-gray-500">Credits</span>
            <span className="text-[15px] font-semibold text-gray-200">
              {formatTokens(details?.apiCredit)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase text-gray-500">
              Concurrency
            </span>
            <span className="text-[15px] font-semibold text-gray-200">
              {details?.apiConcurrencySlots ?? 0}
            </span>
          </div>
          <div />
        </div>
      </div>

      {/* Interests */}
      {user.interests && user.interests.length > 0 && (
        <div className="px-4 py-3 border-b border-leo-border last:border-b-0">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-leo-purple-400 mb-2.5">
            Interests
          </h3>
          <div className="flex flex-wrap gap-1">
            {user.interests.map((item, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 bg-leo-hover border border-leo-border-strong rounded text-[10px] text-gray-400"
              >
                {item.interest}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer with timestamp and version */}
      <div className="flex items-center justify-between px-4 pt-3 pb-3.5 bg-leo-elevated border-t border-leo-border font-mono text-[10px] text-gray-500">
        {timestamp ? (
          <span>Data updated: {formatTimeAgo(timestamp)}</span>
        ) : (
          <span />
        )}
        <span>v1.4.0</span>
      </div>
    </div>
  );
}
