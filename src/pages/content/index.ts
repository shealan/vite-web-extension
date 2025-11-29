// Content script - acts as a bridge between the page and the extension

const SOURCE = 'apollo-lite-devtools-content';
const PAGE_SOURCE = 'apollo-lite-devtools-page';

// Inject the page script
function injectScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

// Set up message relay from page to background
function setupMessageRelay() {
  // Listen for messages from the injected page script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== PAGE_SOURCE) return;

    // Forward to background script
    chrome.runtime.sendMessage({
      source: SOURCE,
      type: event.data.type,
      payload: event.data.payload,
    }).catch(() => {
      // Extension context might not be ready
    });
  });

  // Listen for messages from background/devtools
  chrome.runtime.onMessage.addListener((message) => {
    if (message.source === 'apollo-lite-devtools-background') {
      // Forward to page script
      window.postMessage({
        source: SOURCE,
        type: message.type,
        payload: message.payload,
      }, '*');
    }
  });
}

// Initialize
injectScript();
setupMessageRelay();

console.log('[Apollo Lite] Content script loaded');
