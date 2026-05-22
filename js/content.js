let floatingBtn = null;
let popupIframe = null;
let contentScriptEnabled = true; // 默认开启

// 1. 初始化时读取一次配置
chrome.storage.local.get(['app_config'], (res) => {
  const config = res.app_config || {};
  if (config.enableContentScript === 'disabled') {
    contentScriptEnabled = false;
  }
});

// 2. 监听配置动态改变，如果用户刚关掉，立刻清理正在显示的 UI
chrome.storage.onChanged.addListener((changes) => {
  if (changes.app_config) {
    const newConfig = changes.app_config.newValue || {};
    if (newConfig.enableContentScript === 'disabled') {
      contentScriptEnabled = false;
      removeUI();
    } else {
      contentScriptEnabled = true;
    }
  }
});

function removeUI() {
  if (floatingBtn) { floatingBtn.remove(); floatingBtn = null; }
  if (popupIframe) { popupIframe.remove(); popupIframe = null; }
}

document.addEventListener('mousedown', (e) => {
  if (popupIframe && !popupIframe.contains(e.target)) removeUI();
  if (floatingBtn && !floatingBtn.contains(e.target)) removeUI();
});

document.addEventListener('mouseup', (e) => {
  // 如果开关没开，直接退出
  if (!contentScriptEnabled) return;

  if (popupIframe && popupIframe.contains(e.target)) return;
  if (floatingBtn && floatingBtn.contains(e.target)) return;

  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 1 && text.length < 30 && /^[a-zA-Z\-\']+$/.test(text)) {
      if (!chrome.runtime?.id) return; 
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const top = rect.bottom + window.scrollY + 8;
      const left = rect.left + window.scrollX;
      showFloatingBtn(text, top, left);
    }
  }, 10);
});

function showFloatingBtn(text, top, left) {
  removeUI();
  floatingBtn = document.createElement('div');
  floatingBtn.innerHTML = '🔍';
  floatingBtn.style.cssText = `
    position: absolute; top: ${top}px; left: ${left}px;
    width: 36px; height: 36px; background: #0ea5e9; color: white;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    cursor: pointer; box-shadow: 0 6px 16px rgba(14, 165, 233, 0.4); z-index: 2147483646; font-size: 18px; transition: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  `;
  floatingBtn.addEventListener('mouseover', () => { floatingBtn.style.transform = 'scale(1.15)'; floatingBtn.style.background = '#0284c7'; });
  floatingBtn.addEventListener('mouseout', () => { floatingBtn.style.transform = 'scale(1)'; floatingBtn.style.background = '#0ea5e9'; });
  document.body.appendChild(floatingBtn);

  floatingBtn.addEventListener('click', (e) => {
    e.stopPropagation(); e.preventDefault();
    showIframe(text, top, left);
  });
}

function showIframe(text, top, left) {
  removeUI();
  popupIframe = document.createElement('iframe');
  popupIframe.src = chrome.runtime.getURL(`popup.html?word=${encodeURIComponent(text)}&mode=in_page`);
  
  const width = 400; const height = 580;
  let finalLeft = left; let finalTop = top;
  if (finalLeft + width > window.innerWidth + window.scrollX) finalLeft = window.innerWidth + window.scrollX - width - 20;
  if (finalTop + height > window.innerHeight + window.scrollY) finalTop = window.scrollY + window.innerHeight - height - 20;

  popupIframe.style.cssText = `
    position: absolute; top: ${finalTop}px; left: ${finalLeft}px;
    width: ${width}px; height: ${height}px; border: 1px solid rgba(0,0,0,0.1);
    border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.4); z-index: 2147483647;
    background: transparent; color-scheme: light dark; transition: opacity 0.2s;
  `;
  document.body.appendChild(popupIframe);
}

window.addEventListener('message', (e) => {
  if (e.data === 'close_etymorph_iframe') removeUI();
});