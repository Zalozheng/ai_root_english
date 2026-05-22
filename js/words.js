document.addEventListener('DOMContentLoaded', () => {
    window.loadWordsLibrary = function(callback) {
        chrome.storage.local.get(null, (items) => {
            window.globalWords = Object.keys(items).filter(k => k.startsWith('W:')).map(k => items[k]);
            window.globalRoots = Object.keys(items).filter(k => k.startsWith('R:')).map(k => items[k]);
            triggerWordFilter();
            if (callback) callback();
        });
    };

    function triggerWordFilter() {
        const searchEl = document.getElementById('word-search');
        if(!searchEl) return;
        const q = searchEl.value.toLowerCase();
        const sortType = document.getElementById('word-sort').value;
        const contextFilter = document.getElementById('word-context-filter') ? document.getElementById('word-context-filter').value : 'all';

        let filtered = window.globalWords.filter(d => {
            const matchSearch = (d.word || '').toLowerCase().includes(q) || (d.primary_meaning || '').includes(q);
            if (!matchSearch) return false;
            
            if (contextFilter === 'all') return true;
            
            // 检查该词在所选情景下是否有记忆记录
            const map = d.memory_lines_map || {};
            return Object.keys(map).some(k => k.endsWith(`_${contextFilter}`));
        });
        renderWordList(window.sortData(filtered, sortType));
    }

    if(document.getElementById('word-search')) {
        document.getElementById('word-search').addEventListener('input', triggerWordFilter);
        document.getElementById('word-sort').addEventListener('change', triggerWordFilter);
        if(document.getElementById('word-context-filter')) {
            document.getElementById('word-context-filter').addEventListener('change', triggerWordFilter);
        }
    }

    function renderWordList(words) {
        const listEl = document.getElementById('word-list');
        if(!listEl) return;
        listEl.innerHTML = words.length === 0 ? '<div style="color:#888; text-align:center; padding: 20px;">词库空空如也</div>' : '';
        words.forEach(data => {
            const actualWord = data.word || data.display_breakdown?.replace(/\./g, '') || 'Unknown';
            const freqHtml = `<span style="font-size:11px; color:#f59e0b; margin-left:8px;" title="查阅次数">🔥${data.lookup_count || 0}</span>`;
            
            const li = document.createElement('li'); li.className = 'data-item';
            li.innerHTML = `<div class="data-item-title">${window.escapeHtml(actualWord)} <div><span style="font-size:12px; color:#10b981;">/${window.escapeHtml(data.phonetic_us || '-')}/</span> ${freqHtml}</div></div><div class="data-item-sub">${window.escapeHtml(data.primary_meaning)}</div>`;
            li.addEventListener('click', () => {
                document.querySelectorAll('#word-list .data-item').forEach(el => el.classList.remove('selected'));
                li.classList.add('selected'); window.renderWordDetail(data);
            });
            listEl.appendChild(li);
        });
    }

    window.renderWordDetail = function(data) {
        const pane = document.getElementById('word-detail');
        if(!pane) return;
        
        const cleanWordKey = "W:" + (data.word || data.display_breakdown || '').toLowerCase().trim();
        chrome.storage.local.get([cleanWordKey], (res) => {
            if (res[cleanWordKey]) {
                res[cleanWordKey].lookup_count = (res[cleanWordKey].lookup_count || 0) + 1; res[cleanWordKey].updated_at = Date.now();
                chrome.storage.local.set({ [cleanWordKey]: res[cleanWordKey] });
                data.lookup_count = res[cleanWordKey].lookup_count; data.updated_at = res[cleanWordKey].updated_at;
            }
        });

        const contextKey = document.getElementById('prompt-context') ? document.getElementById('prompt-context').value : 'general';

        // 读取所有可能的 key（custom/remote/ollama），优先用有内容的
        const map = data.memory_lines_map || {};
        const customLines = map[`custom_${contextKey}`] || null;
        const apiLines    = map[`remote_${contextKey}`]  || null;
        const ollamaLines = map[`ollama_${contextKey}`]  || null;

        let mLines = data.memory_lines || []; let activeSource = "默认";
        if      (customLines && customLines.length > 0) { mLines = customLines; activeSource = "custom"; }
        else if (apiLines    && apiLines.length    > 0) { mLines = apiLines;    activeSource = "remote"; }
        else if (ollamaLines && ollamaLines.length > 0) { mLines = ollamaLines; activeSource = "ollama"; }

        let sourceTabsHtml = '';
        if (customLines || apiLines || ollamaLines) {
            sourceTabsHtml = `<div class="source-tabs">
              ${customLines ? `<div class="source-tab source-trigger ${activeSource==='custom'?'active':''}" data-source="custom">✏️ 自定义</div>` : ''}
              ${apiLines    ? `<div class="source-tab source-trigger ${activeSource==='remote'?'active':''}" data-source="remote">🌐 API</div>` : ''}
              ${ollamaLines ? `<div class="source-tab source-trigger ${activeSource==='ollama'?'active':''}" data-source="ollama">🦙 Ollama</div>` : ''}
            </div>`;
        }

        const partsHtml = (data.parts || []).map(p => `
            <div class="part-row">
              <div class="segment-box jump-root-trigger" data-root="${window.escapeHtml(p.segment)}">
                <div class="segment-text">${window.escapeHtml(p.segment)}</div><div class="segment-type">${window.escapeHtml(p.type)}</div>
              </div>
              <div class="detail-box">
                <div class="part-meaning">${window.escapeHtml(p.meaning)}</div><div class="part-origin"><b>渊源：</b>${window.escapeHtml(p.deep_origin || '无记录')}</div>
              </div>
            </div>
        `).join("");

        pane.innerHTML = `
          <div style="display:flex; align-items:center; gap:15px; margin-bottom: 20px;">
             <div class="word-breakdown">${window.escapeHtml(data.display_breakdown || data.word)}</div>
             <div class="speaker-icon play-sound-btn" data-word="${window.escapeHtml(data.word)}" title="点击朗读" style="cursor:pointer; font-size:18px; padding:4px 8px; border-radius:6px; background:rgba(14,165,233,0.1); transition:0.2s;">🔊</div>
             <div class="phonetic">/${window.escapeHtml(data.phonetic_us || '-')}/</div>
             <div class="primary-meaning">${window.escapeHtml(data.primary_meaning || '')}</div>
          </div>
          <div class="core-meaning">🎯 名词追溯：${window.escapeHtml(data.noun_source || '无记录')}</div>
          <div style="margin-top: 25px;">${partsHtml}</div>
          <div class="memory-lines">
            <div class="memory-title"><span>💡 场景联想库</span> ${sourceTabsHtml}</div>
            <div id="lines-render-area" style="color: #d1d5db; line-height: 1.6; margin-top:10px;">${mLines.map(l => `<div style="display:flex;align-items:flex-start;gap:4px;margin-bottom:6px;"><span style="color:#9ca3af;margin-top:2px;flex-shrink:0;">•</span><input class="line-input" type="text" value="${window.escapeHtml(l)}" style="flex:1;background:transparent;border:none;border-bottom:1px dashed transparent;color:#d1d5db;font-size:14px;line-height:1.6;outline:none;padding:0 2px;font-family:inherit;" onfocus="this.style.borderBottomColor='#f59e0b';this.style.background='rgba(245,158,11,0.08)'" onblur="this.style.borderBottomColor='transparent';this.style.background='transparent'"></div>`).join("") || '无联想画面'}</div>
          </div>

          <div style="margin-top: 40px; display: flex; justify-content: center; gap: 10px; padding-bottom: 30px;">
              <button class="jump-to-tree-btn" data-word="${window.escapeHtml(data.word)}" style="padding: 12px 30px; border-radius: 10px; border: 1px solid #0ea5e9; background: rgba(14,165,233,0.1); color: #38bdf8; font-size: 15px; font-weight:bold; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px;">
                  🌳 在【词树图谱】中探索全貌
              </button>
              <button id="save-lines-btn" style="padding: 12px 30px; border-radius: 10px; border: 1px solid #10b981; background: rgba(16,185,129,0.1); color: #10b981; font-size: 15px; font-weight:bold; cursor: pointer; transition: 0.2s;">
                  💾 保存
              </button>
          </div>
        `;

        pane.querySelectorAll('.source-trigger').forEach(el => {
            el.addEventListener('click', (e) => {
                const source = e.currentTarget.getAttribute('data-source');
                const lines = data.memory_lines_map[`${source}_${contextKey}`] || [];
                document.getElementById('lines-render-area').innerHTML = lines.map(l => `<div style="display:flex;align-items:flex-start;gap:4px;margin-bottom:6px;"><span style="color:#9ca3af;margin-top:2px;flex-shrink:0;">•</span><input class="line-input" type="text" value="${window.escapeHtml(l)}" style="flex:1;background:transparent;border:none;border-bottom:1px dashed transparent;color:#d1d5db;font-size:14px;line-height:1.6;outline:none;padding:0 2px;font-family:inherit;" onfocus="this.style.borderBottomColor='#f59e0b';this.style.background='rgba(245,158,11,0.08)'" onblur="this.style.borderBottomColor='transparent';this.style.background='transparent'"></div>`).join("") || '无记忆画面';
                pane.querySelectorAll('.source-trigger').forEach(t => { if (t.getAttribute('data-source') === source) t.classList.add('active'); else t.classList.remove('active'); });
            });
        });

        // ===== 直接保存编辑内容到 custom_context key =====
        const saveBtn = pane.querySelector('#save-lines-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const newLines = Array.from(pane.querySelectorAll('#lines-render-area .line-input'))
                    .map(el => el.value.trim()).filter(l => l.length > 0);
                const wordKey = 'W:' + (data.word || '').toLowerCase().trim();
                const mapKey = `custom_${contextKey}`;
                chrome.storage.local.get([wordKey], (stored) => {
                    const wordData = stored[wordKey] || {};
                    if (!wordData.memory_lines_map) wordData.memory_lines_map = {};
                    wordData.memory_lines_map[mapKey] = newLines;
                    if (!wordData.edited_keys) wordData.edited_keys = [];
                    if (!wordData.edited_keys.includes(mapKey)) wordData.edited_keys.push(mapKey);
                    chrome.storage.local.set({ [wordKey]: wordData }, () => {
                        const toast = document.createElement('div');
                        toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#111827;color:#f9fafb;padding:10px 20px;border-radius:30px;font-size:14px;font-weight:bold;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.4);';
                        toast.textContent = '✅ 已保存'; document.body.appendChild(toast); setTimeout(() => toast.remove(), 2000);
                    });
                });
            });
        }

        pane.querySelectorAll('.jump-root-trigger').forEach(el => el.addEventListener('click', () => window.jumpToRoot(el.getAttribute('data-root'))));
        
        const playBtn = pane.querySelector('.play-sound-btn');
        if (playBtn) {
            playBtn.addEventListener('click', (e) => {
                const wordToSpeak = e.currentTarget.getAttribute('data-word');
                if (wordToSpeak) { window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(wordToSpeak); utterance.lang = 'en-US'; window.speechSynthesis.speak(utterance); }
            });
        }

        // 绑定跳转词树的事件
        const treeBtn = pane.querySelector('.jump-to-tree-btn');
        if (treeBtn) {
            treeBtn.onmouseover = () => { treeBtn.style.background = '#38bdf8'; treeBtn.style.color = '#111'; };
            treeBtn.onmouseout = () => { treeBtn.style.background = 'rgba(14,165,233,0.1)'; treeBtn.style.color = '#38bdf8'; };
            
            treeBtn.addEventListener('click', (e) => {
                const targetWord = e.currentTarget.getAttribute('data-word');
                
                // 1. 切换到词树导航
                window.switchView('view-word-tree');
                
                // 2. 将当前单词填入搜索框并触发生成
                const treeSearchInput = document.getElementById('word-tree-search');
                const treeGenBtn = document.getElementById('generate-tree-btn');
                
                if (treeSearchInput && treeGenBtn) {
                    treeSearchInput.value = targetWord;
                    // 给 DOM 切换留一点时间，然后自动点击“生成”按钮
                    setTimeout(() => {
                        treeGenBtn.click();
                    }, 100);
                }
            });
        }
    };
});