import { escapeHtml, showToast } from './popup-utils.js';
import { saveHistory } from './popup-history.js';

export function analyze({ forceWord, isBackAction, forceRefresh, state, els }) {
  const { navStack, currentWord, isInPage, historySelect, historyEl } = state;
  const { wordInput, container, backArea, quickContext } = els;

  const word = forceWord || wordInput.value.trim().toLowerCase();
  if (!word) return;

  if (!isBackAction && state.currentWord && state.currentWord !== word) navStack.push(state.currentWord);
  state.currentWord = word;
  updateBackBtn({ navStack, backArea, wordInput, analyze, state, els });

  wordInput.value = word;
  container.innerHTML = `<div class="loading"><h3>${forceRefresh ? '🔄 强制引擎重算中' : '🧠 AI 引擎解析中'}</h3><p>「${escapeHtml(word)}」</p></div>`;

  chrome.runtime.sendMessage({ action: "fetchLLM", word, forceRefresh }, (response) => {
    if (!response || !response.success) {
      container.innerHTML = `<div class="error"><b>请求被拒绝或失败</b><br><br>${escapeHtml(response?.error || "未知网络错误")}<br><br><button id="go-settings-btn" class="quick-select">⚙️ 检查配置</button></div>`;
      document.getElementById('go-settings-btn').addEventListener('click', () => {
        if (isInPage) window.open(chrome.runtime.getURL('options.html')); else chrome.runtime.openOptionsPage();
      });
      return;
    }

    saveHistory(word, historySelect, historyEl);
    const res = response.data;

    const partsHtml = (res.parts || []).map((p, i) => {
      const cleanRoot = escapeHtml(p.segment.replace(/^-|-$/g, '').toLowerCase());
      return `
        <div class="part-row" id="row-${i}">
          <div class="segment-box jump-root-trigger" data-root="${cleanRoot}">
            <div class="segment-text">${escapeHtml(p.segment)}</div>
            <div class="segment-type">${escapeHtml(p.type)}</div>
          </div>
          <div class="detail-box">
            <div class="meaning">${escapeHtml(p.meaning)} <span class="click-hint">(点击查看详细渊源)</span></div>
            <div class="deep-detail" id="detail-${i}">
              <div style="color:var(--text); margin-bottom:8px;"><b>📖 渊源故事：</b><br>${escapeHtml(p.deep_origin || '暂无')}</div>
              <div><b>🌿 同根派生：</b> ${escapeHtml((p.derivatives || []).join(', ') || '暂无')}</div>
            </div>
          </div>
        </div>`;
    }).join("");

    let sourceTagText = "混合源";
    if (res.sourceTag === 'remote') sourceTagText = "🌐 API";
    if (res.sourceTag === 'ollama') sourceTagText = "🦙 Ollama";

    const contextKey = quickContext.value;
    const apiLines = res.memory_lines_map ? res.memory_lines_map[`remote_${contextKey}`] : null;
    const ollamaLines = res.memory_lines_map ? res.memory_lines_map[`ollama_${contextKey}`] : null;
    const activeSource = res.sourceTag;

    let sourceTabsHtml = '';
    if (apiLines || ollamaLines) {
      sourceTabsHtml = `<div class="source-tabs">`;
      if (apiLines) sourceTabsHtml += `<div class="source-tab source-trigger ${activeSource === 'remote' ? 'active' : ''}" data-source="remote">🌐 API</div>`;
      if (ollamaLines) sourceTabsHtml += `<div class="source-tab source-trigger ${activeSource === 'ollama' ? 'active' : ''}" data-source="ollama">🦙 Ollama</div>`;
      sourceTabsHtml += `</div>`;
    }

    container.innerHTML = `
      <div class="word-header">
        <span class="word-breakdown">${escapeHtml(res.display_breakdown || word)}</span>
        <div class="speaker-icon" id="speak-btn" data-tooltip="🔊 朗读&#10;点击播放美式发音">🔊</div>
        <span class="phonetic">/${escapeHtml(res.phonetic_us || '-')}/</span>
        <span class="primary-meaning">${escapeHtml(res.primary_meaning || '')}</span>
      </div>
      <div class="core-meaning">🎯 名词源追溯：${escapeHtml(res.noun_source || '暂无')}</div>
      <div style="margin-top: 16px;">${partsHtml}</div>
      <div class="memory-lines">
        <div class="memory-title"><span>💡 情境联想</span> <span class="source-badge" style="font-size:10px; background:var(--orange); color:white; padding:2px 6px; border-radius:4px;">${sourceTagText}</span></div>
        <div id="lines-render-area" style="margin-top:8px;">${(res.memory_lines || [])
          .filter(l => l.trim().length > 0)
          .map(l => `<div class="memory-line-item" style="display:flex;align-items:flex-start;gap:4px;margin-bottom:6px;">
              <span style="color:var(--text-muted);margin-top:2px;flex-shrink:0;">•</span>
              <div class="line-input" contenteditable="true" style="word-break:break-word;white-space:pre-wrap;min-height:22px;">${escapeHtml(l)}</div>
            </div>`).join("")}</div>
      </div>
      <div style="margin-top:25px;display:flex;justify-content:center;gap:8px;padding-bottom:10px;">
        <button class="jump-to-tree-btn" data-word="${escapeHtml(res.word || word)}" style="padding:8px 14px;border-radius:8px;border:1px solid #0ea5e9;background:rgba(14,165,233,0.1);color:#38bdf8;font-size:13px;font-weight:bold;cursor:pointer;transition:0.2s;display:flex;align-items:center;gap:6px;">🌳 词树图展开</button>
        <button class="jump-to-lib-btn" data-word="${escapeHtml(res.word || word)}" style="padding:8px 14px;border-radius:8px;border:1px solid #a855f7;background:rgba(168,85,247,0.1);color:#c084fc;font-size:13px;font-weight:bold;cursor:pointer;transition:0.2s;display:flex;align-items:center;gap:6px;">📝 进特训库</button>
        <button id="save-lines-btn" style="padding:8px 14px;border-radius:8px;border:1px solid #10b981;background:rgba(16,185,129,0.1);color:#10b981;font-size:13px;font-weight:bold;cursor:pointer;transition:0.2s;display:flex;align-items:center;gap:6px;">💾 保存</button>
      </div>`;

    document.getElementById('speak-btn').addEventListener('click', () => {
      const cleanWord = (res.word || word).replace(/^-|-$/g, '');
      chrome.tts.speak(cleanWord, { 'lang': 'en-US' }, function() {
        if (chrome.runtime.lastError) window.speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(cleanWord), { lang: 'en-US' }));
      });
    });

    container.querySelectorAll('.source-trigger').forEach(el => {
      el.addEventListener('click', (e) => {
        const source = e.currentTarget.getAttribute('data-source');
        const lines = res.memory_lines_map[`${source}_${contextKey}`] || [];
        document.getElementById('lines-render-area').innerHTML = lines
          .filter(l => l.trim().length > 0)
          .map(l => `<div class="memory-line-item" style="display:flex;align-items:flex-start;gap:4px;margin-bottom:6px;">
              <span style="color:var(--text-muted);margin-top:2px;flex-shrink:0;">•</span>
              <div class="line-input" contenteditable="true" style="word-break:break-word;white-space:pre-wrap;min-height:22px;">${escapeHtml(l)}</div>
            </div>`).join("") || '<div style="color:var(--text-muted);font-size:14px;padding:4px 0;">无记忆画面</div>';
        container.querySelectorAll('.source-trigger').forEach(t => {
          t.getAttribute('data-source') === source ? t.classList.add('active') : t.classList.remove('active');
        });
      });
    });

    (res.parts || []).forEach((p, i) => {
      const r = document.getElementById(`row-${i}`), d = document.getElementById(`detail-${i}`);
      if (r && d) r.addEventListener('click', (e) => {
        if (!e.target.closest('.jump-root-trigger')) d.style.display = d.style.display === 'block' ? 'none' : 'block';
      });
    });

    container.querySelectorAll('.jump-root-trigger').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      analyze({ forceWord: e.currentTarget.getAttribute('data-root'), isBackAction: false, forceRefresh: false, state, els });
    }));

    document.getElementById('save-lines-btn').addEventListener('click', () => {
      const newLines = Array.from(document.querySelectorAll('#lines-render-area .line-input'))
        .map(el => (el.value !== undefined ? el.value : el.innerText).trim())
        .filter(l => l.length > 0);
      const mapKey = `${res.sourceTag}_${contextKey}`;
      chrome.storage.local.get(['W:' + word], (stored) => {
        const wordData = stored['W:' + word] || {};
        if (!wordData.memory_lines_map) wordData.memory_lines_map = {};
        wordData.memory_lines_map[mapKey] = newLines;
        if (!wordData.edited_keys) wordData.edited_keys = [];
        if (!wordData.edited_keys.includes(mapKey)) wordData.edited_keys.push(mapKey);
        chrome.storage.local.set({ ['W:' + word]: wordData }, () => showToast('✅ 已保存'));
      });
    });

    const treeBtnPopup = container.querySelector('.jump-to-tree-btn');
    if (treeBtnPopup) {
      treeBtnPopup.onmouseover = () => { treeBtnPopup.style.background = '#0ea5e9'; treeBtnPopup.style.color = '#fff'; };
      treeBtnPopup.onmouseout = () => { treeBtnPopup.style.background = 'rgba(14,165,233,0.1)'; treeBtnPopup.style.color = '#38bdf8'; };
      treeBtnPopup.addEventListener('click', (e) => {
        const targetWord = e.currentTarget.getAttribute('data-word');
        chrome.storage.local.set({ pendingTreeWord: targetWord }, () => {
          if (isInPage) window.open(chrome.runtime.getURL('options.html')); else chrome.runtime.openOptionsPage();
        });
      });
    }

    const libBtnPopup = container.querySelector('.jump-to-lib-btn');
    if (libBtnPopup) {
      libBtnPopup.onmouseover = () => { libBtnPopup.style.background = '#a855f7'; libBtnPopup.style.color = '#fff'; };
      libBtnPopup.onmouseout = () => { libBtnPopup.style.background = 'rgba(168,85,247,0.1)'; libBtnPopup.style.color = '#c084fc'; };
      libBtnPopup.addEventListener('click', (e) => {
        const targetWord = e.currentTarget.getAttribute('data-word');
        chrome.storage.local.set({ pendingLibraryWord: targetWord }, () => {
          if (isInPage) window.open(chrome.runtime.getURL('options.html')); else chrome.runtime.openOptionsPage();
        });
      });
    }
  });
}

export function updateBackBtn({ navStack, backArea, wordInput, analyze, state, els }) {
  if (navStack.length > 0) {
    backArea.style.display = 'block';
    backArea.innerHTML = `<button class="quick-select" style="background:var(--accent);color:white;border:none;" id="back-btn">🔙 返回: <b>${navStack[navStack.length - 1]}</b></button>`;
    document.getElementById('back-btn').addEventListener('click', () => {
      const previousWord = navStack.pop();
      wordInput.value = previousWord;
      updateBackBtn({ navStack, backArea, wordInput, analyze, state, els });
      analyze({ forceWord: previousWord, isBackAction: true, forceRefresh: false, state, els });
    });
  } else {
    backArea.style.display = 'none';
  }
}
