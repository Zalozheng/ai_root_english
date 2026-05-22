import { escapeHtml } from './popup-utils.js';

export function loadHistory(historySelect, historyEl) {
  chrome.storage.local.get(['history_list'], (res) => {
    const list = res.history_list || [];
    if (list.length > 0) {
      historySelect.innerHTML = '<option value="">-- 选择历史记录 --</option>' +
        list.map(w => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join('');
      historyEl.style.display = 'flex';
    } else {
      historyEl.style.display = 'none';
    }
  });
}

export function saveHistory(word, historySelect, historyEl) {
  if (!word) return;
  chrome.storage.local.get(['history_list', 'app_config'], (res) => {
    let limit = parseInt((res.app_config || {}).historyLimit || 10);
    let list = res.history_list || [];
    list = list.filter(w => w !== word);
    list.unshift(word);
    list = list.slice(0, limit);
    chrome.storage.local.set({ history_list: list }, () => loadHistory(historySelect, historyEl));
  });
}
