document.addEventListener('DOMContentLoaded', () => {
    window.loadRootsLibrary = function(callback) {
        chrome.storage.local.get(null, (items) => {
            window.globalRoots = Object.keys(items).filter(k => k.startsWith('R:')).map(k => items[k]);
            triggerRootFilter();
            if (callback) callback();
        });
    };

    function triggerRootFilter() {
        const searchEl = document.getElementById('root-search');
        if(!searchEl) return;
        const q = searchEl.value.toLowerCase();
        const sortType = document.getElementById('root-sort').value;
        const typeFilterEl = document.getElementById('root-type-filter');
        const targetType = typeFilterEl ? typeFilterEl.value : 'all';

        let filtered = window.globalRoots.filter(d => {
            const matchSearch = (d.segment || '').toLowerCase().includes(q) || (d.meaning || '').includes(q);
            if (!matchSearch) return false;
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
        renderRootList(window.sortData(filtered, sortType));
    }

    if(document.getElementById('root-search')) {
        document.getElementById('root-search').addEventListener('input', triggerRootFilter);
        document.getElementById('root-sort').addEventListener('change', triggerRootFilter);

        const rootSort = document.getElementById('root-sort');
        if (rootSort && !document.getElementById('root-type-filter')) {
            const typeSelect = document.createElement('select'); typeSelect.id = 'root-type-filter'; typeSelect.className = rootSort.className; typeSelect.style.marginLeft = '8px';       
            typeSelect.innerHTML = `<option value="all">🏷️ 全部类型</option><option value="前缀">前缀</option><option value="词根">词根</option><option value="后缀">后缀</option><option value="组合">🧩 组合</option><option value="其他">其他</option>`;
            typeSelect.addEventListener('change', triggerRootFilter);
            rootSort.parentNode.insertBefore(typeSelect, rootSort.nextSibling);
        }
    }

    function renderRootList(roots) {
        const listEl = document.getElementById('root-list');
        if(!listEl) return;
        listEl.innerHTML = roots.length === 0 ? '<div style="color:#888; text-align:center; padding: 20px;">未收录</div>' : '';
        roots.forEach(data => {
            const li = document.createElement('li'); li.className = 'data-item';
            const freqHtml = `<span style="font-size:11px; color:#f59e0b; margin-left:8px;" title="查阅次数">🔥${data.lookup_count || 0}</span>`;
            li.innerHTML = `<div class="data-item-title"><span style="color:#38bdf8;">${window.escapeHtml(data.segment)}</span> ${freqHtml}</div><div class="data-item-sub">${window.escapeHtml(data.meaning)}</div>`;
            li.addEventListener('click', () => {
                document.querySelectorAll('#root-list .data-item').forEach(el => el.classList.remove('selected'));
                li.classList.add('selected'); window.renderRootDetail(data);
            });
            listEl.appendChild(li);
        });
    }

    window.renderRootDetail = function(data) {
        const pane = document.getElementById('root-detail');
        if(!pane) return;

        const cleanRootKey = "R:" + (data.segment || '').toLowerCase().replace(/^-|-$/g, '').trim();
        chrome.storage.local.get([cleanRootKey], (res) => {
            if (res[cleanRootKey]) {
                res[cleanRootKey].lookup_count = (res[cleanRootKey].lookup_count || 0) + 1; res[cleanRootKey].updated_at = Date.now();
                chrome.storage.local.set({ [cleanRootKey]: res[cleanRootKey] });
                data.lookup_count = res[cleanRootKey].lookup_count; data.updated_at = res[cleanRootKey].updated_at;
            }
        });

        const derivHtml = (data.derivatives || []).map(d => `<span class="deriv-tag jump-word-trigger" data-word="${window.escapeHtml(d)}">${window.escapeHtml(d)}</span>`).join('') || '<span style="color:#666;">暂无记录</span>';

        // 修复 1号位：优化下拉框样式和位置，强制深色主题和自动宽度
        pane.innerHTML = `
          <div style="margin-bottom: 20px;">
             <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                 <span style="font-size: 14px; color: #a1a1aa; text-transform: uppercase;">[ 原生记录: ${window.escapeHtml(data.type)} ]</span>
                 
                 <select class="manual-category-select" data-key="${cleanRootKey}" style="background:#27272a; color:#fff; border:1px solid #3f3f46; border-radius:6px; font-size:12px; padding:4px 8px; outline:none; cursor:pointer; width:max-content !important;" title="手动覆盖分类">
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
