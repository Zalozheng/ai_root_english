document.addEventListener('DOMContentLoaded', () => {
    window.loadRootsLibrary = function(callback) {
        return new Promise(async (resolve) => {
            try {
                const db = await window.dbEngine.init();
                const transaction = db.transaction(['roots'], 'readonly');
                const store = transaction.objectStore('roots');
                const request = store.getAll();
                
                request.onsuccess = () => {
                    window.globalRoots = request.result;
                    if (!window.globalWords || window.globalWords.length === 0) {
                        const wordTx = db.transaction(['words'], 'readonly');
                        const wordStore = wordTx.objectStore('words');
                        const wordReq = wordStore.getAll();
                        wordReq.onsuccess = () => {
                            window.globalWords = wordReq.result;
                            window.triggerRootFilter();
                            if (callback) callback();
                            resolve();
                        };
                        wordReq.onerror = () => resolve();
                    } else {
                        window.triggerRootFilter();
                        if (callback) callback();
                        resolve();
                    }
                };
                request.onerror = () => resolve();
            } catch (err) {
                chrome.storage.local.get(null, (items) => {
                    window.globalRoots = Object.keys(items).filter(k => k.startsWith('R:')).map(k => items[k]);
                    window.globalWords = Object.keys(items).filter(k => k.startsWith('W:')).map(k => items[k]);
                    window.triggerRootFilter();
                    if (callback) callback();
                    resolve();
                });
            }
        });
    };

    window.clearRootDetail = function() {
        const pane = document.getElementById('root-detail');
        if(pane) {
            pane.innerHTML = `
                <div class="empty-state">
                    <div style="background: rgba(56, 189, 248, 0.05); width: 120px; height: 120px; border-radius: 60px; display: flex; align-items: center; justify-content: center; margin-bottom: 25px; border: 1px solid rgba(56, 189, 248, 0.1);">
                        <span style="font-size: 60px;">🌱</span>
                    </div>
                    <div style="font-size: 20px; font-weight: bold; color: #fff; margin-bottom: 10px;">词源图谱库</div>
                    <div style="color: #71717a; line-height: 1.6;">请从左侧列表选择一个词根<br>探寻古老的文字图谱</div>
                </div>
            `;
        }
    };

    // 性能优化：缓存情景与词根的映射关系
    window.contextRootMap = null;
    function buildContextRootMap() {
        if (!window.globalWords) return;
        const map = {};
        window.globalWords.forEach(w => {
            const mLinesMap = w.memory_lines_map || {};
            const wordRoots = (w.parts || []).map(p => (p.segment || '').toLowerCase().replace(/^-|-$/g, '').trim()).filter(Boolean);
            
            Object.keys(mLinesMap).forEach(k => {
                if (k.includes('_')) {
                    const ctxId = k.split('_').slice(1).join('_');
                    if (!map[ctxId]) map[ctxId] = new Set();
                    wordRoots.forEach(r => map[ctxId].add(r));
                }
            });
        });
        window.contextRootMap = map;
    }

    window.triggerRootFilter = function() {
        const searchEl = document.getElementById('root-search');
        if(!searchEl) return;
        const q = searchEl.value.toLowerCase();
        const sortType = document.getElementById('root-sort').value;
        const typeFilterEl = document.getElementById('root-type-filter');
        const targetType = typeFilterEl ? typeFilterEl.value : 'all';
        const contextFilter = document.getElementById('root-context-filter') ? document.getElementById('root-context-filter').value : 'all';

        // 如果需要按情景过滤，且还没构建映射表，则构建之
        if (contextFilter !== 'all' && !window.contextRootMap) {
            buildContextRootMap();
        }

        let filtered = window.globalRoots.filter(d => {
            const matchSearch = (d.segment || '').toLowerCase().includes(q) || (d.meaning || '').includes(q);
            if (!matchSearch) return false;

            // 极速过滤：直接查表，不再跑 O(N*M) 的嵌套循环
            if (contextFilter !== 'all' && window.contextRootMap) {
                const rootSeg = (d.segment || '').toLowerCase().replace(/^-|-$/g, '').trim();
                const rootsInCtx = window.contextRootMap[contextFilter];
                if (!rootsInCtx || !rootsInCtx.has(rootSeg)) return false;
            }

            if (targetType === 'all') return true;
            if (d.manual_category) return d.manual_category === targetType;
            
            const dtype = (d.type || '').toLowerCase();
            const hasPrefix = dtype.includes('前缀'); const hasRoot = dtype.includes('词根'); const hasSuffix = dtype.includes('后缀');
            const typeCount = (hasPrefix ? 1 : 0) + (hasRoot ? 1 : 0) + (hasSuffix ? 1 : 0);
            const isComposite = typeCount >= 2 || (d.segment && d.segment.includes('+'));

            if (targetType === '组合') return isComposite;
            else if (targetType === '前缀') return hasPrefix && !isComposite;
            else if (targetType === '词根') return hasRoot && !isComposite;
            else if (targetType === '后缀') return hasSuffix && !isComposite;
            else if (targetType === '其他') return !hasPrefix && !hasRoot && !hasSuffix && !isComposite;
            return false;
        });

        // 更新数量显示
        const countValueEl = document.querySelector('#root-count .count-value');
        if (countValueEl) countValueEl.textContent = filtered.length;

        window.currentFilteredRoots = window.sortData(filtered, sortType);
        window.currentRootPage = 1;
        renderRootList();
    }

    if(document.getElementById('root-search')) {
        document.getElementById('root-search').addEventListener('input', window.triggerRootFilter);
        document.getElementById('root-sort').addEventListener('change', window.triggerRootFilter);
        if(document.getElementById('root-type-filter')) {
            document.getElementById('root-type-filter').addEventListener('change', window.triggerRootFilter);
        }
        if(document.getElementById('root-context-filter')) {
            document.getElementById('root-context-filter').addEventListener('change', window.triggerRootFilter);
        }
    }

    function renderRootList() {
        const listEl = document.getElementById('root-list');
        if(!listEl) return;
        
        const roots = window.currentFilteredRoots || [];
        const ROOTS_PER_PAGE = 5;
        const totalItems = roots.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / ROOTS_PER_PAGE));
        
        if (!window.currentRootPage || window.currentRootPage < 1) window.currentRootPage = 1;
        if (window.currentRootPage > totalPages) window.currentRootPage = totalPages;
        
        const startIndex = (window.currentRootPage - 1) * ROOTS_PER_PAGE;
        const displayRoots = roots.slice(startIndex, startIndex + ROOTS_PER_PAGE);
        
        listEl.innerHTML = displayRoots.length === 0 ? '<div style="color:#888; text-align:center; padding: 20px;">未收录</div>' : '';
        
        displayRoots.forEach(data => {
            const li = document.createElement('li'); 
            li.className = 'data-item';
            const freqHtml = `<span style="font-size:11px; color:#f59e0b; margin-left:8px;" title="查阅次数">🔥${data.lookup_count || 0}</span>`;
            li.innerHTML = `<div class="data-item-title"><span style="color:#38bdf8;">${window.escapeHtml(data.segment)}</span> ${freqHtml}</div><div class="data-item-sub">${window.escapeHtml(data.meaning || '点击查看详情')}</div>`;
            li.addEventListener('click', () => {
                document.querySelectorAll('#root-list .data-item').forEach(el => el.classList.remove('selected'));
                li.classList.add('selected'); 
                window.renderRootDetail(data);
            });
            listEl.appendChild(li);
        });

        let paginationEl = document.getElementById('root-pagination');
        if (!paginationEl) {
            paginationEl = document.createElement('div');
            paginationEl.id = 'root-pagination';
            paginationEl.style.cssText = 'padding: 8px 10px; border-top: 1px solid #333; display: flex; justify-content: space-between; align-items: center; background: #1a1a1a; flex-shrink: 0;';
            listEl.parentNode.appendChild(paginationEl);
        }
        
        if (totalItems > 0) {
            paginationEl.innerHTML = `
                <button id="root-prev-btn" style="background:#27272a; border:1px solid #3f3f46; color:#fff; border-radius:4px; padding:4px 10px; cursor:${window.currentRootPage > 1 ? 'pointer' : 'not-allowed'}; opacity:${window.currentRootPage > 1 ? 1 : 0.5}; font-size:12px;">◀</button>
                <div style="display:flex; align-items:center; gap:4px; color:#a1a1aa; font-size:12px;">
                    <input type="number" id="root-page-input" value="${window.currentRootPage}" min="1" max="${totalPages}" style="width:36px; padding:2px; background:#0f0f11; border:1px solid #3f3f46; color:#fff; text-align:center; border-radius:4px; outline:none; -moz-appearance:textfield;">
                    <span>/ ${totalPages}</span>
                </div>
                <button id="root-next-btn" style="background:#27272a; border:1px solid #3f3f46; color:#fff; border-radius:4px; padding:4px 10px; cursor:${window.currentRootPage < totalPages ? 'pointer' : 'not-allowed'}; opacity:${window.currentRootPage < totalPages ? 1 : 0.5}; font-size:12px;">▶</button>
            `;

            document.getElementById('root-prev-btn').addEventListener('click', () => {
                if (window.currentRootPage > 1) { window.currentRootPage--; renderRootList(); }
            });
            document.getElementById('root-next-btn').addEventListener('click', () => {
                if (window.currentRootPage < totalPages) { window.currentRootPage++; renderRootList(); }
            });
            document.getElementById('root-page-input').addEventListener('change', (e) => {
                let val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 1 && val <= totalPages) {
                    window.currentRootPage = val;
                    renderRootList();
                } else {
                    e.target.value = window.currentRootPage;
                }
            });
        } else {
            paginationEl.innerHTML = '';
        }
    }

    window.renderRootDetail = async function(data) {
        const pane = document.getElementById('root-detail');
        if(!pane) return;

        const rootId = data.id || ("R:" + (data.segment || '').toLowerCase().replace(/^-|-$/g, '').trim());
        let fullData = data;
        try {
            const dbData = await window.dbEngine.get('roots', rootId);
            if (dbData) {
                fullData = dbData;
                fullData.lookup_count = (fullData.lookup_count || 0) + 1;
                fullData.updated_at = Date.now();
                window.dbEngine.batchSave('roots', { [rootId]: fullData });
                chrome.storage.local.set({ [rootId]: fullData });
            }
        } catch(e) { console.error('获取详情失败', e); }

        const derivHtml = (fullData.derivatives || []).map(d => `<span class="deriv-tag jump-word-trigger" data-word="${window.escapeHtml(d)}">${window.escapeHtml(d)}</span>`).join('') || '<span style="color:#666;">暂无记录</span>';

        // 修复 1号位：优化下拉框样式和位置，强制深色主题和自动宽度
        pane.innerHTML = `
          <div style="margin-bottom: 20px;">
             <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                 <span style="font-size: 14px; color: #a1a1aa; text-transform: uppercase;">[ 原生记录: ${window.escapeHtml(data.type)} ]</span>
                 
                 <select class="manual-category-select" data-key="${rootId}" style="background:#27272a; color:#fff; border:1px solid #3f3f46; border-radius:6px; font-size:12px; padding:4px 8px; outline:none; cursor:pointer; width:max-content !important;" title="手动覆盖分类">
                     <option value="" style="background:#1e1e1e; color:#fff;">⚙️ 自动分配</option>
                     <option value="前缀" style="background:#1e1e1e; color:#fff;" ${data.manual_category === '前缀' ? 'selected' : ''}>📌 强制归为: 前缀</option>
                     <option value="词根" style="background:#1e1e1e; color:#fff;" ${data.manual_category === '词根' ? 'selected' : ''}>🌱 强制归为: 词根</option>
                     <option value="后缀" style="background:#1e1e1e; color:#fff;" ${data.manual_category === '后缀' ? 'selected' : ''}>🪝 强制归为: 后缀</option>
                     <option value="组合" style="background:#1e1e1e; color:#fff;" ${data.manual_category === '组合' ? 'selected' : ''}>🧩 强制归为: 组合</option>
                     <option value="其他" style="background:#1e1e1e; color:#fff;" ${data.manual_category === '其他' ? 'selected' : ''}>📦 强制归为: 其他</option>
                 </select>
             </div>
             
             <div style="font-size: 48px; font-weight: 900; color: #38bdf8; margin: 10px 0;">${window.escapeHtml(data.segment)}</div>
             <div style="font-size: 20px; font-weight: bold; color: #fff;">${window.escapeHtml(data.meaning)}</div>
          </div>
          
          <div class="root-origin-card">
              <div style="color: #38bdf8; font-weight: 800; font-size: 16px; margin-bottom: 12px;">📖 历史渊源与故事</div>
              <div class="root-origin-text">${window.escapeHtml(data.deep_origin || '暂无深度渊源记录。')}</div>
          </div>
          
          <div style="margin-top: 30px;">
              <div style="color: #a1a1aa; font-weight: bold; margin-bottom: 15px;">🌿 记录在案的派生词库</div>
              <div class="root-deriv-box">${derivHtml}</div>
          </div>

          <div style="margin-top: 50px; display: flex; justify-content: center; padding-bottom: 30px;">
              <button class="jump-to-tree-btn" data-segment="${window.escapeHtml(data.segment)}" style="padding: 12px 30px; border-radius: 10px; border: 1px solid #0ea5e9; background: rgba(14,165,233,0.1); color: #38bdf8; font-size: 15px; font-weight:bold; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px;">
                  🌳 在【词树图谱】中探索全貌
              </button>
          </div>
        `;

        pane.querySelectorAll('.jump-word-trigger').forEach(el => el.addEventListener('click', () => window.jumpToWord(el.getAttribute('data-word'))));
        
        pane.querySelectorAll('.manual-category-select').forEach(el => {
            el.addEventListener('change', (e) => {
                const newCategory = e.target.value; const rootKey = e.target.getAttribute('data-key');
                chrome.storage.local.get([rootKey], (res) => {
                    if (res[rootKey]) {
                        if (newCategory) res[rootKey].manual_category = newCategory; else delete res[rootKey].manual_category;
                        chrome.storage.local.set({ [rootKey]: res[rootKey] }, () => {
                            data.manual_category = newCategory; triggerRootFilter(); window.showStatus('✅ 分类已更正！', '#10b981');
                        });
                    }
                });
            });
        });

        // 绑定 2号位 的跳转和生成事件
        const treeBtn = pane.querySelector('.jump-to-tree-btn');
        if (treeBtn) {
            treeBtn.onmouseover = () => { treeBtn.style.background = '#38bdf8'; treeBtn.style.color = '#111'; };
            treeBtn.onmouseout = () => { treeBtn.style.background = 'rgba(14,165,233,0.1)'; treeBtn.style.color = '#38bdf8'; };
            
            treeBtn.addEventListener('click', (e) => {
                const segment = e.currentTarget.getAttribute('data-segment');
                
                // 1. 切换到词树导航标签
                window.switchView('view-word-tree');
                
                // 2. 找到词树的搜索框并填入当前词根
                const treeSearchInput = document.getElementById('word-tree-search');
                const treeGenBtn = document.getElementById('generate-tree-btn');
                
                if (treeSearchInput && treeGenBtn) {
                    treeSearchInput.value = segment;
                    // 稍微延迟 100 毫秒点击生成，确保 DOM 已经完全切过去可见
                    setTimeout(() => {
                        treeGenBtn.click();
                    }, 100);
                }
            });
        }
    };
});