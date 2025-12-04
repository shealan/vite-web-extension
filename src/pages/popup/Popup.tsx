import { useEffect, useState } from "react";

// Only used for loading/empty states
import logo from "@assets/img/logo.svg";
import { CopyButton } from "@src/shared/CopyButton";

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
  canvaUserDetails?: unknown[];
}

// 3-dot menu icon SVG
const MenuIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);

// Close icon SVG
const CloseIcon = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

// Copiable field component
function CopyableField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 [&:not(:last-child)]:mb-3">
      <span className="text-[11px] uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <div className="flex items-center gap-2 bg-leo-elevated border border-leo-border-strong rounded-md px-3 py-2">
        <span className="flex-1 font-mono text-[13px] text-gray-200 truncate">
          {value}
        </span>
        <CopyButton text={value} className="flex-shrink-0" />
      </div>
    </div>
  );
}

// Leonardo.Ai domain for cookie checks
const LEONARDO_DOMAIN = "app.leonardo.ai";

// Check if the current tab URL is a supported page for showing user data
// Only Leonardo.ai and Vercel preview pages - not GitHub
function isSupportedUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Check supported domains (Leonardo.ai and Vercel previews only)
    if (hostname === "app.leonardo.ai") return true;
    if (hostname.startsWith("leonardo-platform-git-") && hostname.endsWith(".vercel.app")) return true;

    return false;
  } catch {
    return false;
  }
}

// Check if user has a valid session cookie
async function checkSessionCookie(): Promise<boolean> {
  try {
    // Get all cookies for Leonardo domain and check for session tokens
    // next-auth uses chunked cookies for large tokens: .session-token.0, .session-token.1, etc.
    const cookies = await chrome.cookies.getAll({
      domain: LEONARDO_DOMAIN,
    });

    // Look for any cookie that contains "session-token" in the name
    const hasSessionCookie = cookies.some(
      (cookie) =>
        cookie.name.includes("session-token") ||
        cookie.name.includes("SessionPresent")
    );

    return hasSessionCookie;
  } catch (error) {
    console.error("[Leonardo.Ai] Failed to check session cookie:", error);
    // If we can't check cookies, assume session is valid to avoid false positives
    return true;
  }
}

export default function Popup() {
  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);

  useEffect(() => {
    async function loadUserData() {
      // First check if we're on a supported page
      let supported = false; // Default to unsupported
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) {
          supported = isSupportedUrl(tab.url);
        }
        // If tab.url is undefined, we don't have permission to read it,
        // which means it's not a supported page
      } catch {
        // If we can't get the tab, it's not supported
      }
      setIsSupported(supported);

      // If not supported, skip loading user data
      if (!supported) {
        setLoading(false);
        return;
      }

      const result = await chrome.storage.local.get([
        "leoUserData",
        "leoUserDataTimestamp",
      ]);

      if (result.leoUserData) {
        // Check if user still has a valid session
        const hasSession = await checkSessionCookie();

        if (hasSession) {
          setUser(result.leoUserData);
          setTimestamp(result.leoUserDataTimestamp);
        } else {
          // Session expired/logged out - clear stored data
          console.log("[Leonardo.Ai] Session expired, clearing user data");
          await chrome.storage.local.remove([
            "leoUserData",
            "leoUserDataTimestamp",
          ]);
        }
      }

      setLoading(false);
    }

    loadUserData();

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

  if (loading || isSupported === null) {
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

  if (isSupported === false) {
    return (
      <div className="w-[400px] bg-leo-base text-gray-200 font-sans text-sm">
        <div className="flex items-center justify-center px-4 pt-5 pb-4 bg-leo-elevated border-b border-leo-border">
          <img src="/logo-text.png" className="h-8" alt="Leonardo.Ai" />
        </div>
        <div className="flex flex-col items-center justify-center py-8 px-5 text-center">
          <h2 className="text-base font-semibold text-gray-200 mb-2">
            Unsupported page
          </h2>
          <p className="text-gray-500 text-xs leading-relaxed">
            This extension only works on Leonardo.Ai and related development sites.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="w-[400px] bg-leo-base text-gray-200 font-sans text-sm">
        <div className="flex items-center justify-center px-4 pt-5 pb-4 bg-leo-elevated border-b border-leo-border">
          <img src="/logo-text.png" className="h-8" alt="Leonardo.Ai" />
        </div>
        <div className="flex flex-col items-center justify-center py-8 px-5 text-center">
          <h2 className="text-base font-semibold text-gray-200 mb-2">
            Not logged in
          </h2>
          <p className="text-gray-500 text-xs leading-relaxed">
            Log in to Leonardo.Ai to see your account info here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[400px] bg-leo-base text-gray-200 font-sans text-sm">
      {/* Header */}
      <div className="relative flex items-center justify-center px-4 pt-5 pb-4 bg-leo-elevated border-b border-leo-border">
        <img src="/logo-text.png" className="h-8" alt="Leonardo.Ai" />
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="absolute right-3 top-3 p-1.5 rounded hover:bg-white/10 transition-colors text-gray-400 hover:text-gray-200"
          title="Settings"
        >
          <MenuIcon />
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-leo-elevated border-b border-leo-border">
        <span className="flex items-center gap-0.5 text-base font-semibold text-gray-200 truncate">
          <span className="text-leo-purple-400 font-semibold text-xl">@</span>
          {user.username}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {details?.plan && (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white px-2.5 py-1 rounded bg-linear-to-br from-[#8b5cf6] via-[#a855f7] to-[#ec4899]">
              {details.plan}
            </span>
          )}
          {user.canvaUserDetails && user.canvaUserDetails.length > 0 && (
            <span
              className="text-[11px] font-semibold text-white px-2 py-1 rounded bg-linear-to-br from-[#00c4cc] via-[#7d2ae8] to-[#7d2ae8]"
              title="Canva User"
            >
              C
            </span>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsSettingsOpen(false)}
          />
          <div className="relative bg-leo-elevated border border-leo-border-strong rounded-lg shadow-xl w-80 max-w-[90vw]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-leo-border-strong">
              <h2 className="text-sm font-semibold text-white">Settings</h2>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-gray-200"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="p-4 text-center text-gray-500 text-sm">
              {/* Empty for now */}
            </div>
          </div>
        </div>
      )}

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
        <span>DevTools: v1.4.0</span>
      </div>
    </div>
  );
}
