function initPyramid() {
  const searchInput = document.getElementById('pyramid-search');
  const searchBtn = document.getElementById('pyramid-btn');
  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('pyramid-content');
  
  const meaningEl = document.getElementById('pyramid-meaning');
  const rootsEl = document.getElementById('pyramid-roots');
  const originBox = document.getElementById('pyramid-origin-box');
  const originEl = document.getElementById('pyramid-origin');
  const derivBox = document.getElementById('pyramid-deriv-box');
  const derivsEl = document.getElementById('pyramid-derivs');
  const derivTitle = document.getElementById('pyramid-deriv-title');
  
  const backBtn = document.getElementById('pyramid-back-btn');
  const histContainer = document.getElementById('pyramid-history-container');
  const histSelect = document.getElementById('pyramid-history-select');
  const histClearBtn = document.getElementById('pyramid-clear-history-btn');

  let navStack = [];
  let currentWord = '';

  function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  }

  const initialWord = getQueryParam('word');
  const initialView = getQueryParam('view');
  
  if (initialView === 'pyramid') {
    const checkInterval = setInterval(() => {
      if (typeof window.switchView === 'function') {
        clearInterval(checkInterval);
        window.switchView('view-word-pyramid');
      }
    }, 50);
  }

  loadHistory();

  if (initialWord) {
    searchInput.value = initialWord;
    generatePyramid(initialWord);
  }

  searchBtn.addEventListener('click', () => {
    const word = searchInput.value.trim();
    if (word) generatePyramid(word, true);
  });

  searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      const word = searchInput.value.trim();
      if (word) generatePyramid(word, true);
    }
  });

  backBtn.addEventListener('click', () => {
    if (navStack.length > 0) {
      const prev = navStack.pop();
      searchInput.value = prev;
      generatePyramid(prev, false, true);
    }
  });

  histSelect.addEventListener('change', (e) => {
    const word = e.target.value;
    if (word) {
      searchInput.value = word;
      generatePyramid(word);
    }
    e.target.value = '';
  });

  histClearBtn.addEventListener('click', () => {
    chrome.storage.local.remove(['pyramid_history'], () => {
      loadHistory();
    });
  });

  function updateBackBtn(word, isBackAction = false) {
    if (!isBackAction && currentWord && currentWord !== word) {
      navStack.push(currentWord);
    }
    currentWord = word;
    if (navStack.length > 0) {
      backBtn.style.display = 'flex';
    } else {
      backBtn.style.display = 'none';
    }
  }

  function loadHistory() {
    chrome.storage.local.get(['pyramid_history'], (res) => {
      const history = res.pyramid_history || [];
      if (history.length > 0) {
        histContainer.style.display = 'flex';
        histSelect.innerHTML = '<option value="">-- 选择历史记录 --</option>';
        history.forEach(h => {
          const opt = document.createElement('option');
          opt.value = h;
          opt.innerText = h;
          histSelect.appendChild(opt);
        });
      } else {
        histContainer.style.display = 'none';
        histSelect.innerHTML = '<option value="">-- 选择历史记录 --</option>';
      }
    });
  }

  function saveHistory(word) {
    chrome.storage.local.get(['pyramid_history', 'app_config'], (res) => {
      let history = res.pyramid_history || [];
      const config = res.app_config || {};
      const limit = parseInt(config.historyLimit) || 10;
      history = history.filter(h => h !== word);
      history.unshift(word);
      if (history.length > limit) history.pop();
      chrome.storage.local.set({ pyramid_history: history }, () => {
        loadHistory();
      });
    });
  }

  function generatePyramid(word, forceRefresh = false, isBackAction = false) {
    updateBackBtn(word, isBackAction);
    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';
    const welcomeEl = document.getElementById('pyramid-welcome');
    if (welcomeEl) welcomeEl.style.display = 'none';

    chrome.runtime.sendMessage({ action: "fetchLLM", word: word, forceRefresh: forceRefresh, isPyramid: true }, (res) => {
      loadingEl.style.display = 'none';
      if (res && res.success && res.data) {
        saveHistory(word);
        renderPyramid(res.data);
      } else {
        alert("无法生成金字塔或网络请求失败，请重试");
      }
    });
  }

  function extractCleanSegments(segmentStr, defaultWord) {
    // try to clean up the segment string which might contain messy AI explanations
    let cleanStr = segmentStr.replace(/（[^）]*）|\([^)]*\)|\[[^\]]*\]/g, ' ');
    let parts = cleanStr.split(/[,/|、+;:\s]+/);
    let segments = parts.filter(s => /^[a-zA-Z\-]+$/.test(s.trim()));
    if (segments.length === 0) {
        segments = segmentStr.split(/[,/|、+]+/).filter(s => s.trim());
    }
    segments = [...new Set(segments)];
    if (segments.length === 0 && defaultWord) segments.push(defaultWord);
    return segments;
  }

  function renderPyramid(data) {
    contentEl.style.display = 'flex';
    
    // Fallback logic in case 'data' is structured differently
    let rootData = data.root || data;
    
    // Meaning
    meaningEl.innerText = rootData.meaning || rootData.primary_meaning || "未知含义";
    
    // Segment base - support both array and legacy comma-separated string
    rootsEl.innerHTML = '';
    let segments = [];
    const segmentRaw = rootData.segment || data.word || data.display_breakdown || "";
    if (Array.isArray(segmentRaw)) {
        segments = segmentRaw.map(s => (s || '').replace(/^-|-$/g, '').trim()).filter(Boolean);
    } else {
        segments = extractCleanSegments(String(segmentRaw), data.word);
    }
    segments = [...new Set(segments)];
    if (segments.length === 0 && data.word) segments.push(data.word);
    
    segments.forEach(seg => {
      const div = document.createElement('div');
      div.className = 'root-box';
      div.style.cssText = 'padding: 12px 24px; font-size: 24px; font-weight: bold; background: #111; color: #facc15; border: 2px solid #facc15; border-radius: 12px; box-shadow: 0 4px 15px rgba(250,204,21,0.2); display: flex; justify-content: center; align-items: center; cursor: pointer;';
      div.innerText = seg.trim();
      div.onclick = () => {
        searchInput.value = seg.trim();
        generatePyramid(seg.trim(), false);
      };
      rootsEl.appendChild(div);
    });

    // Origin
    const originText = rootData.deep_origin || data.noun_source || "";
    if (originText) {
      originBox.style.display = 'block';
      originEl.innerText = originText;
    } else {
      originBox.style.display = 'none';
    }

    // Derivatives
    const derivs = data.derivatives || rootData.derivatives || [];
    if (derivs.length > 0) {
      derivBox.style.display = 'block';
      derivTitle.innerText = `派生词汇 (${derivs.length})`;
      derivsEl.innerHTML = '';
      derivs.forEach(d => {
        const item = document.createElement('div');
        item.className = 'deriv-item';
        // Add default styling since it might be missing in css for pyramid items
        item.style.cssText = 'padding: 8px 16px; font-size: 14px; font-weight: bold; background: rgba(250,204,21,0.1); color: #facc15; border: 1px solid rgba(250,204,21,0.3); border-radius: 8px; cursor: pointer; transition: 0.2s;';
        item.onmouseover = () => { item.style.background = '#facc15'; item.style.color = '#111'; };
        item.onmouseout = () => { item.style.background = 'rgba(250,204,21,0.1)'; item.style.color = '#facc15'; };
        
        let wordStr = typeof d === 'string' ? d : (d.word || '');
        wordStr = wordStr.replace(/^-|-$/g, '').trim();
        if (!wordStr) return;
        item.innerText = wordStr;
        item.onclick = () => {
            if (typeof window.jumpToWord === 'function') {
                window.jumpToWord(wordStr);
            } else {
                window.open(chrome.runtime.getURL('popup.html?word=' + encodeURIComponent(wordStr)), '_blank', 'width=400,height=600');
            }
        };
        derivsEl.appendChild(item);
      });
    } else {
      derivBox.style.display = 'none';
    }
  }
  chrome.storage.local.get(['pendingPyramidWord'], (res) => { if (res.pendingPyramidWord) executePyramidJump(res.pendingPyramidWord); });
  chrome.storage.onChanged.addListener((c, ns) => { if (ns === 'local' && c.pendingPyramidWord && c.pendingPyramidWord.newValue) executePyramidJump(c.pendingPyramidWord.newValue); });
  function executePyramidJump(w) { 
      const checkInterval = setInterval(() => {
          if (typeof window.switchView === 'function') {
              clearInterval(checkInterval);
              window.switchView('view-word-pyramid');
              if (searchInput) searchInput.value = w; 
              generatePyramid(w, false); 
              chrome.storage.local.remove('pendingPyramidWord'); 
          }
      }, 50);
      setTimeout(() => clearInterval(checkInterval), 2000);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPyramid);
} else {
  initPyramid();
}
