document.addEventListener('DOMContentLoaded', () => {
  const wordInput = document.getElementById('word-input');
  const searchBtn = document.getElementById('search-btn');
  const regenBtn = document.getElementById('regen-btn');
  const container = document.getElementById('result-container');
  const historyEl = document.getElementById('history-container');
  const historySelect = document.getElementById('history-select');
  const backArea = document.getElementById('back-area');
  const settingsBtn = document.getElementById('settings-btn');
  const pinWindowBtn = document.getElementById('pin-window-btn');
  const quickContext = document.getElementById('quick-context');
  const quickEngine = document.getElementById('quick-engine');
  const rootToggleSwitch = document.getElementById('root-toggle-switch');
  
  let navStack = []; let currentWord = "";
  const urlParams = new URLSearchParams(window.location.search);
  const initialWord = urlParams.get('word');
  const isInPage = urlParams.get('mode') === 'in_page';

  chrome.storage.local.get(['app_config', 'ui_theme'], (res) => {
    document.body.setAttribute('data-theme', res.ui_theme || 'system');
    let config = res.app_config || {};
    quickContext.value = config.promptContext || 'general';
    quickEngine.value = config.engine || 'custom';
    rootToggleSwitch.checked = (config.rootStrategy || 'keep_old') === 'keep_old';
  });

  rootToggleSwitch.addEventListener('change', (e) => {
    chrome.storage.local.get(['app_config'], (res) => {
        let config = res.app_config || {};
        config.rootStrategy = e.target.checked ? 'keep_old' : 'force_new';
        chrome.storage.local.set({ app_config: config }, () => {
            showToast(e.target.checked ? "🛡️ 护根已开启：保护旧笔记" : "⚔️ 护根关闭：新解析将覆盖");
        });
    });
  });

  quickContext.addEventListener('change', () => {
    chrome.storage.local.get(['app_config'], (res) => {
      let config = res.app_config || {}; config.promptContext = quickContext.value;
      chrome.storage.local.set({ app_config: config }, () => {
        showToast("✅ 情景已切换，即将重新解析");
        if (wordInput.value.trim()) analyze(wordInput.value.trim(), true);
      });
    });
  });

  quickEngine.addEventListener('change', () => {
    chrome.storage.local.get(['app_config'], (res) => {
      let config = res.app_config || {}; config.engine = quickEngine.value;
      chrome.storage.local.set({ app_config: config }, () => {
        showToast("✅ 引擎已切换");
        if (wordInput.value.trim()) analyze(wordInput.value.trim(), true);
      });
    });
  });

  settingsBtn.addEventListener('click', () => {
    if (isInPage) window.open(chrome.runtime.getURL('options.html')); else chrome.runtime.openOptionsPage();
  });

  // ====== 📌 动态图钉交互逻辑（实现开关环路） ======
  if (pinWindowBtn) {
    if (isInPage) {
        // 如果我们已经在独立的脱离窗口里，把图标变成“取消固定”
        pinWindowBtn.innerText = '❌';
        pinWindowBtn.setAttribute('data-tooltip', '❌ 取消固定\n关闭当前独立窗口');
    }

    pinWindowBtn.addEventListener('click', () => {
        if (isInPage) {
            // 在独立窗口里，点击就是直接关掉
            window.close();
        } else {
            // 在原生脆弱弹窗里，点击就是拔起一个新窗口并自毁原生框
            const targetWord = wordInput.value.trim();
            const url = chrome.runtime.getURL(`popup.html?mode=in_page&word=${encodeURIComponent(targetWord)}`);
            chrome.windows.create({
                url: url,
                type: "popup",
                width: 440,
                height: 700,
                focused: true
            });
            window.close();
        }
    });
  }

  function fetchWordFromPage() {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if(tabs.length === 0) return; const tab = tabs[0];
      if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://'))) return;
      chrome.scripting.executeScript({ target: {tabId: tab.id, allFrames: true}, func: () => window.getSelection().toString().trim() }, (results) => {
        if (chrome.runtime.lastError) return;
        if (results && results.length > 0) {
          const selected = results.map(r => r.result).find(text => text && text.length > 0 && text.length < 30 && /^[a-zA-Z\-\']+$/.test(text));
          if (selected) { 
              chrome.storage.local.get(['app_config'], (res) => {
                  const config = res.app_config || {};
                  wordInput.value = selected; 
                  if (config.autoParse !== 'manual') {
                      navStack = []; updateBackBtn(); analyze(); 
                  }
              });
          }
        }
      });
    });
  }

  function updateBackBtn() {
      if (navStack.length > 0) {
          backArea.style.display = 'block';
          backArea.innerHTML = `<button class="quick-select" style="background:var(--accent);color:white;border:none;" id="back-btn">🔙 返回: <b>${navStack[navStack.length - 1]}</b></button>`;
          document.getElementById('back-btn').addEventListener('click', () => {
              const previousWord = navStack.pop(); wordInput.value = previousWord; updateBackBtn(); analyze(previousWord, true);
          });
      } else backArea.style.display = 'none';
  }

  function loadHistory() {
    chrome.storage.local.get(['history_list'], (res) => {
      const list = res.history_list || [];
      if (list.length > 0) {
        historySelect.innerHTML = '<option value="">-- 选择历史记录 --</option>' + list.map(w => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join('');
        historyEl.style.display = 'flex';
      } else { historyEl.style.display = 'none'; }
    });
  }

  historySelect.addEventListener('change', (e) => {
     if(e.target.value) { wordInput.value = e.target.value; navStack = []; updateBackBtn(); analyze(); e.target.value = ""; }
  });

  function saveHistory(word) {
    if (!word) return;
    chrome.storage.local.get(['history_list', 'app_config'], (res) => {
      let limit = parseInt((res.app_config || {}).historyLimit || 10);
      let list = res.history_list || []; list = list.filter(w => w !== word); 
      list.unshift(word); list = list.slice(0, limit); chrome.storage.local.set({ history_list: list }, loadHistory);
    });
  }

  loadHistory();
  
  if (initialWord) { 
      wordInput.value = initialWord; 
      chrome.storage.local.get(['app_config'], (res) => {
          if ((res.app_config || {}).autoParse !== 'manual') { analyze(initialWord); }
      });
  } else if (!isInPage) { 
      fetchWordFromPage(); 
  }

  function escapeHtml(str) { return (str||'').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function showToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--text); color:var(--bg); padding:10px 20px; border-radius:30px; font-size:14px; font-weight:bold; z-index:9999; box-shadow:0 10px 30px var(--shadow); white-space:nowrap;`;
    t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2500);
  }

  function analyze(forceWord = null, isBackAction = false, forceRefresh = false) {
    const word = forceWord || wordInput.value.trim().toLowerCase();
    if (!word) return;
    if (!isBackAction && currentWord && currentWord !== word) navStack.push(currentWord);
    currentWord = word; updateBackBtn();

    wordInput.value = word; 
    container.innerHTML = `<div class="loading"><h3>${forceRefresh ? '🔄 强制引擎重算中' : '🧠 AI 引擎解析中'}</h3><p>「${escapeHtml(word)}」</p></div>`;
    
    chrome.runtime.sendMessage({ action: "fetchLLM", word: word, forceRefresh: forceRefresh }, (response) => {
      if (!response || !response.success) {
         container.innerHTML = `<div class="error"><b>请求被拒绝或失败</b><br><br>${escapeHtml(response?.error || "未知网络错误")}<br><br><button id="go-settings-btn" class="quick-select">⚙️ 检查配置</button></div>`;
         document.getElementById('go-settings-btn').addEventListener('click', () => {
             if (isInPage) window.open(chrome.runtime.getURL('options.html')); else chrome.runtime.openOptionsPage();
         });
         return;
      }
      saveHistory(word);

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
          </div>
        `;
      }).join("");

      let sourceTagText = "混合源";
      if (res.sourceTag === 'remote') sourceTagText = "🌐 API";
      if (res.sourceTag === 'ollama') sourceTagText = "🦙 Ollama";

      const contextKey = document.getElementById('quick-context').value;
      const apiLines = res.memory_lines_map ? res.memory_lines_map[`remote_${contextKey}`] : null;
      const ollamaLines = res.memory_lines_map ? res.memory_lines_map[`ollama_${contextKey}`] : null;
      let activeSource = res.sourceTag;

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
                <div class="line-input" contenteditable="true" style="word-break: break-word; white-space: pre-wrap; min-height: 22px;">${escapeHtml(l)}</div>
              </div>`).join("")}</div>
        </div>

        <div style="margin-top: 25px; display: flex; justify-content: center; gap: 8px; padding-bottom: 10px;">
            <button class="jump-to-tree-btn" data-word="${escapeHtml(res.word || word)}" style="padding: 8px 14px; border-radius: 8px; border: 1px solid #0ea5e9; background: rgba(14,165,233,0.1); color: #38bdf8; font-size: 13px; font-weight:bold; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px;">
                🌳 词树图展开
            </button>
            <button class="jump-to-lib-btn" data-word="${escapeHtml(res.word || word)}" style="padding: 8px 14px; border-radius: 8px; border: 1px solid #a855f7; background: rgba(168,85,247,0.1); color: #c084fc; font-size: 13px; font-weight:bold; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px;">
                📝 进特训库
            </button>
            <button id="save-lines-btn" style="padding: 8px 14px; border-radius: 8px; border: 1px solid #10b981; background: rgba(16,185,129,0.1); color: #10b981; font-size: 13px; font-weight:bold; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px;">
                💾 保存
            </button>
        </div>
      `;
      
      document.getElementById('speak-btn').addEventListener('click', () => {
         const cleanWord = (res.word || word).replace(/^-|-$/g, '');
         chrome.tts.speak(cleanWord, { 'lang': 'en-US' }, function() {
            if (chrome.runtime.lastError) window.speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(cleanWord), {lang:'en-US'}));
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
                    <div class="line-input" contenteditable="true" style="word-break: break-word; white-space: pre-wrap; min-height: 22px;">${escapeHtml(l)}</div>
                </div>`).join("") || '<div style="color:var(--text-muted); font-size:14px; padding:4px 0;">无记忆画面</div>';
              
              container.querySelectorAll('.source-trigger').forEach(t => {
                  if (t.getAttribute('data-source') === source) t.classList.add('active'); else t.classList.remove('active');
              });
          });
      });
      
      (res.parts || []).forEach((p, i) => {
          const r = document.getElementById(`row-${i}`), d = document.getElementById(`detail-${i}`);
          if(r && d) r.addEventListener('click', (e) => { if (!e.target.closest('.jump-root-trigger')) d.style.display = d.style.display === 'block' ? 'none' : 'block'; });
      });
      
      container.querySelectorAll('.jump-root-trigger').forEach(btn => btn.addEventListener('click', (e) => {
          e.stopPropagation(); analyze(e.currentTarget.getAttribute('data-root'), false, false);
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
                  if (isInPage) {
                      window.open(chrome.runtime.getURL('options.html'));
                  } else {
                      chrome.runtime.openOptionsPage(); 
                  }
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
                  if (isInPage) {
                      window.open(chrome.runtime.getURL('options.html'));
                  } else {
                      chrome.runtime.openOptionsPage(); 
                  }
              });
          });
      }

    });
  }

  searchBtn.addEventListener('click', () => { navStack = []; updateBackBtn(); analyze(null, false, false); });
  regenBtn.addEventListener('click', () => { 
    const word = wordInput.value.trim().toLowerCase();
    if (!word) return;
    
    navStack = []; 
    updateBackBtn(); 
    
    chrome.storage.local.get(['W:' + word], (stored) => {
      let wordData = stored['W:' + word];
      if (wordData && wordData.edited_keys) {
        delete wordData.edited_keys; 
        chrome.storage.local.set({ ['W:' + word]: wordData }, () => {
          analyze(null, false, true); 
        });
      } else {
        analyze(null, false, true); 
      }
    });
  });
  wordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { navStack = []; updateBackBtn(); analyze(null, false, false); } });
});