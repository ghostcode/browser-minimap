document.getElementById('toggle-btn').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const tabId = tabs[0].id;

    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const panel = document.getElementById('browser-minimap-panel');
        const toggle = document.getElementById('browser-minimap-toggle');
        if (panel && toggle) {
          const hidden = panel.classList.toggle('hidden');
          toggle.classList.toggle('hidden-toggle', hidden);
          return { ok: true, hidden };
        }
        return { ok: false };
      }
    }, (results) => {
      const result = results?.[0]?.result;
      if (result?.ok) return;

      // Content script not present; inject it now
      chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      }, () => {
        chrome.scripting.insertCSS({
          target: { tabId },
          files: ['styles.css']
        }, () => {
          alert('Minimap 已注入当前页面，请刷新页面以获得最佳体验。');
        });
      });
    });
  });
});
