import { showToast } from './popup-utils.js';
import { loadHistory } from './popup-history.js';
import { analyze, updateBackBtn } from './popup-analyze.js';

document.addEventListener('DOMContentLoaded', () => {
  // 版本号
  const logoEl = document.getElementById('app-logo');
  if (logoEl) {
    const v = chrome.runtime.getManifest().version;
    logoEl.setAttribute('data-tooltip', `Ai词根分析 v${v}`);
  }

  // DOM 引用
  const wordInput      = document.getElementById('word-input');
  const searchBtn      = document.getElementById('search-btn');
  const regenBtn       = document.getElementById('regen-btn');
  const container      = document.getElementById('result-container');
  const historyEl      = document.getElementById('history-container');
  const historySelect  = document.getElementById('history-select');
  const backArea       = document.getElementById('back-area');
  const settingsBtn    = document.getElementById('settings-btn');
  const pinWindowBtn   = document.getElementById('pin-window-btn');
  const quickContext   = document.getElementById('quick-context');
  const quickEngine    = document.getElementById('quick-engine');
  const rootToggleSwitch = document.getElementById('root-toggle-switch');

  // 共享状态
  const state = { navStack: [], currentWord: "" };
  const urlParams  = new URLSearchParams(window.location.search);
  const initialWord = urlParams.get('word');
  const isInPage   = urlParams.get('mode') === 'in_page';
  state.isInPage   = isInPage;
  state.historySelect = historySelect;
  state.historyEl  = historyEl;

  // 元素集合
  const els = { wordInput, container, backArea, quickContext, quickEngine };

  // 快捷调用
  const doAnalyze = (forceWord = null, isBackAction = false, forceRefresh = false) =>
    analyze({ forceWord, isBackAction, forceRefresh, state, els });
  const doUpdateBack = () =>
    updateBackBtn({ navStack: state.navStack, backArea, wordInput, analyze, state, els });

  // 初始化配置
  chrome.storage.local.get(['app_config', 'ui_theme'], (res) => {
    document.body.setAttribute('data-theme', res.ui_theme || 'system');
    localStorage.setItem('ui_theme', res.ui_theme || 'system');
    const config = res.app_config || {};
    quickContext.value = config.promptContext || 'general';
    quickEngine.value  = config.engine || 'custom';
    rootToggleSwitch.checked = (config.rootStrategy || 'keep_old') === 'keep_old';
  });

  // 护根开关
  rootToggleSwitch.addEventListener('change', (e) => {
    chrome.storage.local.get(['app_config'], (res) => {
      const config = res.app_config || {};
      config.rootStrategy = e.target.checked ? 'keep_old' : 'force_new';
      chrome.storage.local.set({ app_config: config }, () => {
        showToast(e.target.checked ? "🛡️ 护根已开启：保护旧笔记" : "⚔️ 护根关闭：新解析将覆盖");
      });
    });
  });

  // 情景切换
  quickContext.addEventListener('change', () => {
    chrome.storage.local.get(['app_config'], (res) => {
      const config = res.app_config || {};
      config.promptContext = quickContext.value;
      chrome.storage.local.set({ app_config: config }, () => {
        showToast("✅ 情景已切换，即将重新解析");
        if (wordInput.value.trim()) doAnalyze(wordInput.value.trim(), true);
      });
    });
  });

  // 引擎切换
  quickEngine.addEventListener('change', () => {
    chrome.storage.local.get(['app_config'], (res) => {
      const config = res.app_config || {};
      config.engine = quickEngine.value;
      chrome.storage.local.set({ app_config: config }, () => {
        showToast("✅ 引擎已切换");
        if (wordInput.value.trim()) doAnalyze(wordInput.value.trim(), true);
      });
    });
  });

  // 设置按钮
  settingsBtn.addEventListener('click', () => {
    if (isInPage) window.open(chrome.runtime.getURL('options.html'));
    else chrome.runtime.openOptionsPage();
  });

  // 图钉窗口
  if (pinWindowBtn) {
    if (isInPage) {
      pinWindowBtn.innerText = '❌';
      pinWindowBtn.setAttribute('data-tooltip', '❌ 取消固定\n关闭当前独立窗口');
    }
    pinWindowBtn.addEventListener('click', () => {
      if (isInPage) {
        window.close();
      } else {
        const targetWord = wordInput.value.trim();
        const url = chrome.runtime.getURL(`popup.html?mode=in_page&word=${encodeURIComponent(targetWord)}`);
        chrome.windows.create({ url, type: "popup", width: 440, height: 700, focused: true });
        window.close();
      }
    });
  }

  // 历史记录
  loadHistory(historySelect, historyEl);
  historySelect.addEventListener('change', (e) => {
    if (e.target.value) {
      wordInput.value = e.target.value;
      state.navStack = []; doUpdateBack(); doAnalyze();
      e.target.value = "";
    }
  });

  // 初始单词
  if (initialWord) {
    wordInput.value = initialWord;
    chrome.storage.local.get(['app_config'], (res) => {
      if ((res.app_config || {}).autoParse !== 'manual') doAnalyze(initialWord);
    });
  } else if (!isInPage) {
    fetchWordFromPage();
  }

  function fetchWordFromPage() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;
      const tab = tabs[0];
      if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://'))) return;
      chrome.scripting.executeScript(
        { target: { tabId: tab.id, allFrames: true }, func: () => window.getSelection().toString().trim() },
        (results) => {
          if (chrome.runtime.lastError) return;
          if (results && results.length > 0) {
            const selected = results.map(r => r.result)
              .find(text => text && text.length > 0 && text.length < 30 && /^[a-zA-Z\-']+$/.test(text));
            if (selected) {
              chrome.storage.local.get(['app_config'], (res) => {
                wordInput.value = selected;
                if ((res.app_config || {}).autoParse !== 'manual') {
                  state.navStack = []; doUpdateBack(); doAnalyze();
                }
              });
            }
          }
        }
      );
    });
  }

  // 按钮事件
  searchBtn.addEventListener('click', () => { state.navStack = []; doUpdateBack(); doAnalyze(null, false, false); });

  regenBtn.addEventListener('click', () => {
    const word = wordInput.value.trim().toLowerCase();
    if (!word) return;
    state.navStack = []; doUpdateBack();
    chrome.storage.local.get(['W:' + word], (stored) => {
      const wordData = stored['W:' + word];
      if (wordData && wordData.edited_keys) {
        delete wordData.edited_keys;
        chrome.storage.local.set({ ['W:' + word]: wordData }, () => doAnalyze(null, false, true));
      } else {
        doAnalyze(null, false, true);
      }
    });
  });

  wordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') { state.navStack = []; doUpdateBack(); doAnalyze(null, false, false); }
  });
});
