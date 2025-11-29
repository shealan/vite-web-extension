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
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.source === 'apollo-lite-devtools-background') {
      // Handle RPC requests - these need a response
      if (message.type === 'RPC_REQUEST') {
        const requestId = message.requestId || Date.now().toString();

        // Set up a one-time listener for the response
        const responseHandler = (event: MessageEvent) => {
          if (event.source !== window) return;
          if (event.data?.source !== PAGE_SOURCE) return;
          if (event.data.type !== 'RPC_RESPONSE') return;
          if (event.data.payload?.requestId !== requestId) return;

          window.removeEventListener('message', responseHandler);
          sendResponse(event.data.payload);
        };

        window.addEventListener('message', responseHandler);

        // Forward RPC request to page script
        window.postMessage({
          source: SOURCE,
          type: 'RPC_REQUEST',
          method: message.method,
          params: message.params,
          requestId: requestId,
        }, '*');

        // Return true to indicate we'll respond asynchronously
        return true;
      }

      // Forward other messages to page script
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
