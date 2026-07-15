(function () {
  'use strict';

  const PANEL_WIDTH = 150;
  const MAX_NODES = 2500;
  const EXCLUDED_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'HEAD', 'HTML',
    'IFRAME', 'SVG', 'PATH', 'CIRCLE', 'RECT', 'G', 'DEFS', 'CLIPPATH',
    'BR', 'HR', 'WBR', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION'
  ]);
  const EXCLUDED_IDS = new Set([
    'browser-minimap-panel',
    'browser-minimap-canvas',
    'browser-minimap-viewport',
    'browser-minimap-toggle'
  ]);

  let panel, canvas, ctx, viewport, toggle;
  let isDragging = false;
  let dragOffsetY = 0;
  let rebuildTimer = null;
  let mutationObserver = null;
  let visible = true;
  let isUpdatingMinimap = false;
  let isBuildingMap = false;
  let onWindowScroll, onWindowResize, onCanvasMouseDown, onCanvasMouseLeave;
  let onDocumentMouseMove, onDocumentMouseUp, onCanvasTouchStart;
  let onDocumentTouchMove, onDocumentTouchEnd, onToggleClick;
  const CURRENT_URL = location.href;
  let disabledSites = [];

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

  function loadDisabledSites(callback) {
    try {
      chrome.storage?.local?.get?.(['disabledSites'], (res) => {
        disabledSites = res?.disabledSites || [];
        if (callback) callback(disabledSites);
      });
    } catch (e) {
      disabledSites = [];
      if (callback) callback(disabledSites);
    }
  }

  function init() {
    if (document.getElementById('browser-minimap-panel')) return;
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    loadDisabledSites((sites) => {
      if (isUrlDisabled(CURRENT_URL, sites)) {
        destroy();
        return;
      }
      doInit();
    });
  }

  function doInit() {
    if (window.__browserMinimapInitialized) return;
    if (document.getElementById('browser-minimap-panel')) return;

    window.__browserMinimapInitialized = true;

    createUI();
    // Start hidden by default; loadVisibility will decide whether to show it
    panel.classList.add('hidden');
    toggle.classList.add('hidden-toggle');
    visible = false;

    loadVisibility();
    bindEvents();
    observeMutations();

    window.__browserMinimap = {
      show: () => setVisibility(true),
      hide: () => setVisibility(false),
      toggle: () => setVisibility(panel?.classList.contains('hidden')),
      destroy
    };
  }

  function destroy() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    clearTimeout(rebuildTimer);

    if (onWindowScroll) window.removeEventListener('scroll', onWindowScroll, { passive: true });
    if (onWindowResize) window.removeEventListener('resize', onWindowResize, { passive: true });
    if (canvas && onCanvasMouseDown) canvas.removeEventListener('mousedown', onCanvasMouseDown);
    if (canvas && onCanvasMouseLeave) canvas.removeEventListener('mouseleave', onCanvasMouseLeave);
    if (onDocumentMouseMove) document.removeEventListener('mousemove', onDocumentMouseMove);
    if (onDocumentMouseUp) document.removeEventListener('mouseup', onDocumentMouseUp);
    if (canvas && onCanvasTouchStart) canvas.removeEventListener('touchstart', onCanvasTouchStart, { passive: false });
    if (onDocumentTouchMove) document.removeEventListener('touchmove', onDocumentTouchMove, { passive: false });
    if (onDocumentTouchEnd) document.removeEventListener('touchend', onDocumentTouchEnd);
    if (toggle && onToggleClick) toggle.removeEventListener('click', onToggleClick);

    if (panel) {
      panel.remove();
      panel = null;
    }
    if (toggle) {
      toggle.remove();
      toggle = null;
    }
    canvas = null;
    ctx = null;
    viewport = null;
    isDragging = false;
    window.__browserMinimapInitialized = false;
    try {
      delete window.__browserMinimap;
    } catch (e) {
      window.__browserMinimap = undefined;
    }
  }

  function createUI() {
    panel = document.createElement('div');
    panel.id = 'browser-minimap-panel';

    canvas = document.createElement('canvas');
    canvas.id = 'browser-minimap-canvas';
    panel.appendChild(canvas);
    ctx = canvas.getContext('2d');

    viewport = document.createElement('div');
    viewport.id = 'browser-minimap-viewport';
    panel.appendChild(viewport);

    toggle = document.createElement('div');
    toggle.id = 'browser-minimap-toggle';
    toggle.title = 'Toggle minimap';

    document.body.appendChild(panel);
    document.body.appendChild(toggle);
  }

  function setVisibility(show) {
    isUpdatingMinimap = true;
    try {
      visible = show;
      panel.classList.toggle('hidden', !show);
      toggle.classList.toggle('hidden-toggle', !show);
      if (show) {
        buildMap();
        updateViewport();
      }
      autoHide();
      try {
        chrome.storage?.local?.set?.({ minimapVisible: show });
      } catch (e) {
        // ignore in contexts where storage is unavailable
      }
    } finally {
      isUpdatingMinimap = false;
    }
  }

  function loadVisibility() {
    try {
      chrome.storage?.local?.get?.(['minimapVisible'], (res) => {
        if (typeof res.minimapVisible === 'boolean') {
          setVisibility(res.minimapVisible);
        } else {
          setVisibility(false); // default hidden until user enables it
        }
      });
    } catch (e) {
      setVisibility(false);
    }
  }

  function buildMap() {
    if (isBuildingMap || !visible || !ctx) return;
    isBuildingMap = true;
    isUpdatingMinimap = true;

    try {
      const docWidth = document.documentElement.scrollWidth;
      const docHeight = document.documentElement.scrollHeight;
      const vpHeight = window.innerHeight;

      if (docHeight <= 0 || vpHeight <= 0) return;

      canvas.width = PANEL_WIDTH * window.devicePixelRatio;
      canvas.height = vpHeight * window.devicePixelRatio;
      canvas.style.width = PANEL_WIDTH + 'px';
      canvas.style.height = vpHeight + 'px';
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      ctx.clearRect(0, 0, PANEL_WIDTH, vpHeight);

      const scaleX = PANEL_WIDTH / docWidth;
      const scaleY = vpHeight / docHeight;

      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, PANEL_WIDTH, vpHeight);

      const elements = collectElements();
      const sampled = elements.length > MAX_NODES
        ? sampleElements(elements, MAX_NODES)
        : elements;

      for (const el of sampled) {
        drawElement(el, scaleX, scaleY, docHeight);
      }
    } catch (e) {
      // ignore errors during map build
    } finally {
      isUpdatingMinimap = false;
      isBuildingMap = false;
    }

    autoHide();
  }

  function collectElements() {
    try {
      const elements = [];
      if (!document.body) return elements;

      const stack = [{ node: document.body, depth: 0 }];
      const limit = MAX_NODES * 2;
      const maxDepth = 100;
      let count = 0;

      while (stack.length > 0 && count < limit) {
        const item = stack.pop();
        const node = item.node;
        const depth = item.depth;

        if (!node || node.nodeType !== Node.ELEMENT_NODE || depth > maxDepth) continue;

        try {
          if (EXCLUDED_IDS.has(node.id)) continue;
          if (EXCLUDED_TAGS.has(node.tagName)) continue;
          const rect = node.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          elements.push(node);
          count++;
        } catch (e) {
          // skip elements that throw during inspection
        }

        const children = node.childNodes;
        const nextDepth = depth + 1;
        for (let i = children.length - 1; i >= 0; i--) {
          stack.push({ node: children[i], depth: nextDepth });
        }
      }

      return elements;
    } catch (e) {
      return [];
    }
  }

  function sampleElements(elements, max) {
    const step = elements.length / max;
    const result = [];
    for (let i = 0; i < max; i++) {
      result.push(elements[Math.floor(i * step)]);
    }
    return result;
  }

  function drawElement(el, scaleX, scaleY, docHeight) {
    const rect = el.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const top = rect.top + scrollTop;
    const bottom = top + rect.height;

    if (bottom < 0 || top > docHeight) return;

    const x = rect.left * scaleX;
    const y = top * scaleY;
    const w = rect.width * scaleX;
    const h = rect.height * scaleY;

    if (w < 1 || h < 0.5) return;

    const tag = el.tagName;
    let color;
    if (/^H[1-6]$/.test(tag)) {
      color = 'rgba(255, 204, 128, 0.65)';
    } else if (tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'PICTURE') {
      color = 'rgba(129, 199, 132, 0.45)';
    } else if (tag === 'A') {
      color = 'rgba(144, 202, 249, 0.35)';
    } else if (tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'LABEL') {
      color = 'rgba(206, 147, 216, 0.45)';
    } else if (tag === 'UL' || tag === 'OL' || tag === 'LI') {
      color = 'rgba(255, 245, 157, 0.25)';
    } else if (tag === 'TABLE' || tag === 'TR' || tag === 'TD' || tag === 'TH') {
      color = 'rgba(128, 203, 196, 0.25)';
    } else if (tag === 'HEADER' || tag === 'FOOTER' || tag === 'NAV' || tag === 'ASIDE') {
      color = 'rgba(255, 255, 255, 0.12)';
    } else {
      color = 'rgba(255, 255, 255, 0.06)';
    }

    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function updateViewport() {
    if (isDragging || !viewport) return;
    const docHeight = document.documentElement.scrollHeight;
    const vpHeight = window.innerHeight;
    const scrollTop = window.scrollY || document.documentElement.scrollTop;

    if (docHeight <= vpHeight) {
      viewport.style.top = '0px';
      viewport.style.height = '100%';
      return;
    }

    const ratio = scrollTop / (docHeight - vpHeight);
    const panelHeight = panel.clientHeight || vpHeight;
    const viewportHeight = Math.max((vpHeight / docHeight) * panelHeight, 20);
    const maxTop = panelHeight - viewportHeight;
    const top = Math.min(Math.max(ratio * maxTop, 0), maxTop);

    viewport.style.top = top + 'px';
    viewport.style.height = viewportHeight + 'px';
  }

  function autoHide() {
    if (!panel || !toggle) return;
    isUpdatingMinimap = true;
    try {
      const docHeight = document.documentElement.scrollHeight;
      const vpHeight = window.innerHeight;
      const needsScroll = docHeight > vpHeight;

      if (!needsScroll) {
        panel.classList.add('no-scroll');
        toggle.classList.add('no-scroll');
      } else {
        panel.classList.remove('no-scroll');
        toggle.classList.remove('no-scroll');
        panel.classList.toggle('hidden', !visible);
        toggle.classList.toggle('hidden-toggle', !visible);
      }
    } finally {
      isUpdatingMinimap = false;
    }
  }

  function bindEvents() {
    onWindowScroll = updateViewport;
    onWindowResize = scheduleRebuild;
    onCanvasMouseDown = onPointerDown;
    onCanvasMouseLeave = () => {
      if (canvas) canvas.classList.remove('thumb-hover', 'thumb-grabbing');
    };
    onDocumentMouseMove = onPointerMove;
    onDocumentMouseUp = onPointerUp;
    onCanvasTouchStart = onTouchStart;
    onDocumentTouchMove = onTouchMove;
    onDocumentTouchEnd = onPointerUp;
    onToggleClick = () => setVisibility(!visible);

    window.addEventListener('scroll', onWindowScroll, { passive: true });
    window.addEventListener('resize', onWindowResize, { passive: true });

    canvas.addEventListener('mousedown', onCanvasMouseDown);
    canvas.addEventListener('mouseleave', onCanvasMouseLeave);
    document.addEventListener('mousemove', onDocumentMouseMove);
    document.addEventListener('mouseup', onDocumentMouseUp);

    canvas.addEventListener('touchstart', onCanvasTouchStart, { passive: false });
    document.addEventListener('touchmove', onDocumentTouchMove, { passive: false });
    document.addEventListener('touchend', onDocumentTouchEnd);

    toggle.addEventListener('click', onToggleClick);
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    if (!panel || !viewport || !canvas) return;
    e.preventDefault();
    e.stopPropagation();

    const panelRect = panel.getBoundingClientRect();
    const vpRect = viewport.getBoundingClientRect();
    const clickY = e.clientY - panelRect.top;
    const vpTop = vpRect.top - panelRect.top;
    const vpBottom = vpTop + vpRect.height;

    if (clickY >= vpTop && clickY <= vpBottom) {
      isDragging = true;
      dragOffsetY = clickY - vpTop;
      viewport.classList.add('dragging');
      canvas.classList.add('thumb-grabbing');
      // Lock the thumb at its current position so it cannot jump
      viewport.style.top = vpTop + 'px';
    } else {
      scrollToPanelY(e.clientY);
    }
  }

  function onPointerMove(e) {
    if (!isDragging) {
      updateCursor(e);
      return;
    }
    if (!panel || !viewport) return;
    e.preventDefault();
    e.stopPropagation();

    const panelRect = panel.getBoundingClientRect();
    const clickY = e.clientY - panelRect.top;
    const viewportHeight = parseFloat(viewport.style.height) || 0;
    const maxTop = Math.max(0, panelRect.height - viewportHeight);
    let top = clickY - dragOffsetY;
    top = Math.max(0, Math.min(top, maxTop));

    viewport.style.top = top + 'px';

    const docHeight = document.documentElement.scrollHeight;
    const vpHeight = window.innerHeight;
    const maxScroll = Math.max(0, docHeight - vpHeight);
    const ratio = maxTop > 0 ? top / maxTop : 0;
    const target = ratio * maxScroll;
    window.scrollTo({ top: target, behavior: 'auto' });
  }

  function updateCursor(e) {
    if (!panel || !viewport || !canvas) return;
    const panelRect = panel.getBoundingClientRect();
    const vpRect = viewport.getBoundingClientRect();
    const clickY = e.clientY - panelRect.top;
    const vpTop = vpRect.top - panelRect.top;
    const vpBottom = vpRect.bottom - panelRect.top;
    const overThumb = clickY >= vpTop && clickY <= vpBottom;
    canvas.classList.toggle('thumb-hover', overThumb);
  }

  function onTouchStart(e) {
    if (!panel || !viewport || !canvas) return;
    const touch = e.touches[0];
    const panelRect = panel.getBoundingClientRect();
    const vpRect = viewport.getBoundingClientRect();
    const clickY = touch.clientY - panelRect.top;
    const vpTop = vpRect.top - panelRect.top;
    const vpBottom = vpTop + vpRect.height;

    if (clickY >= vpTop && clickY <= vpBottom) {
      isDragging = true;
      dragOffsetY = clickY - vpTop;
      viewport.classList.add('dragging');
      canvas.classList.add('thumb-grabbing');
      viewport.style.top = vpTop + 'px';
    } else {
      scrollToPanelY(touch.clientY);
    }
  }

  function onTouchMove(e) {
    if (!isDragging) return;
    if (!panel || !viewport) return;
    e.preventDefault();

    const touch = e.touches[0];
    const panelRect = panel.getBoundingClientRect();
    const clickY = touch.clientY - panelRect.top;
    const viewportHeight = parseFloat(viewport.style.height) || 0;
    const maxTop = Math.max(0, panelRect.height - viewportHeight);
    let top = clickY - dragOffsetY;
    top = Math.max(0, Math.min(top, maxTop));

    viewport.style.top = top + 'px';

    const docHeight = document.documentElement.scrollHeight;
    const vpHeight = window.innerHeight;
    const maxScroll = Math.max(0, docHeight - vpHeight);
    const ratio = maxTop > 0 ? top / maxTop : 0;
    const target = ratio * maxScroll;
    window.scrollTo({ top: target, behavior: 'auto' });
  }

  function onPointerUp() {
    isDragging = false;
    if (viewport) viewport.classList.remove('dragging');
    if (canvas) canvas.classList.remove('thumb-grabbing', 'thumb-hover');
  }

  function scrollToPanelY(clientY) {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const ratio = relativeY / rect.height;
    const docHeight = document.documentElement.scrollHeight;
    const vpHeight = window.innerHeight;
    const maxScroll = Math.max(0, docHeight - vpHeight);
    const target = Math.min(Math.max(ratio * maxScroll - vpHeight / 2, 0), maxScroll);
    window.scrollTo({ top: target, behavior: 'auto' });
  }

  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      if (isBuildingMap || isUpdatingMinimap) return;
      buildMap();
      updateViewport();
    }, 250);
  }

  function observeMutations() {
    if (mutationObserver) return;
    mutationObserver = new MutationObserver(() => {
      if (isUpdatingMinimap || isBuildingMap) return;
      scheduleRebuild();
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.disabledSites) {
        disabledSites = changes.disabledSites.newValue || [];
        if (isUrlDisabled(CURRENT_URL, disabledSites)) {
          destroy();
        } else if (!window.__browserMinimapInitialized) {
          doInit();
        }
      }
    });
  } catch (e) {
    // ignore
  }

  try {
    chrome.runtime?.onMessage?.addListener((request, sender, sendResponse) => {
      if (request.type === 'updateDisabledSites') {
        disabledSites = request.sites || [];
        if (isUrlDisabled(CURRENT_URL, disabledSites)) {
          destroy();
        } else if (!window.__browserMinimapInitialized) {
          doInit();
        }
        sendResponse({ ok: true });
      }
      return true;
    });
  } catch (e) {
    // ignore
  }
})();
