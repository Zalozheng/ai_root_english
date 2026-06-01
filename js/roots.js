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

    window.triggerRootFilter = function(resetPage = true) {
        if (!window.globalRoots) return;
        const searchEl = document.getElementById('root-search');
        if(!searchEl) return;
        const q = searchEl.value.toLowerCase().trim();
        const sortType = document.getElementById('root-sort').value;
        const typeFilterEl = document.getElementById('root-type-filter');
        const targetType = typeFilterEl ? typeFilterEl.value : 'all';
        const contextFilter = document.getElementById('root-context-filter') ? document.getElementById('root-context-filter').value : 'all';
        const statusFilter = document.getElementById('root-status-filter') ? document.getElementById('root-status-filter').value : 'all';
        const learningFilterEl = document.getElementById('root-learning-filter');
        const learningFilter = learningFilterEl ? learningFilterEl.value : 'all';

        if (contextFilter !== 'all' && !window.contextRootMap) buildContextRootMap();

        let filtered = window.globalRoots.filter(d => {
            const matchSearch = window.getSegStr(d.segment).includes(q) || (d.meaning || '').includes(q);
            if (!matchSearch) return false;

            if (contextFilter !== 'all' && window.contextRootMap) {
                const rootSeg = window.getSegStr(d.segment);
                const rootsInCtx = window.contextRootMap[contextFilter];
                if (!rootsInCtx || !rootsInCtx.has(rootSeg)) return false;
            }

            // 收藏夹筛选逻辑
            if (statusFilter !== 'all') {
                let matches = false;
                if (d.favorite_folder_ids && d.favorite_folder_ids.includes(statusFilter)) matches = true;
                if (!matches && d.favorite_folder_id === statusFilter) matches = true;
                if (!matches && statusFilter === 'fav_default' && d.is_favorite) matches = true;
                
                if (!matches) return false;
            }

            // 标记状态筛选逻辑
            if (learningFilter !== 'all') {
                if (learningFilter === 'status_learned' && d.learning_status !== 'learned') return false;
                if (learningFilter === 'status_review' && d.learning_status !== 'review') return false;
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

        const countValueEl = document.querySelector('#root-count .count-value');
        if (countValueEl) countValueEl.textContent = filtered.length;

        window.currentFilteredRoots = window.sortData(filtered, sortType);
        
        // 修复跳页问题：只有明确要求（如点击搜索/分类）或搜索词不为空且之前没存过时才重置
        if (resetPage) {
            if (q.length > 0) {
                if (window.savedRootPageBeforeSearch === undefined) window.savedRootPageBeforeSearch = window.currentRootPage;
                window.currentRootPage = 1;
            } else {
                if (window.savedRootPageBeforeSearch !== undefined) {
                    window.currentRootPage = window.savedRootPageBeforeSearch;
                    window.savedRootPageBeforeSearch = undefined;
                } else {
                    window.currentRootPage = 1;
                }
            }
        }
        
        renderRootList();
    }

    if(document.getElementById('root-search')) {
        const rootSearchEl = document.getElementById('root-search');
        const parent = rootSearchEl.parentNode;
        
        // 包装搜索框并注入下拉菜单
        const wrapper = document.createElement('div');
        wrapper.style.cssText = "position: relative; width: 100%;";
        parent.insertBefore(wrapper, rootSearchEl);
        wrapper.appendChild(rootSearchEl);
        
        const dropdown = document.createElement('div');
        dropdown.id = 'root-search-dropdown';
        dropdown.style.cssText = "display: none; position: absolute; top: 100%; left: 0; width: 100%; background: #1e293b; border: 1px solid #38bdf8; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); z-index: 10001; max-height: 300px; overflow-y: auto; margin-top: 5px; flex-direction: column;";
        wrapper.appendChild(dropdown);

        let searchHistory = [];
        chrome.storage.local.get(['root_search_history'], (res) => { if (res.root_search_history) searchHistory = res.root_search_history; });

        const saveHistory = (term) => {
            if (!term) return;
            searchHistory = searchHistory.filter(h => h !== term);
            searchHistory.unshift(term);
            if (searchHistory.length > 20) searchHistory.pop();
            chrome.storage.local.set({ root_search_history: searchHistory });
        };

        let currentSelectedIndex = -1; // 记录键盘选中的项
        let currentDropdownItems = []; // 缓存当前下拉列表的数据

        const selectItem = (index) => {
            const children = dropdown.querySelectorAll('.dropdown-item');
            children.forEach((el, i) => {
                if (i === index) {
                    el.style.background = '#0f172a';
                    el.scrollIntoView({ block: 'nearest' });
                } else {
                    el.style.background = 'transparent';
                }
            });
        };

        const renderDropdown = (query = "") => {
            dropdown.innerHTML = "";
            currentSelectedIndex = -1;
            currentDropdownItems = [];
            const q = query.toLowerCase().trim();
            let items = [];

            if (q === "") {
                items = searchHistory.map(h => ({ type: 'history', text: h }));
            } else {
                const histMatches = searchHistory.filter(h => h.toLowerCase().includes(q)).map(h => ({ type: 'history', text: h }));
                const rootMatches = (window.globalRoots || [])
                    .filter(r => window.getSegStr(r.segment).includes(q) || (r.meaning||'').toLowerCase().includes(q))
                    .slice(0, 15)
                    .map(r => ({ type: 'root', text: r.segment, meaning: r.meaning, data: r })); // 缓存完整数据供渲染使用
                
                // 去重
                const seen = new Set(histMatches.map(h => h.text.toLowerCase()));
                const uniqueRootMatches = rootMatches.filter(r => {
                    const lowText = r.text.toLowerCase();
                    if (seen.has(lowText)) return false;
                    seen.add(lowText); return true;
                });
                items = [...histMatches, ...uniqueRootMatches];
            }

            if (items.length === 0) { dropdown.style.display = 'none'; return; }
            dropdown.style.display = 'flex';
            currentDropdownItems = items;

            items.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'dropdown-item';
                div.style.cssText = "padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; color: #bae6fd; font-size: 13px; border-bottom: 1px solid #333; transition: 0.2s;";
                
                let icon = item.type === 'history' ? '🕒' : '🌱';
                let mainText = `<span style="font-weight:bold;">${window.escapeHtml(item.text)}</span>`;
                let subText = item.meaning ? `<span style="color:#71717a; font-size:11px; margin-left:8px; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;">${window.escapeHtml(item.meaning)}</span>` : '';
                
                div.innerHTML = `<div style="display:flex; align-items:center; gap:8px; overflow:hidden; flex:1;"><span>${icon}</span><div style="display:flex; align-items:baseline; overflow:hidden;">${mainText}${subText}</div></div>`;
                
                if (item.type === 'history') {
                    const delBtn = document.createElement('span');
                    delBtn.style.cssText = "color: #ef4444; font-weight: bold; font-size: 16px; padding: 0 8px; flex-shrink: 0;";
                    delBtn.innerHTML = "×";
                    delBtn.title = "删除此历史";
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        searchHistory = searchHistory.filter(h => h !== item.text);
                        chrome.storage.local.set({ root_search_history: searchHistory });
                        renderDropdown(rootSearchEl.value);
                        rootSearchEl.focus(); // 保持焦点
                    });
                    div.appendChild(delBtn);
                }

                div.addEventListener('mouseenter', () => {
                    currentSelectedIndex = index;
                    selectItem(index);
                });
                
                const finalizeSelection = () => {
                    rootSearchEl.value = item.text;
                    dropdown.style.display = 'none';
                    saveHistory(item.text);
                    window.triggerRootFilter(true);
                    
                    if (item.type === 'root' && item.data) {
                        window.renderRootDetail(item.data);
                        setTimeout(() => {
                            const listItems = document.querySelectorAll('#root-list .data-item');
                            listItems.forEach(li => {
                                li.classList.remove('selected');
                                if (li.querySelector('.data-item-title span').innerText === item.text) {
                                    li.classList.add('selected');
                                }
                            });
                        }, 100);
                    }
                };

                div.addEventListener('click', (e) => {
                    e.stopPropagation();
                    finalizeSelection();
                });
                dropdown.appendChild(div);
            });

            if (q === "" && searchHistory.length > 0) {
                const clearBtn = document.createElement('div');
                clearBtn.style.cssText = "padding: 10px; text-align: center; color: #ef4444; font-size: 12px; cursor: pointer; font-weight: bold; background: #18181b; border-radius: 0 0 8px 8px; transition: 0.2s;";
                clearBtn.innerText = "🗑️ 清空所有历史";
                clearBtn.addEventListener('mouseenter', () => clearBtn.style.background = '#27272a');
                clearBtn.addEventListener('mouseleave', () => clearBtn.style.background = '#18181b');
                clearBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); searchHistory = []; chrome.storage.local.set({ root_search_history: [] }); dropdown.style.display = 'none';
                });
                dropdown.appendChild(clearBtn);
            }
        };

        rootSearchEl.addEventListener('input', () => {
            renderDropdown(rootSearchEl.value);
            if (rootSearchEl.value.trim() === '') {
                window.triggerRootFilter(true);
            }
        });
        
        rootSearchEl.addEventListener('focus', () => renderDropdown(rootSearchEl.value));
        
        rootSearchEl.addEventListener('keydown', (e) => {
            const itemCount = currentDropdownItems.length;
            
            if (dropdown.style.display === 'flex' && itemCount > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    currentSelectedIndex = (currentSelectedIndex + 1) % itemCount;
                    selectItem(currentSelectedIndex);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    currentSelectedIndex = (currentSelectedIndex - 1 + itemCount) % itemCount;
                    selectItem(currentSelectedIndex);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (currentSelectedIndex >= 0 && currentSelectedIndex < itemCount) {
                        const item = currentDropdownItems[currentSelectedIndex];
                        rootSearchEl.value = item.text;
                        dropdown.style.display = 'none';
                        saveHistory(item.text);
                        window.triggerRootFilter(true);
                        
                        if (item.type === 'root' && item.data) {
                            window.renderRootDetail(item.data);
                            setTimeout(() => {
                                const listItems = document.querySelectorAll('#root-list .data-item');
                                listItems.forEach(li => {
                                    li.classList.remove('selected');
                                    if (li.querySelector('.data-item-title span').innerText === item.text) {
                                        li.classList.add('selected');
                                    }
                                });
                            }, 100);
                        }
                    } else {
                        dropdown.style.display = 'none';
                        saveHistory(rootSearchEl.value);
                        window.triggerRootFilter(true);
                    }
                }
            } else if (e.key === 'Enter') {
                dropdown.style.display = 'none';
                saveHistory(rootSearchEl.value);
                window.triggerRootFilter(true);
            }
        });

        document.addEventListener('mousedown', (e) => { if (!wrapper.contains(e.target)) dropdown.style.display = 'none'; });

        document.getElementById('root-sort').addEventListener('change', () => window.triggerRootFilter(true));
        if(document.getElementById('root-type-filter')) {
            document.getElementById('root-type-filter').addEventListener('change', () => window.triggerRootFilter(true));
        }
        if(document.getElementById('root-context-filter')) {
            document.getElementById('root-context-filter').addEventListener('change', () => window.triggerRootFilter(true));
        }
        if(document.getElementById('root-status-filter')) {
            document.getElementById('root-status-filter').addEventListener('change', () => {
                window.renderFavFoldersUI(); // 更新按钮状态
                window.triggerRootFilter(true);
            });
        }
        if(document.getElementById('root-learning-filter')) {
            document.getElementById('root-learning-filter').addEventListener('change', () => {
                window.triggerRootFilter(true);
            });
        }
        
        // 绑定收藏夹管理按钮
        if(document.getElementById('add-fav-btn')) document.getElementById('add-fav-btn').addEventListener('click', () => window.manageFavFolders('add', 'root-status-filter'));
        if(document.getElementById('edit-fav-btn')) document.getElementById('edit-fav-btn').addEventListener('click', () => window.manageFavFolders('edit', 'root-status-filter'));
        if(document.getElementById('del-fav-btn')) document.getElementById('del-fav-btn').addEventListener('click', () => window.manageFavFolders('delete', 'root-status-filter'));
    }

    // 全局监听：为主列表添加键盘上下选择功能，并支持自动翻页
    document.addEventListener('keydown', (e) => {
        const viewRoots = document.getElementById('view-roots');
        const rootSearchEl = document.getElementById('root-search');
        
        if (viewRoots && viewRoots.classList.contains('active') && document.activeElement !== rootSearchEl) {
            const listItems = Array.from(document.querySelectorAll('#root-list .data-item'));
            if (listItems.length === 0) return;

            let currentIndex = listItems.findIndex(item => item.classList.contains('selected'));
            
            const roots = window.currentFilteredRoots || [];
            const ROOTS_PER_PAGE = 5;
            const totalPages = Math.max(1, Math.ceil(roots.length / ROOTS_PER_PAGE));

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (currentIndex < listItems.length - 1) {
                    // 当前页内向下移动
                    currentIndex++;
                } else {
                    // 已经到底部，尝试翻到下一页
                    if (window.currentRootPage < totalPages) {
                        window.currentRootPage++;
                        // 标记需要在渲染后选中第一个元素
                        window.pendingSelectIndex = 0; 
                        renderRootList();
                        return; // renderRootList 会处理后续选中逻辑
                    } else {
                        // 已经是最后一页的最后一个，循环回第一页
                        window.currentRootPage = 1;
                        window.pendingSelectIndex = 0;
                        renderRootList();
                        return;
                    }
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentIndex > 0) {
                    // 当前页内向上移动
                    currentIndex--;
                } else {
                    // 已经在顶部，尝试翻到上一页
                    if (window.currentRootPage > 1) {
                        window.currentRootPage--;
                        // 标记需要在渲染后选中最后一个元素
                        window.pendingSelectIndex = ROOTS_PER_PAGE - 1; 
                        renderRootList();
                        return;
                    } else {
                        // 已经是第一页的第一个，循环到最后一页
                        window.currentRootPage = totalPages;
                        // 计算最后一页有几个元素
                        const remainder = roots.length % ROOTS_PER_PAGE;
                        window.pendingSelectIndex = (remainder === 0 && roots.length > 0) ? ROOTS_PER_PAGE - 1 : remainder - 1;
                        renderRootList();
                        return;
                    }
                }
            } else {
                return; // 非上下键不处理
            }

            // 触发选中项的点击事件，实现高亮和详情渲染
            if (currentIndex >= 0 && currentIndex < listItems.length) {
                listItems[currentIndex].click();
                listItems[currentIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    });

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
            
        const rootKey = data.id || ("R:" + window.getSegStr(data.segment));
            const starIcon = data.is_favorite ? '⭐' : '☆';
            const starColor = data.is_favorite ? '#f59e0b' : '#6b7280';
            
            const actionsHtml = `
                <div style="display: flex; gap: 8px; font-size: 14px; align-items: center;">
                    <span class="root-star-btn" data-key="${rootKey}" style="color: ${starColor}; cursor: pointer;" title="收藏">${starIcon}</span>
                    <span class="root-del-btn" data-key="${rootKey}" style="color: #ef4444; cursor: pointer;" title="单独删除">🗑️</span>
                </div>
            `;
            
            li.innerHTML = `<div class="data-item-title"><span style="color:#38bdf8;">${window.escapeHtml(data.segment)}</span> ${actionsHtml}</div><div class="data-item-sub">${window.escapeHtml(data.meaning || '点击查看详情')}</div>`;
            li.addEventListener('click', (e) => {
                if (e.target.classList.contains('root-star-btn')) {
                    e.stopPropagation();
                    data.is_favorite = !data.is_favorite;
                    if (window.dbEngine) window.dbEngine.batchSave('roots', { [rootKey]: data });
                    chrome.storage.local.set({ [rootKey]: data }, () => {
                        window.triggerRootFilter(false);
                    });
                    return;
                }
                if (e.target.classList.contains('root-del-btn')) {
                    e.stopPropagation();
                    if (!confirm(`确定要删除词根 ${data.segment} 吗？`)) return;
                    if (window.dbEngine) window.dbEngine.delete('roots', rootKey);
                    chrome.storage.local.remove([rootKey], () => {
                        window.globalRoots = window.globalRoots.filter(r => (r.id || ('R:' + (r.segment||'').toLowerCase().replace(/^-|-$/g, '').trim())) !== rootKey);
                        window.triggerRootFilter(false);
                        window.clearRootDetail();
                    });
                    return;
                }

                document.querySelectorAll('#root-list .data-item').forEach(el => el.classList.remove('selected'));
                li.classList.add('selected'); 
                window.renderRootDetail(data);
            });
            listEl.appendChild(li);
        });

        // 处理翻页后的自动选中逻辑
        if (window.pendingSelectIndex !== undefined) {
            const items = document.querySelectorAll('#root-list .data-item');
            if (items.length > 0) {
                // 如果计算的 index 超出当前页实际元素数量（可能发生在最后一页），则选中最后一个
                const targetIndex = Math.min(window.pendingSelectIndex, items.length - 1);
                setTimeout(() => {
                    items[targetIndex].click();
                    items[targetIndex].scrollIntoView({ block: 'nearest' });
                }, 50);
            }
            window.pendingSelectIndex = undefined;
        }

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

        const rootId = data.id || ("R:" + window.getSegStr(data.segment));
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

        const favFolders = window.appConfig?.favFolders || [{id: 'fav_default', name: '⭐ 默认收藏夹'}];
        
        const isLearned = fullData.learning_status === 'learned';
        const isReview = fullData.learning_status === 'review';
        
        let statusOptions = "";
        statusOptions += `<option value="" style="background:#1e1e1e; color:#fff;" ${!isLearned && !isReview ? 'selected' : ''}>📁 无标记</option>`;
        statusOptions += `<option value="status_learned" style="background:#1e1e1e; color:#fff;" ${isLearned ? 'selected' : ''}>✅ 已学完</option>`;
        statusOptions += `<option value="status_review" style="background:#1e1e1e; color:#fff;" ${isReview ? 'selected' : ''}>🔄 待复习</option>`;
        
        let statusColor = '#9ca3af';
        if (isLearned || isReview) {
            statusColor = '#10b981';
        }

        const folderIds = fullData.favorite_folder_ids || 
                          (fullData.favorite_folder_id ? [fullData.favorite_folder_id] : []) ||
                          (fullData.is_favorite ? ['fav_default'] : []);
                          
        let folderPlaceholderText = "未收藏";
        let folderColor = '#9ca3af';
        const activeFolders = [];
        folderIds.forEach(fid => {
            const folder = favFolders.find(f => f.id === fid);
            if (folder) {
                activeFolders.push(folder.name.replace(/^[📁⭐✅🔄]\s*/, ''));
                folderColor = '#f59e0b';
            }
        });
        if (activeFolders.length > 0) {
            folderPlaceholderText = activeFolders.join(' | ');
        }
        
        let folderOptions = `<option value="" disabled selected hidden>⭐ ${window.escapeHtml(folderPlaceholderText)}</option>`;
        folderOptions += `<option value="action_clear_folders" style="background:#1e1e1e; color:#ef4444;">❌ 移出所有收藏</option>`;
        favFolders.forEach(f => {
            const isSelected = folderIds.includes(f.id);
            const prefix = isSelected ? '✓ ' : '';
            folderOptions += `<option value="${f.id}" style="background:#1e1e1e; color:#fff;">${prefix}${window.escapeHtml(f.name)}</option>`;
        });

        pane.innerHTML = `
          <div style="margin-bottom: 20px;">
             <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                 <span style="font-size: 14px; color: #a1a1aa; text-transform: uppercase;">[ 原生记录: ${window.escapeHtml(data.type)} ]</span>
                 
                 <div style="display: flex; align-items: center; gap: 10px;">
                     <button class="jump-to-pyramid-btn-lib" data-segment="${window.escapeHtml(data.segment)}" style="background:rgba(245,158,11,0.1); color:#facc15; border:1px solid rgba(245,158,11,0.3); border-radius:6px; font-size:12px; padding:4px 8px; cursor:pointer; display:flex; align-items:center; gap:4px; font-weight:bold;" title="生成专属词根金字塔">🔺 金字塔</button>
                     <!-- 标记状态 -->
                     <select class="unified-status-selector" data-key="${rootId}" style="background:transparent; color:${statusColor}; border:1px solid #3f3f46; border-radius:6px; font-size:12px; padding:4px 8px; outline:none; cursor:pointer;" title="标记学习状态">
                        ${statusOptions}
                     </select>

                     <!-- 收藏夹 -->
                     <select class="unified-folder-selector" data-key="${rootId}" style="background:transparent; color:${folderColor}; border:1px solid #3f3f46; border-radius:6px; font-size:12px; padding:4px 8px; outline:none; cursor:pointer;" title="加入收藏夹">
                        ${folderOptions}
                     </select>

                     <button class="detail-action-btn" data-action="delete" data-key="${rootId}" style="background:transparent; border:none; cursor:pointer; font-size:16px; padding:4px; color:#ef4444;" title="彻底删除">🗑️</button>
                     
                     <select class="manual-category-select" data-key="${rootId}" style="background:#27272a; color:#fff; border:1px solid #3f3f46; border-radius:6px; font-size:12px; padding:4px 8px; outline:none; cursor:pointer; width:max-content !important; margin-left: 8px;" title="手动覆盖分类">
                         <option value="" style="background:#1e1e1e; color:#fff;">⚙️ 自动分配</option>
                         <option value="前缀" style="background:#1e1e1e; color:#fff;" ${data.manual_category === '前缀' ? 'selected' : ''}>📌 强制归为: 前缀</option>
                         <option value="词根" style="background:#1e1e1e; color:#fff;" ${data.manual_category === '词根' ? 'selected' : ''}>🌱 强制归为: 词根</option>
                         <option value="后缀" style="background:#1e1e1e; color:#fff;" ${data.manual_category === '后缀' ? 'selected' : ''}>🪝 强制归为: 后缀</option>
                         <option value="组合" style="background:#1e1e1e; color:#fff;" ${data.manual_category === '组合' ? 'selected' : ''}>🧩 强制归为: 组合</option>
                         <option value="其他" style="background:#1e1e1e; color:#fff;" ${data.manual_category === '其他' ? 'selected' : ''}>📦 强制归为: 其他</option>
                     </select>
                 </div>
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
        
        const pyBtn = pane.querySelector('.jump-to-pyramid-btn-lib');
        if (pyBtn) {
            pyBtn.addEventListener('click', (e) => {
                const targetRoot = e.currentTarget.getAttribute('data-segment');
                chrome.storage.local.set({ pendingPyramidWord: targetRoot }, () => {
                    // Activate the pyramid tab since we are already on options page
                    const pyNav = document.getElementById('nav-pyramid');
                    if (pyNav) pyNav.click();
                });
            });
        }
        
        pane.querySelectorAll('.detail-action-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const action = e.currentTarget.getAttribute('data-action');
                const key = e.currentTarget.getAttribute('data-key');
                
                if (action === 'delete') {
                    if (!confirm(`确定要在详情页彻底删除词根 ${fullData.segment} 吗？`)) return;
                    if (window.dbEngine) await window.dbEngine.delete('roots', key);
                    chrome.storage.local.remove([key], () => {
                        window.globalRoots = window.globalRoots.filter(r => (r.id || ('R:' + (r.segment||'').toLowerCase().replace(/^-|-$/g, '').trim())) !== key);
                        window.triggerRootFilter(false);
                        window.clearRootDetail();
                    });
                    return;
                }
                
                if (action === 'favorite') fullData.is_favorite = !fullData.is_favorite;
                if (action === 'learned') fullData.learning_status = fullData.learning_status === 'learned' ? null : 'learned';
                if (action === 'review') fullData.learning_status = fullData.learning_status === 'review' ? null : 'review';
                
                if (window.dbEngine) await window.dbEngine.batchSave('roots', { [key]: fullData });
                chrome.storage.local.set({ [key]: fullData }, () => {
                    window.renderRootDetail(fullData);
                    window.triggerRootFilter(false);
                });
            });
        });

        // 标记状态 select 改变事件
        pane.querySelectorAll('.unified-status-selector').forEach(el => {
            el.addEventListener('change', async (e) => {
                const val = e.target.value;
                const key = e.target.getAttribute('data-key');
                
                if (val === 'status_learned') {
                    fullData.learning_status = 'learned';
                } else if (val === 'status_review') {
                    fullData.learning_status = 'review';
                } else {
                    fullData.learning_status = null;
                }
                
                if (window.globalRoots) {
                    const idx = window.globalRoots.findIndex(r => {
                        const rId = r.id || ('R:' + (r.segment||'').toLowerCase().replace(/^-|-$/g, '').trim());
                        return rId === key;
                    });
                    if (idx !== -1) {
                        window.globalRoots[idx] = fullData;
                    }
                }
                
                if (window.dbEngine) await window.dbEngine.batchSave('roots', { [key]: fullData });
                chrome.storage.local.set({ [key]: fullData }, () => {
                    window.renderRootDetail(fullData);
                    window.triggerRootFilter(false);
                });
            });
        });

        // 收藏夹 select 改变事件
        pane.querySelectorAll('.unified-folder-selector').forEach(el => {
            el.addEventListener('change', async (e) => {
                const val = e.target.value;
                const key = e.target.getAttribute('data-key');
                
                if (!fullData.favorite_folder_ids || !Array.isArray(fullData.favorite_folder_ids)) {
                    fullData.favorite_folder_ids = [];
                    if (fullData.favorite_folder_id) {
                        fullData.favorite_folder_ids.push(fullData.favorite_folder_id);
                    } else if (fullData.is_favorite) {
                        fullData.favorite_folder_ids.push('fav_default');
                    }
                }
                
                if (val === 'action_clear_folders') {
                    fullData.favorite_folder_ids = [];
                    fullData.favorite_folder_id = null;
                    fullData.is_favorite = false;
                } else if (val.startsWith('fav_')) {
                    if (fullData.favorite_folder_ids.includes(val)) {
                        fullData.favorite_folder_ids = fullData.favorite_folder_ids.filter(id => id !== val);
                    } else {
                        fullData.favorite_folder_ids.push(val);
                    }
                    fullData.favorite_folder_id = fullData.favorite_folder_ids[0] || null;
                    fullData.is_favorite = fullData.favorite_folder_ids.includes('fav_default');
                }
                
                if (window.globalRoots) {
                    const idx = window.globalRoots.findIndex(r => {
                        const rId = r.id || ('R:' + (r.segment||'').toLowerCase().replace(/^-|-$/g, '').trim());
                        return rId === key;
                    });
                    if (idx !== -1) {
                        window.globalRoots[idx] = fullData;
                    }
                }
                
                if (window.dbEngine) await window.dbEngine.batchSave('roots', { [key]: fullData });
                chrome.storage.local.set({ [key]: fullData }, () => {
                    window.renderRootDetail(fullData);
                    window.triggerRootFilter(false);
                });
            });
        });
        
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
                    const targetVal = segment.trim();
                    const centerNode = document.querySelector('#tree-layout-box .node-type-center');
                    const renderedVal = centerNode ? centerNode.getAttribute('data-label') : '';
                    
                    if (renderedVal.toLowerCase().trim() === targetVal.toLowerCase().trim()) {
                        // 只需要重新居中即可
                        const miniCenter = document.getElementById('mini-center');
                        if (miniCenter) {
                            setTimeout(() => { miniCenter.click(); }, 100);
                        }
                    } else {
                        treeSearchInput.value = targetVal;
                        // 稍微延迟 100 毫秒点击生成，确保 DOM 已经完全切过去可见
                        setTimeout(() => {
                            treeGenBtn.click();
                        }, 100);
                    }
                }
            });
        }
    };
});