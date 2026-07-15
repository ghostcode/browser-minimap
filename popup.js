const toggleBtn = document.getElementById('toggle-btn');
const toggleSection = document.getElementById('toggle-section');
const addCurrentBtn = document.getElementById('add-current-btn');
const disabledSitesList = document.getElementById('disabled-sites-list');
const noticeEl = document.getElementById('disabled-notice');
const currentSiteEl = document.getElementById('current-site');

let currentTabUrl = '';
let currentDomain = '';
let currentSites = [];

function isUrlDisabled(url, patterns) {
  if (!patterns || !patterns.length) return false;
  for (const raw of patterns) {
    const pattern = raw.trim();
    if (!pattern) continue;
    if (pattern.includes('*')) {
      try {
        const regex = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        if (regex.test(url)) return true;
      } catch (e) {
        continue;
      }
    } else if (url.includes(pattern)) {
      return true;
    }
  }
  return false;
}

function getDomain(url) {
  try {
    return new URL(url).hostname || '';
  } catch (e) {
    return '';
  }
}

function updateAddButtonState() {
  if (!currentDomain) {
    addCurrentBtn.disabled = true;
    addCurrentBtn.textContent = '无法获取当前网站';
    addCurrentBtn.classList.remove('remove-mode');
    return;
  }
  addCurrentBtn.disabled = false;
  const index = currentSites.indexOf(currentDomain);
  if (index >= 0) {
    addCurrentBtn.textContent = '移除当前网站';
    addCurrentBtn.classList.add('remove-mode');
  } else {
    addCurrentBtn.textContent = '禁用当前网站';
    addCurrentBtn.classList.remove('remove-mode');
  }
}

function renderDisabledSites() {
  disabledSitesList.innerHTML = '';
  if (currentSites.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-tip';
    empty.textContent = '暂无禁用网站';
    disabledSitesList.appendChild(empty);
    return;
  }
  for (const site of currentSites) {
    const li = document.createElement('li');
    li.title = site;

    const text = document.createElement('span');
    text.className = 'site-text';
    text.textContent = site;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.title = '移除';
    removeBtn.addEventListener('click', () => handleRemoveSite(site));

    li.appendChild(text);
    li.appendChild(removeBtn);
    disabledSitesList.appendChild(li);
  }
}

function saveDisabledSites(sites) {
  currentSites = sites;
  chrome.storage?.local?.set?.({ disabledSites: sites }, () => {
    updateAddButtonState();
    checkCurrentUrl(sites);
    renderDisabledSites();
    updateToggleButton();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: 'updateDisabledSites', sites }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          // content script not present; settings will be picked up on next load
        }
      });
    });
  });
}

function handleRemoveSite(site) {
  const newSites = currentSites.filter((s) => s !== site);
  saveDisabledSites(newSites);
}

function handleAddCurrentSite() {
  if (!currentDomain) return;
  const index = currentSites.indexOf(currentDomain);
  let newSites;
  if (index >= 0) {
    newSites = currentSites.filter((s) => s !== currentDomain);
  } else {
    newSites = [...currentSites, currentDomain];
  }
  saveDisabledSites(newSites);
}

function loadDisabledSites() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      currentTabUrl = tabs[0].url || '';
      currentDomain = getDomain(currentTabUrl);
      currentSiteEl.textContent = currentDomain ? `当前网站：${currentDomain}` : '当前网站：无法获取';
    }

    chrome.storage?.local?.get?.(['disabledSites'], (res) => {
      currentSites = res?.disabledSites || [];
      updateAddButtonState();
      renderDisabledSites();
      checkCurrentUrl(currentSites);
      updateToggleButton();
    });
  });
}

function updateToggleButton() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const tabId = tabs[0].id;
    const url = tabs[0].url || '';

    chrome.storage?.local?.get?.(['disabledSites'], (res) => {
      const sites = res?.disabledSites || [];
      if (isUrlDisabled(url, sites)) {
        toggleBtn.textContent = '展开';
        toggleBtn.disabled = true;
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const panel = document.getElementById('browser-minimap-panel');
          if (!panel) return 'off';
          return panel.classList.contains('hidden') || panel.classList.contains('no-scroll') ? 'off' : 'on';
        }
      }, (results) => {
        const state = results?.[0]?.result || 'off';
        toggleBtn.textContent = state === 'on' ? '关闭' : '展开';
        toggleBtn.disabled = false;
      });
    });
  });
}

function checkCurrentUrl(sites) {
  if (!currentTabUrl) {
    noticeEl.style.display = 'none';
    if (toggleSection) toggleSection.style.display = 'block';
    return;
  }
  const disabled = isUrlDisabled(currentTabUrl, sites);
  noticeEl.style.display = disabled ? 'block' : 'none';
  if (toggleSection) toggleSection.style.display = disabled ? 'none' : 'block';
}

toggleBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    const tabId = tabs[0].id;
    const wantShow = toggleBtn.textContent === '展开';

    chrome.scripting.executeScript({
      target: { tabId },
      func: (show) => {
        if (window.__browserMinimap) {
          show ? window.__browserMinimap.show() : window.__browserMinimap.hide();
          return { ok: true };
        }
        return { ok: false };
      },
      args: [wantShow]
    }, (results) => {
      const result = results?.[0]?.result;
      if (result?.ok) {
        updateToggleButton();
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      }, () => {
        chrome.scripting.insertCSS({
          target: { tabId },
          files: ['styles.css']
        }, () => {
          chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              if (window.__browserMinimap) {
                window.__browserMinimap.show();
                return { ok: true };
              }
              return { ok: false };
            }
          }, () => {
            updateToggleButton();
          });
        });
      });
    });
  });
});

addCurrentBtn.addEventListener('click', handleAddCurrentSite);

loadDisabledSites();
