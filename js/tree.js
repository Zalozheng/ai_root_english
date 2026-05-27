document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('word-tree-search');
    const searchBtn = document.getElementById('generate-tree-btn');
    
    let globalWords = [];
    let globalRoots = [];
    
    let currentMaxDepth = 2; 
    let showChinese = false; 
    let showRoots = true;
    let showWords = true;
    let treeHistory = [];

    // ==========================================
    // 1. UI 注入：历史记录输入框改造 (1号位)
    // ==========================================
    if (searchInput && searchInput.parentNode && !document.getElementById('tree-history-dropdown')) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative; flex:1; max-width:300px; display:flex;';
        searchInput.parentNode.insertBefore(wrapper, searchInput);
        wrapper.appendChild(searchInput);
        searchInput.style.maxWidth = 'none';

        const historyDropdown = document.createElement('div');
        historyDropdown.id = 'tree-history-dropdown';
        historyDropdown.style.cssText = 'display:none; position:absolute; top:100%; left:0; right:0; background:#1e293b; border:1px solid #38bdf8; border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,0.8); z-index:10001; max-height:250px; overflow-y:auto; margin-top:5px; flex-direction:column;';
        wrapper.appendChild(historyDropdown);

        function renderHistory(query = '') {
            historyDropdown.innerHTML = '';
            const filtered = treeHistory.filter(w => w.toLowerCase().includes(query.toLowerCase()));
            if (filtered.length === 0) { historyDropdown.style.display = 'none'; return; }
            
            historyDropdown.style.display = 'flex';
            filtered.forEach(w => {
                const item = document.createElement('div');
                item.style.cssText = 'padding:10px 14px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; color:#bae6fd; font-size:14px; border-bottom:1px solid #333; transition:0.2s;';
                item.innerHTML = `<span style="flex:1;">${window.escapeHtml(w)}</span><span class="del-btn" style="color:#ef4444; font-weight:bold; font-size:16px; padding:0 8px;" title="删除此条记录">×</span>`;
                
                item.addEventListener('mouseenter', () => item.style.background = '#0f172a');
                item.addEventListener('mouseleave', () => item.style.background = 'transparent');
                
                item.querySelector('span').addEventListener('click', (e) => {
                    e.stopPropagation(); searchInput.value = w; historyDropdown.style.display = 'none'; triggerRender(w);
                });
                
                item.querySelector('.del-btn').addEventListener('click', (e) => {
                    e.stopPropagation(); treeHistory = treeHistory.filter(hw => hw !== w);
                    chrome.storage.local.set({ tree_search_history: treeHistory }); renderHistory(searchInput.value);
                });
                historyDropdown.appendChild(item);
            });

            const clearBtn = document.createElement('div');
            clearBtn.style.cssText = 'padding:10px; text-align:center; color:#ef4444; font-size:12px; cursor:pointer; font-weight:bold; background:#18181b; border-radius:0 0 8px 8px; transition:0.2s;';
            clearBtn.innerText = '🗑️ 清空所有历史';
            clearBtn.addEventListener('mouseenter', () => clearBtn.style.background = '#27272a');
            clearBtn.addEventListener('mouseleave', () => clearBtn.style.background = '#18181b');
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation(); treeHistory = []; chrome.storage.local.set({ tree_search_history: treeHistory }); historyDropdown.style.display = 'none';
            });
            historyDropdown.appendChild(clearBtn);
        }

        searchInput.addEventListener('focus', () => renderHistory(searchInput.value));
        searchInput.addEventListener('input', () => renderHistory(searchInput.value));
        document.addEventListener('mousedown', (e) => { if (!wrapper.contains(e.target)) historyDropdown.style.display = 'none'; });
    }

    function saveToHistory(word) {
        if (!word) return;
        treeHistory = treeHistory.filter(w => w !== word);
        treeHistory.unshift(word);
        if (treeHistory.length > 30) treeHistory.pop();
        chrome.storage.local.set({ tree_search_history: treeHistory });
    }

    // ==========================================
    // 2. UI 注入：控制器、记忆开关、说明 (2号位)
    // ==========================================
    if (searchBtn && !document.getElementById('tree-depth-controls')) {
        const controlsHtml = `
            <div id="tree-depth-controls" style="display:flex; align-items:center; gap:12px; margin-left:15px; background:#18181b; padding:6px 16px; border-radius:8px; border:1px solid #3f3f46; flex-wrap:wrap;">
                <span style="color:#a1a1aa; font-size:13px; font-weight:bold;">🌲 层级:</span>
                <button id="depth-minus" class="ctrl-btn">-</button>
                <span id="depth-display" style="color:#f59e0b; font-weight:900; width:20px; text-align:center; font-size:18px;">${currentMaxDepth}</span>
                <button id="depth-plus" class="ctrl-btn">+</button>
                <div style="width:1px; height:20px; background:#3f3f46; margin: 0 2px;"></div>
                <label style="display:flex; align-items:center; gap:4px; color:#10b981; font-size:13px; cursor:pointer; font-weight:bold;" title="显示/隐藏节点中文释义">
                    <input type="checkbox" id="show-chinese-toggle" style="cursor:pointer;"> 译
                </label>
                <label style="display:flex; align-items:center; gap:4px; color:#7dd3fc; font-size:13px; cursor:pointer; font-weight:bold;" title="显示/隐藏词根节点">
                    <input type="checkbox" id="show-roots-toggle" style="cursor:pointer;"> 词根
                </label>
                <label style="display:flex; align-items:center; gap:4px; color:#bae6fd; font-size:13px; cursor:pointer; font-weight:bold;" title="显示/隐藏派生词节点">
                    <input type="checkbox" id="show-words-toggle" style="cursor:pointer;"> 词汇
                </label>
                <div style="width:1px; height:20px; background:#3f3f46; margin: 0 2px;"></div>
                <button id="save-tree-settings-btn" title="将当前层级和开关状态保存为默认" style="background:transparent; border:none; font-size:14px; cursor:pointer; color:#38bdf8; transition:0.2s; font-weight:bold; display:flex; align-items:center; gap:4px;">
                    💾 保存
                </button>
                <div style="width:1px; height:20px; background:#3f3f46; margin: 0 2px;"></div>
                <div class="dropdown-wrapper" style="position:relative; cursor:pointer;">
                    <div id="dropdown-trigger" style="color:#38bdf8; font-size:13px; font-weight:bold; display:flex; align-items:center; gap:4px;">💡 说明 ▾</div>
                    <div id="dropdown-menu" class="dropdown-content" style="display:none; position:absolute; top:120%; left:-50px; background:#1e293b; border:1px solid #38bdf8; padding:12px; border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,0.8); width:240px; z-index:9999;">
                        <ul style="margin:0; padding-left:15px; font-size:12px; color:#bae6fd; line-height:1.8;">
                            <li><b>左键单击：</b>高亮节点 (若库中无此词则自动生成)</li>
                            <li><b>长按左键：</b>弹出“返回库中查看”按钮</li>
                            <li><b>中键双击：</b>高亮节点瞬间居中</li>
                            <li><b>滚轮/拖拽：</b>缩放和平移画布</li>
                        </ul>
                    </div>
                </div>
                <button id="tree-fullscreen-btn" title="全屏显示" style="background:transparent; border:none; font-size:16px; cursor:pointer; color:#a1a1aa; margin-left:5px;">⛶</button>
            </div>
        `;
        searchBtn.insertAdjacentHTML('afterend', controlsHtml);

        chrome.storage.local.get(['tree_settings', 'tree_search_history'], (res) => {
            if (res.tree_search_history) treeHistory = res.tree_search_history;
            if (res.tree_settings) {
                currentMaxDepth = res.tree_settings.depth || 2;
                showChinese = !!res.tree_settings.showChinese;
                showRoots = res.tree_settings.showRoots !== false; 
                showWords = res.tree_settings.showWords !== false;
            }
            document.getElementById('depth-display').innerText = currentMaxDepth;
            document.getElementById('show-chinese-toggle').checked = showChinese;
            document.getElementById('show-roots-toggle').checked = showRoots;
            document.getElementById('show-words-toggle').checked = showWords;
        });

        document.getElementById('show-chinese-toggle').addEventListener('change', (e) => { showChinese = e.target.checked; if(searchInput.value) triggerRender(searchInput.value); });
        document.getElementById('show-roots-toggle').addEventListener('change', (e) => { showRoots = e.target.checked; if(searchInput.value) triggerRender(searchInput.value); });
        document.getElementById('show-words-toggle').addEventListener('change', (e) => { showWords = e.target.checked; if(searchInput.value) triggerRender(searchInput.value); });

        document.getElementById('depth-minus').addEventListener('click', () => {
            if(currentMaxDepth > 1) { currentMaxDepth--; document.getElementById('depth-display').innerText = currentMaxDepth; if(searchInput.value) triggerRender(searchInput.value); }
        });
        document.getElementById('depth-plus').addEventListener('click', () => {
            if(currentMaxDepth < 10) { currentMaxDepth++; document.getElementById('depth-display').innerText = currentMaxDepth; if(searchInput.value) triggerRender(searchInput.value); }
        });

        document.getElementById('save-tree-settings-btn').addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const settings = { depth: currentMaxDepth, showChinese, showRoots, showWords };
            chrome.storage.local.set({ tree_settings: settings }, () => {
                const oldText = btn.innerHTML;
                btn.innerHTML = '✅ 已保存';
                btn.style.color = '#10b981';
                setTimeout(() => { btn.innerHTML = oldText; btn.style.color = '#38bdf8'; }, 1500);
            });
        });

        document.querySelector('.dropdown-wrapper').addEventListener('mouseenter', () => document.getElementById('dropdown-menu').style.display = 'block');
        document.querySelector('.dropdown-wrapper').addEventListener('mouseleave', () => document.getElementById('dropdown-menu').style.display = 'none');
    }

    const contextMenu = document.createElement('div');
    contextMenu.id = 'tree-context-menu';
    contextMenu.style.cssText = 'display:none; position:fixed; z-index:10000; background:#1e293b; border:1px solid #38bdf8; padding:10px; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.7);';
    contextMenu.innerHTML = `<button id="ctx-jump-btn" style="background:#0ea5e9; color:#fff; border:none; padding:8px 15px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:13px; white-space:nowrap;">🔙 返回库中查看详情</button>`;
    document.body.appendChild(contextMenu);

    // ==========================================
    // 3. CSS 样式 (内置中文释义样式，解决选中与报错)
    // ==========================================
    const style = document.createElement('style');
    style.innerHTML = `
        #view-word-tree { height: calc(100vh - 120px) !important; flex-direction: column; overflow: hidden; }
        #word-tree-container { flex: 1 !important; cursor: grab; overflow: hidden !important; background: #111113 !important; position: relative; user-select: none !important; -webkit-user-select: none !important; }
        #word-tree-container:active { cursor: grabbing; }
        .ctrl-btn { background:#27272a; border:1px solid #4b5563; color:#fff; cursor:pointer; font-size:16px; width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; transition:0.2s; }
        .ctrl-btn:hover { background:#38bdf8; color:#000; }
        #save-tree-settings-btn:hover { background: rgba(56, 189, 248, 0.1) !important; border-radius: 4px; }
        
        .tree-node { padding: 8px 16px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); font-size: 15px; position: relative; cursor: pointer; transition: transform 0.2s, background 0.2s; z-index: 2; border: 2px solid transparent; display:flex; flex-direction:column; justify-content:center; }
        .tree-node:hover { transform: scale(1.1); z-index: 10; box-shadow: 0 6px 15px rgba(0,0,0,0.5); }
        .node-type-center { background: #2563eb; color: #fff; padding: 12px 24px; font-size: 22px; font-weight: bold; border-color: #3b82f6; }
        .node-type-word { background: #1e293b; color: #bae6fd; border-color: #38bdf8; }
        .node-type-root { background: #0c4a6e; color: #7dd3fc; border: 2px dashed #0284c7; }
        .tree-node.active-node { background: #f59e0b !important; color: #000 !important; border: 2px solid #fff !important; box-shadow: 0 0 20px rgba(245, 158, 11, 0.8) !important; transform: scale(1.15); z-index: 15; }
        
        /* 释义文字样式 (嵌入在词框底部) */
        .node-label-text { font-weight: inherit; text-align: center; white-space: nowrap; }
        .node-zh-meaning { font-size: 11.5px; color: #34d399; margin-top: 4px; padding-top: 4px; border-top: 1px dashed rgba(52,211,153,0.4); font-weight: normal; text-align: center; white-space: nowrap; line-height: 1.2; }
        .node-type-center .node-zh-meaning { color: #a7f3d0; border-top-color: rgba(167, 243, 208, 0.4); }
        .active-node .node-zh-meaning { color: #000; border-top-color: rgba(0,0,0,0.3); font-weight: bold; }

        .node-generating { background: #451a03 !important; color: #fcd34d !important; border-color: #f59e0b !important; animation: pulse 1.5s infinite; }
        .node-generating .node-zh-meaning { display: none; }
        @keyframes pulse { 0% { opacity:1; } 50% { opacity:0.6; } 100% { opacity:1; } }
        
        #mini-map-panel { position:absolute; bottom:20px; right:20px; z-index:100; display:flex; flex-direction:column; gap:8px; background:rgba(0,0,0,0.7); padding:10px; border-radius:12px; border:1px solid #333; backdrop-filter: blur(4px); }
        .mini-btn { background:#1e293b; border:1px solid #4b5563; color:#fff; font-size:18px; width:36px; height:36px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:0.2s;}
        .mini-btn:hover { background:#38bdf8; color:#000; }
    `;
    document.head.appendChild(style);

    const container = document.getElementById('word-tree-container');
    container.innerHTML = `
        <div id="tree-transform-wrapper" style="transform-origin: 0 0; position:absolute; top:0; left:0;">
            <svg id="tree-svg-lines" style="position: absolute; top:0; left:0; overflow: visible; z-index: 1; pointer-events: none;"></svg>
            <div id="tree-dom-content" style="position: relative; z-index: 2; width: max-content; height: max-content;"></div>
        </div>
        <div id="mini-map-panel">
            <button class="mini-btn" id="mini-zoom-in">+</button>
            <button class="mini-btn" id="mini-center">🎯</button>
            <button class="mini-btn" id="mini-zoom-out">-</button>
        </div>
    `;

    const transformEl = document.getElementById('tree-transform-wrapper');
    const svg = document.getElementById('tree-svg-lines');
    const domContent = document.getElementById('tree-dom-content');

    let scale = 1, tx = 0, ty = 0;
    let isDragging = false, startX, startY, startXScreen, startYScreen;
    let longPressTimer, lastMidClickTime = 0, currentActiveJumpData = null;

    function applyTransform() { transformEl.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`; }

    function centerOnNode(targetNode = null) {
        const node = targetNode || domContent.querySelector('.active-node') || domContent.querySelector('.node-type-center');
        if(!node || !container) return;
        const cRect = container.getBoundingClientRect();
        const nRect = node.getBoundingClientRect();
        if (cRect.width === 0) return;
        tx += (cRect.left + cRect.width/2) - (nRect.left + nRect.width/2);
        ty += (cRect.top + cRect.height/2) - (nRect.top + nRect.height/2);
        transformEl.style.transition = 'transform 0.4s cubic-bezier(0.2, 0, 0, 1)';
        applyTransform();
        setTimeout(() => { transformEl.style.transition = 'none'; }, 400);
    }

    container.addEventListener('mousedown', (e) => {
        if (e.button === 1) { 
            e.preventDefault(); 
            if (Date.now() - lastMidClickTime < 400) centerOnNode();
            lastMidClickTime = Date.now();
            return;
        }
        const node = e.target.closest('.tree-node');
        if (node && e.button === 0) {
            startXScreen = e.clientX; startYScreen = e.clientY;
            longPressTimer = setTimeout(() => {
                currentActiveJumpData = { label: node.getAttribute('data-label'), type: node.getAttribute('data-type') };
                contextMenu.style.left = `${e.clientX + 10}px`;
                contextMenu.style.top = `${e.clientY + 10}px`;
                contextMenu.style.display = 'block';
                longPressTimer = null; 
            }, 500);
        } else if (e.button === 0) {
            isDragging = true;
            startX = e.clientX - tx; startY = e.clientY - ty;
            contextMenu.style.display = 'none';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (isDragging) { tx = e.clientX - startX; ty = e.clientY - startY; applyTransform(); }
        if (longPressTimer && (Math.abs(e.clientX - startXScreen) > 5 || Math.abs(e.clientY - startYScreen) > 5)) {
            clearTimeout(longPressTimer); longPressTimer = null;
        }
    });

    window.addEventListener('mouseup', (e) => {
        isDragging = false;
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            const node = e.target.closest('.tree-node');
            if (node && Math.abs(e.clientX - startXScreen) < 5) handleNodeClick(node);
        }
    });

    function findRoot(segment) {
        if (!segment) return null;
        const clean = segment.toLowerCase().replace(/^-|-$/g, '').trim();
        return globalRoots.find(r => {
            const rSeg = (r.segment || '').toLowerCase();
            return rSeg === clean || rSeg.replace(/^-|-$/g, '').trim() === clean;
        });
    }

    document.getElementById('ctx-jump-btn').addEventListener('click', () => {
        if (!currentActiveJumpData) return;
        contextMenu.style.display = 'none';
        const label = currentActiveJumpData.label;
        if (currentActiveJumpData.type === 'root' || findRoot(label)) window.jumpToRoot(label);
        else window.jumpToWord(label);
    });

    function handleNodeClick(node) {
        document.querySelectorAll('.tree-node').forEach(n => n.classList.remove('active-node'));
        node.classList.add('active-node');
        const label = node.getAttribute('data-label');
        const type = node.getAttribute('data-type');
        const isRoot = type === 'root' || (type === 'center' && findRoot(label));
        const exists = isRoot 
            ? findRoot(label)
            : globalWords.find(w => (w.word||'').toLowerCase() === label.toLowerCase());

        const labelTextEl = node.querySelector('.node-label-text');
        const originalText = labelTextEl ? labelTextEl.innerText : node.innerText;

        if (!exists && !isRoot && (type === 'word' || type === 'center')) {
            if (labelTextEl) labelTextEl.innerText = `${originalText} (生成中...)`;
            else node.innerText = `${originalText} (生成中...)`;
            node.classList.add('node-generating');
            
            chrome.runtime.sendMessage({ action: "fetchLLM", word: label, forceRefresh: true }, (res) => {
                node.classList.remove('node-generating');
                if (res && res.success) {
                    if (labelTextEl) labelTextEl.innerText = originalText; else node.innerText = originalText;
                    triggerRender(searchInput.value || label);
                } else { 
                    if (labelTextEl) labelTextEl.innerText = `${originalText} ❌`; else node.innerText = `${originalText} ❌`;
                }
            });
        }
        centerOnNode(node);
    }

    function getFirstMeaning(str) {
        if (!str) return "";
        const parts = str.split(/[;；,，\s\/]/);
        return parts[0].trim();
    }

    function triggerRender(wordStr) {
        if(!wordStr) return;
        const cleanWord = wordStr.toLowerCase().trim();
        chrome.storage.local.get(null, (items) => {
            globalWords = Object.keys(items).filter(k=>k.startsWith('W:')).map(k=>items[k]);
            globalRoots = Object.keys(items).filter(k=>k.startsWith('R:')).map(k=>items[k]);

            const wData = globalWords.find(w => (w.word||'').toLowerCase() === cleanWord);
            const rData = findRoot(cleanWord);

            if (!wData && !rData) {
                domContent.innerHTML = `<div style="padding:100px; color:#38bdf8; text-align:center;"><div style="font-size:40px; animation:spin 1s infinite linear;">🧠</div><div>正在为您现场生成图谱...</div></div>`;
                chrome.runtime.sendMessage({ action: "fetchLLM", word: cleanWord, forceRefresh: true }, (res) => {
                    if (res && res.success) triggerRender(cleanWord);
                });
                return;
            }

            saveToHistory(cleanWord);

            const visited = new Set();
            visited.add((rData ? 'R:' : 'W:') + cleanWord);

            domContent.innerHTML = `<div id="tree-layout-box" style="display:inline-flex; padding:250px; position:relative;">${buildNodeHtml(cleanWord, 'center', 'center', 1, currentMaxDepth, visited)}</div>`;
            tx = 0; ty = 0; scale = 1; applyTransform();
            setTimeout(() => { drawTreeConnections(); centerOnNode(); }, 100);
        });
    }

    function buildNodeHtml(label, type, dir, currentDepth, maxDepth, visitedSet) {
        const safeLabel = label.toLowerCase().trim();
        let leftItems = [], rightItems = [];
        let meaning = "";

        const wData = globalWords.find(w => (w.word||'').toLowerCase() === safeLabel);
        const rData = findRoot(safeLabel);

        if (wData) meaning = getFirstMeaning(wData.primary_meaning);
        else if (rData) meaning = getFirstMeaning(rData.meaning);

        if (currentDepth < maxDepth) {
            if (type === 'center') {
                if (wData) {
                    let roots = (wData.parts||[]).map(p => p.segment).filter(Boolean);
                    let derivs = [];
                    (wData.parts||[]).forEach(p => {
                        const rd = findRoot(p.segment);
                        if (rd && rd.derivatives) derivs.push(...rd.derivatives);
                    });
                    derivs = [...new Set(derivs)].filter(d => d.toLowerCase() !== safeLabel).slice(0, 15);
                    roots = roots.filter(r => !visitedSet.has('R:'+r.toLowerCase()));
                    derivs = derivs.filter(d => !visitedSet.has('W:'+d.toLowerCase()));
                    
                    if (showRoots) leftItems = roots.map(l => ({label:l, type:'root', dir:'left'})); 
                    if (showWords) rightItems = derivs.map(l => ({label:l, type:'word', dir:'right'})); 
                } else if (rData) {
                    let derivs = (rData.derivatives||[]).filter(d => d.toLowerCase() !== safeLabel).slice(0, 15);
                    derivs = derivs.filter(d => !visitedSet.has('W:'+d.toLowerCase()));
                    if (showWords) {
                        const mid = Math.ceil(derivs.length / 2);
                        const leftDerivs = derivs.slice(0, mid);
                        const rightDerivs = derivs.slice(mid);
                        leftItems = leftDerivs.map(l => ({label:l, type:'word', dir:'left'}));
                        rightItems = rightDerivs.map(l => ({label:l, type:'word', dir:'right'}));
                    }
                }
            } else if (type === 'word' && wData) {
                let roots = (wData.parts||[]).map(p => p.segment).filter(Boolean);
                let derivs = [];
                (wData.parts||[]).forEach(p => {
                    const rd = findRoot(p.segment);
                    if (rd && rd.derivatives) derivs.push(...rd.derivatives);
                });
                derivs = [...new Set(derivs)].filter(d => d.toLowerCase() !== safeLabel).slice(0, 15);
                roots = roots.filter(r => !visitedSet.has('R:'+r.toLowerCase()));
                derivs = derivs.filter(d => !visitedSet.has('W:'+d.toLowerCase()));
                
                if (dir === 'right') {
                    if (showRoots) rightItems.push(...roots.map(l=>({label:l, type:'root', dir:'right'})));
                    if (showWords) rightItems.push(...derivs.map(l=>({label:l, type:'word', dir:'right'})));
                } else {
                    if (showRoots) leftItems.push(...roots.map(l=>({label:l, type:'root', dir:'left'})));
                    if (showWords) leftItems.push(...derivs.map(l=>({label:l, type:'word', dir:'left'})));
                }
            } else if (type === 'root' && rData) {
                let derivs = (rData.derivatives||[]).filter(d => d.toLowerCase() !== safeLabel).slice(0, 15);
                derivs = derivs.filter(d => !visitedSet.has('W:'+d.toLowerCase()));
                if (showWords) { 
                    if (dir === 'left') leftItems = derivs.map(l => ({label:l, type:'word', dir:'left'}));
                    else rightItems = derivs.map(l => ({label:l, type:'word', dir:'right'}));
                }
            }
        }

        const nextVisLeft = new Set(visitedSet); leftItems.forEach(i => nextVisLeft.add((i.type==='root'?'R:':'W:') + i.label.toLowerCase()));
        const nextVisRight = new Set(visitedSet); rightItems.forEach(i => nextVisRight.add((i.type==='root'?'R:':'W:') + i.label.toLowerCase()));
        
        let html = `<div class="node-wrapper" style="display:flex; align-items:center; gap:60px; position:relative;">`;
        html += `<div class="left-children" style="display:${leftItems.length>0?'flex':'none'}; flex-direction:column; gap:15px; align-items:flex-end;">`;
        leftItems.forEach(item => html += buildNodeHtml(item.label, item.type, item.dir, currentDepth + 1, maxDepth, nextVisLeft));
        html += `</div>`;
        
        const cls = type === 'center' ? 'node-type-center active-node' : (type === 'word' ? 'node-type-word' : 'node-type-root');
        
        let nodeContent = `<div class="node-label-text">${window.escapeHtml(label)}</div>`;
        if (showChinese && meaning) {
            nodeContent += `<div class="node-zh-meaning">${window.escapeHtml(meaning)}</div>`;
        }
        
        html += `<div class="tree-node ${cls}" data-label="${window.escapeHtml(label)}" data-type="${type}" data-dir="${dir}">${nodeContent}</div>`;

        html += `<div class="right-children" style="display:${rightItems.length>0?'flex':'none'}; flex-direction:column; gap:15px; align-items:flex-start;">`;
        rightItems.forEach(item => html += buildNodeHtml(item.label, item.type, item.dir, currentDepth + 1, maxDepth, nextVisRight));
        html += `</div></div>`;
        return html;
    }

    // 完美复原连线逻辑：选择器恢复为直接寻找 .tree-node
    function drawTreeConnections() {
        if(!svg || !domContent) return;
        const oldScale = scale, oldTx = tx, oldTy = ty;
        transformEl.style.transform = `translate3d(0,0,0) scale(1)`;
        svg.innerHTML = '';
        const layoutBox = document.getElementById('tree-layout-box');
        if(!layoutBox) { applyTransform(); return; }
        
        svg.style.width = layoutBox.scrollWidth + 'px'; 
        svg.style.height = layoutBox.scrollHeight + 'px';
        const cRect = layoutBox.getBoundingClientRect();

        const getCoords = (rect, side) => ({ x: (side === 'left' ? rect.left : rect.right) - cRect.left, y: rect.top - cRect.top + rect.height / 2 });

        const drawCurve = (start, end) => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const cx = (start.x + end.x) / 2;
            path.setAttribute('d', `M ${start.x} ${start.y} C ${cx} ${start.y}, ${cx} ${end.y}, ${end.x} ${end.y}`);
            path.setAttribute('stroke', '#6b7280'); path.setAttribute('stroke-width', '2'); path.setAttribute('fill', 'none');
            svg.appendChild(path);
        };

        document.querySelectorAll('.node-wrapper').forEach(wrapper => {
            const parentNode = wrapper.querySelector(':scope > .tree-node');
            if(!parentNode) return;
            const pRect = parentNode.getBoundingClientRect();

            const leftC = wrapper.querySelector(':scope > .left-children');
            if (leftC && leftC.style.display !== 'none') {
                leftC.querySelectorAll(':scope > .node-wrapper > .tree-node').forEach(child => { 
                    drawCurve(getCoords(child.getBoundingClientRect(), 'right'), getCoords(pRect, 'left')); 
                });
            }
            const rightC = wrapper.querySelector(':scope > .right-children');
            if (rightC && rightC.style.display !== 'none') {
                rightC.querySelectorAll(':scope > .node-wrapper > .tree-node').forEach(child => { 
                    drawCurve(getCoords(pRect, 'right'), getCoords(child.getBoundingClientRect(), 'left')); 
                });
            }
        });
        
        scale = oldScale; tx = oldTx; ty = oldTy; 
        applyTransform();
    }

    document.getElementById('mini-zoom-in').addEventListener('click', () => { scale = Math.min(scale*1.2, 5); applyTransform(); });
    document.getElementById('mini-zoom-out').addEventListener('click', () => { scale = Math.max(scale/1.2, 0.1); applyTransform(); });
    document.getElementById('mini-center').addEventListener('click', () => centerOnNode());
    document.getElementById('tree-fullscreen-btn').addEventListener('click', () => { if (!document.fullscreenElement) container.requestFullscreen(); else document.exitFullscreen(); });
    searchBtn.addEventListener('click', () => { document.getElementById('tree-history-dropdown').style.display='none'; triggerRender(searchInput.value); });
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { document.getElementById('tree-history-dropdown').style.display='none'; triggerRender(searchInput.value); } });
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        let newScale = scale * Math.exp(-e.deltaY * 0.0015);
        newScale = Math.max(0.1, Math.min(newScale, 5));
        const rect = container.getBoundingClientRect();
        tx = (e.clientX - rect.left) - (e.clientX - rect.left - tx) * (newScale / scale);
        ty = (e.clientY - rect.top) - (e.clientY - rect.top - ty) * (newScale / scale);
        scale = newScale; applyTransform();
    }, {passive: false});

    chrome.storage.local.get(['pendingTreeWord'], (res) => { if (res.pendingTreeWord) executeJump(res.pendingTreeWord); });
    chrome.storage.onChanged.addListener((c, ns) => { if (ns === 'local' && c.pendingTreeWord && c.pendingTreeWord.newValue) executeJump(c.pendingTreeWord.newValue); });
    function executeJump(w) { setTimeout(() => { if (window.switchView) window.switchView('view-word-tree'); if (searchInput) searchInput.value = w; triggerRender(w); chrome.storage.local.remove('pendingTreeWord'); }, 150); }
});