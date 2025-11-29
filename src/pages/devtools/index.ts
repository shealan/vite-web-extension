// Create the Leonardo.Ai DevTools panel
chrome.devtools.panels.create(
  "Leonardo.Ai",
  "icon-32.png",
  "src/pages/panel/index.html",
  () => {
    console.log("[Leonardo.Ai] DevTools panel created");
  }
);
