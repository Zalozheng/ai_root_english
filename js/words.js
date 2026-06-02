document.addEventListener('DOMContentLoaded', () => {
    // 缓存当前的筛选结果，避免重复计算
    window.allWordsCache = []; 

    window.loadWordsLibrary = function(callback) {
        return new Promise(async (resolve) => {
            try {
                const db = await window.dbEngine.init();
                const transaction = db.transaction(['words'], 'readonly');
                const store = transaction.objectStore('words');
                const request = store.getAll();
                
                request.onsuccess = () => {
                    window.globalWords = request.result;
                    window._wordsDbLoaded = true;
                    window.triggerWordFilter();
                    if (callback) callback();
                    resolve();
                };
                request.onerror = () => {
                    console.error('DB加载失败');
                    resolve();
                };
            } catch (err) {
                chrome.storage.local.get(null, (items) => {
                    window.globalWords = Object.keys(items).filter(k => k.startsWith('W:')).map(k => items[k]);
                    window._wordsDbLoaded = true;
                    window.triggerWordFilter();
                    if (callback) callback();
                    resolve();
                });
            }
        });
    };

    window.clearWordDetail = function() {
        const pane = document.getElementById('word-detail');
        if(pane) {
            pane.innerHTML = `
                <div class="empty-state">
                    <div style="background: rgba(56, 189, 248, 0.05); width: 120px; height: 120px; border-radius: 60px; display: flex; align-items: center; justify-content: center; margin-bottom: 25px; border: 1px solid rgba(56, 189, 248, 0.1);">
                        <span style="font-size: 60px;">📖</span>
                    </div>
                    <div style="font-size: 20px; font-weight: bold; color: #fff; margin-bottom: 10px;">单词特训库</div>
                    <div style="color: #71717a; line-height: 1.6;">请从左侧列表选择一个单词<br>开始您的深度溯源之旅</div>
                </div>
            `;
        }
    };

    window.triggerWordFilter = function(resetPage = true) {
        if (!window.globalWords) return;
        const searchEl = document.getElementById('word-search');
        if(!searchEl) return;
        const q = searchEl.value.toLowerCase().trim();
        const sortType = document.getElementById('word-sort').value;
        const contextFilter = document.getElementById('word-context-filter') ? document.getElementById('word-context-filter').value : 'all';
        const statusFilter = document.getElementById('word-status-filter') ? document.getElementById('word-status-filter').value : 'all';
        const learningFilter = document.getElementById('word-learning-filter') ? document.getElementById('word-learning-filter').value : 'all';

        let filtered = window.globalWords.filter(d => {
            const matchSearch = (d.word || '').toLowerCase().includes(q) || (d.primary_meaning || '').includes(q);
            if (!matchSearch) return false;
            
            if (contextFilter !== 'all') {
                const map = d.memory_lines_map || {};
                const matchCtx = Object.keys(map).some(k => k.endsWith(`_${contextFilter}`));
                if (!matchCtx) return false;
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

            return true;
        });

        // 更新数量显示
        const countValueEl = document.querySelector('#word-count .count-value');
        if (countValueEl) countValueEl.textContent = filtered.length;

        window.currentFilteredWords = window.sortData(filtered, sortType);
        
        if (resetPage) {
            if (q.length > 0) {
                if (window.savedWordPageBeforeSearch === undefined) window.savedWordPageBeforeSearch = window.currentWordPage;
                window.currentWordPage = 1;
            } else {
                if (window.savedWordPageBeforeSearch !== undefined) {
                    window.currentWordPage = window.savedWordPageBeforeSearch;
                    window.savedWordPageBeforeSearch = undefined;
                } else {
                    window.currentWordPage = 1;
                }
            }
        }
        
        renderWordList();
    }

    if(document.getElementById('word-search')) {
        const wordSearchEl = document.getElementById('word-search');
        const parent = wordSearchEl.parentNode;

        // 包装搜索框并注入下拉菜单
        const wrapper = document.createElement('div');
        wrapper.style.cssText = "position: relative; width: 100%;";
        parent.insertBefore(wrapper, wordSearchEl);
        wrapper.appendChild(wordSearchEl);

        const dropdown = document.createElement('div');
        dropdown.id = 'word-search-dropdown';
        dropdown.style.cssText = "display: none; position: absolute; top: 100%; left: 0; width: 100%; background: #1e293b; border: 1px solid #38bdf8; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); z-index: 10001; max-height: 300px; overflow-y: auto; margin-top: 5px; flex-direction: column;";
        wrapper.appendChild(dropdown);

        let searchHistory = [];
        chrome.storage.local.get(['word_search_history'], (res) => { if (res.word_search_history) searchHistory = res.word_search_history; });

        const saveHistory = (term) => {
            if (!term) return;
            searchHistory = searchHistory.filter(h => h !== term);
            searchHistory.unshift(term);
            if (searchHistory.length > 20) searchHistory.pop();
            chrome.storage.local.set({ word_search_history: searchHistory });
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
                const wordMatches = (window.globalWords || [])
                    .filter(w => (w.word||'').toLowerCase().includes(q) || (w.primary_meaning||'').toLowerCase().includes(q))
                    .slice(0, 15)
                    .map(w => ({ type: 'word', text: w.word, meaning: w.primary_meaning, data: w })); // 缓存完整数据供渲染使用

                // 去重
                const seen = new Set(histMatches.map(h => h.text.toLowerCase()));
                const uniqueWordMatches = wordMatches.filter(w => {
                    const lowText = w.text.toLowerCase();
                    if (seen.has(lowText)) return false;
                    seen.add(lowText); return true;
                });
                items = [...histMatches, ...uniqueWordMatches];
            }

            if (items.length === 0) { dropdown.style.display = 'none'; return; }
            dropdown.style.display = 'flex';
            currentDropdownItems = items;

            items.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'dropdown-item';
                div.style.cssText = "padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; color: #bae6fd; font-size: 13px; border-bottom: 1px solid #333; transition: 0.2s;";

                let icon = item.type === 'history' ? '🕒' : '📖';
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
                        chrome.storage.local.set({ word_search_history: searchHistory });
                        renderDropdown(wordSearchEl.value);
                        wordSearchEl.focus(); // 保持焦点
                    });
                    div.appendChild(delBtn);
                }

                div.addEventListener('mouseenter', () => {
                    currentSelectedIndex = index;
                    selectItem(index);
                });

                const finalizeSelection = () => {
                    wordSearchEl.value = item.text;
                    dropdown.style.display = 'none';
                    saveHistory(item.text);
                    window.triggerWordFilter(true);

                    if (item.type === 'word' && item.data) {
                        window.renderWordDetail(item.data);
                        setTimeout(() => {
                            const listItems = document.querySelectorAll('#word-list .data-item');
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
                    e.stopPropagation(); searchHistory = []; chrome.storage.local.set({ word_search_history: [] }); dropdown.style.display = 'none';
                });
                dropdown.appendChild(clearBtn);
            }
        };

        wordSearchEl.addEventListener('input', () => {
            renderDropdown(wordSearchEl.value);
            window.triggerWordFilter(true);
        });

        wordSearchEl.addEventListener('focus', () => renderDropdown(wordSearchEl.value));

        wordSearchEl.addEventListener('keydown', (e) => {
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
                        wordSearchEl.value = item.text;
                        dropdown.style.display = 'none';
                        saveHistory(item.text);
                        window.triggerWordFilter(true);

                        if (item.type === 'word' && item.data) {
                            window.renderWordDetail(item.data);
                            setTimeout(() => {
                                const listItems = document.querySelectorAll('#word-list .data-item');
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
                        saveHistory(wordSearchEl.value);
                        window.triggerWordFilter(true);
                    }
                }
            } else if (e.key === 'Enter') {
                dropdown.style.display = 'none';
                saveHistory(wordSearchEl.value);
                window.triggerWordFilter(true);
            }
        });

        document.addEventListener('mousedown', (e) => { if (!wrapper.contains(e.target)) dropdown.style.display = 'none'; });

        document.getElementById('word-sort').addEventListener('change', () => window.triggerWordFilter(true));
        if(document.getElementById('word-context-filter')) {
            document.getElementById('word-context-filter').addEventListener('change', () => window.triggerWordFilter(true));
        }
        if(document.getElementById('word-status-filter')) {
            document.getElementById('word-status-filter').addEventListener('change', () => {
                window.renderFavFoldersUI();
                window.triggerWordFilter(true);
            });
        }
        if(document.getElementById('word-learning-filter')) {
            document.getElementById('word-learning-filter').addEventListener('change', () => window.triggerWordFilter(true));
        }

        // 绑定单词收藏夹管理按钮
        if(document.getElementById('word-add-fav-btn')) {
            document.getElementById('word-add-fav-btn').addEventListener('click', () => window.manageFavFolders('add', 'word-status-filter'));
        }
        if(document.getElementById('word-edit-fav-btn')) {
            document.getElementById('word-edit-fav-btn').addEventListener('click', () => window.manageFavFolders('edit', 'word-status-filter'));
        }
        if(document.getElementById('word-del-fav-btn')) {
            document.getElementById('word-del-fav-btn').addEventListener('click', () => window.manageFavFolders('delete', 'word-status-filter'));
        }
    }

    // 全局监听：为单词主列表添加键盘上下选择功能，并支持自动翻页
    document.addEventListener('keydown', (e) => {
        const viewWords = document.getElementById('view-words');
        const wordSearchEl = document.getElementById('word-search');
        
        if (viewWords && viewWords.classList.contains('active') && document.activeElement !== wordSearchEl) {
            const listItems = Array.from(document.querySelectorAll('#word-list .data-item'));
            if (listItems.length === 0) return;

            let currentIndex = listItems.findIndex(item => item.classList.contains('selected'));
            
            const words = window.currentFilteredWords || [];
            const WORDS_PER_PAGE = 5;
            const totalPages = Math.max(1, Math.ceil(words.length / WORDS_PER_PAGE));

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (currentIndex < listItems.length - 1) {
                    currentIndex++;
                } else {
                    if (window.currentWordPage < totalPages) {
                        window.currentWordPage++;
                        window.pendingWordSelectIndex = 0; 
                        renderWordList();
                        return;
                    } else {
                        window.currentWordPage = 1;
                        window.pendingWordSelectIndex = 0;
                        renderWordList();
                        return;
                    }
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentIndex > 0) {
                    currentIndex--;
                } else {
                    if (window.currentWordPage > 1) {
                        window.currentWordPage--;
                        window.pendingWordSelectIndex = WORDS_PER_PAGE - 1; 
                        renderWordList();
                        return;
                    } else {
                        window.currentWordPage = totalPages;
                        const remainder = words.length % WORDS_PER_PAGE;
                        window.pendingWordSelectIndex = (remainder === 0 && words.length > 0) ? WORDS_PER_PAGE - 1 : remainder - 1;
                        renderWordList();
                        return;
                    }
                }
            } else {
                return;
            }

            if (currentIndex >= 0 && currentIndex < listItems.length) {
                listItems[currentIndex].click();
                listItems[currentIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    });

    function renderWordList() {
        const listEl = document.getElementById('word-list');
        if(!listEl) return;
        
        const words = window.currentFilteredWords || [];
        const WORDS_PER_PAGE = 5;
        const totalItems = words.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / WORDS_PER_PAGE));
        
        if (!window.currentWordPage || window.currentWordPage < 1) window.currentWordPage = 1;
        if (window.currentWordPage > totalPages) window.currentWordPage = totalPages;

        const startIndex = (window.currentWordPage - 1) * WORDS_PER_PAGE;
        const displayWords = words.slice(startIndex, startIndex + WORDS_PER_PAGE);

        listEl.innerHTML = displayWords.length === 0 ? '<div style="color:#888; text-align:center; padding: 20px;">词库空空如也</div>' : '';
        
        displayWords.forEach(data => {
            const actualWord = data.word || (data.id ? data.id.replace('W:', '') : 'Unknown');
            const wordId = data.id || ('W:' + actualWord.toLowerCase().trim());
            const actionsHtml = `
                <div style="display: flex; gap: 8px; font-size: 14px; align-items: center;">
                    <span class="word-del-btn" data-key="${wordId}" style="color: #ef4444; cursor: pointer;" title="删除">🗑️</span>
                </div>
            `;
            
            const li = document.createElement('li'); 
            li.className = 'data-item';
            li.setAttribute('data-key', wordId);
            li.innerHTML = `<div class="data-item-title"><span style="color:#38bdf8;">${window.escapeHtml(actualWord)}</span> ${actionsHtml}</div><div class="data-item-sub">${window.escapeHtml(data.primary_meaning || '点击查看详情')}</div>`;
            li.addEventListener('click', (e) => {
                if (e.target.classList.contains('word-del-btn')) {
                    e.stopPropagation();
                    if (!confirm(`确定要删除单词 ${actualWord} 吗？`)) return;
                    if (window.dbEngine) window.dbEngine.delete('words', wordId);
                    chrome.storage.local.remove([wordId], () => {
                        window.globalWords = window.globalWords.filter(w => (w.id || ('W:' + (w.word||'').toLowerCase().trim())) !== wordId);
                        window.triggerWordFilter(false);
                        window.clearWordDetail();
                    });
                    return;
                }

                document.querySelectorAll('#word-list .data-item').forEach(el => el.classList.remove('selected'));
                li.classList.add('selected'); 
                window.renderWordDetail(data);
            });
            listEl.appendChild(li);
        });

        if (window.pendingWordSelectIndex !== undefined) {
            const items = document.querySelectorAll('#word-list .data-item');
            if (items.length > 0) {
                const targetIndex = Math.min(window.pendingWordSelectIndex, items.length - 1);
                setTimeout(() => {
                    items[targetIndex].click();
                    items[targetIndex].scrollIntoView({ block: 'nearest' });
                }, 50);
            }
            window.pendingWordSelectIndex = undefined;
        }

        let paginationEl = document.getElementById('word-pagination');
        if (!paginationEl) {
            paginationEl = document.createElement('div');
            paginationEl.id = 'word-pagination';
            paginationEl.style.cssText = 'padding: 8px 10px; border-top: 1px solid #333; display: flex; justify-content: space-between; align-items: center; background: #1a1a1a; flex-shrink: 0;';
            listEl.parentNode.appendChild(paginationEl);
        }

        if (totalItems > 0) {
            paginationEl.innerHTML = `
                <button id="word-prev-btn" style="background:#27272a; border:1px solid #3f3f46; color:#fff; border-radius:4px; padding:4px 10px; cursor:${window.currentWordPage > 1 ? 'pointer' : 'not-allowed'}; opacity:${window.currentWordPage > 1 ? 1 : 0.5}; font-size:12px;">◀</button>
                <div style="display:flex; align-items:center; gap:4px; color:#a1a1aa; font-size:12px;">
                    <input type="number" id="word-page-input" value="${window.currentWordPage}" min="1" max="${totalPages}" style="width:36px; padding:2px; background:#0f0f11; border:1px solid #3f3f46; color:#fff; text-align:center; border-radius:4px; outline:none; -moz-appearance:textfield;">
                    <span>/ ${totalPages}</span>
                </div>
                <button id="word-next-btn" style="background:#27272a; border:1px solid #3f3f46; color:#fff; border-radius:4px; padding:4px 10px; cursor:${window.currentWordPage < totalPages ? 'pointer' : 'not-allowed'}; opacity:${window.currentWordPage < totalPages ? 1 : 0.5}; font-size:12px;">▶</button>
            `;

            document.getElementById('word-prev-btn').addEventListener('click', () => {
                if (window.currentWordPage > 1) { window.currentWordPage--; renderWordList(); }
            });
            document.getElementById('word-next-btn').addEventListener('click', () => {
                if (window.currentWordPage < totalPages) { window.currentWordPage++; renderWordList(); }
            });
            document.getElementById('word-page-input').addEventListener('change', (e) => {
                let val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 1 && val <= totalPages) {
                    window.currentWordPage = val;
                    renderWordList();
                } else {
                    e.target.value = window.currentWordPage;
                }
            });
        } else {
            paginationEl.innerHTML = '';
        }
    }

    window.renderWordDetail = async function(data) {
        const pane = document.getElementById('word-detail');
        if(!pane) return;
        
        // 关键点：点击时才去查最新的完整数据
        const wordId = data.id || ("W:" + (data.word || '').toLowerCase().trim());
        let fullData = data;
        try {
            const dbData = await window.dbEngine.get('words', wordId);
            if (dbData) {
                fullData = dbData;
                // 更新查阅次数
                fullData.lookup_count = (fullData.lookup_count || 0) + 1;
                fullData.updated_at = Date.now();
                window.dbEngine.batchSave('words', { [wordId]: fullData });
                // 同步回 storage 以保持兼容
                chrome.storage.local.set({ [wordId]: fullData });
            }
        } catch(e) { console.error('获取详情失败', e); }

        const contextKey = document.getElementById('prompt-context') ? document.getElementById('prompt-context').value : 'general';

        // 读取所有可能的 key（custom/remote/ollama），优先用有内容的
        const map = fullData.memory_lines_map || {};
        const customLines = map[`custom_${contextKey}`] || null;
        const apiLines    = map[`remote_${contextKey}`]  || null;
        const ollamaLines = map[`ollama_${contextKey}`]  || null;

        let mLines = fullData.memory_lines || []; let activeSource = "默认";
        if      (customLines && customLines.length > 0) { mLines = customLines; activeSource = "custom"; }
        else if (apiLines    && apiLines.length    > 0) { mLines = apiLines;    activeSource = "remote"; }
        else if (ollamaLines && ollamaLines.length > 0) { mLines = ollamaLines; activeSource = "ollama"; }

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
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:15px; margin-bottom: 20px;">
             <div style="display:flex; align-items:center; gap:15px; flex-wrap:wrap; min-width:0; word-break:break-word;">
                <div class="word-breakdown" style="word-break:break-all; overflow-wrap:anywhere; margin-bottom:0;">${window.escapeHtml(data.display_breakdown || data.word)}</div>
                <div class="speaker-icon play-sound-btn" data-word="${window.escapeHtml(data.word)}" title="点击朗读" style="cursor:pointer; font-size:18px; padding:4px 8px; border-radius:6px; background:rgba(14,165,233,0.1); transition:0.2s;">🔊</div>
                <div class="phonetic" style="word-break:break-all; overflow-wrap:anywhere;">/${window.escapeHtml(data.phonetic_us || '-')}/</div>
                <div class="primary-meaning" style="word-break:break-word; overflow-wrap:anywhere;">${window.escapeHtml(data.primary_meaning || '')}</div>
             </div>
             
             <div style="display: flex; align-items: center; gap: 10px;">
                 <!-- 标记状态 -->
                 <select class="unified-status-selector" data-key="${wordId}" style="background:transparent; color:${statusColor}; border:1px solid #3f3f46; border-radius:6px; font-size:12px; padding:4px 8px; outline:none; cursor:pointer;" title="标记学习状态">
                    ${statusOptions}
                 </select>

                  <!-- 收藏夹 -->
                  <select class="unified-folder-selector" data-key="${wordId}" style="background:transparent; color:${folderColor}; border:1px solid #3f3f46; border-radius:6px; font-size:12px; padding:4px 8px; outline:none; cursor:pointer;" title="加入收藏夹">
                     ${folderOptions}
                  </select>

                  <button class="detail-action-btn" data-action="delete" data-key="${wordId}" style="background:transparent; border:none; cursor:pointer; font-size:16px; padding:4px; color:#ef4444;" title="彻底删除">🗑️</button>
              </div>
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

        // ===== 绑定删除单词按钮 =====
        pane.querySelectorAll('.detail-action-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const action = e.currentTarget.getAttribute('data-action');
                const key = e.currentTarget.getAttribute('data-key');

                if (action === 'delete') {
                    if (!confirm(`确定要在详情页彻底删除单词 ${fullData.word} 吗？`)) return;
                    if (window.dbEngine) await window.dbEngine.delete('words', key);
                    chrome.storage.local.remove([key], () => {
                        window.globalWords = window.globalWords.filter(w => (w.id || ('W:' + (w.word||'').toLowerCase().trim())) !== key);
                        window.triggerWordFilter(false);
                        window.clearWordDetail();
                    });
                    return;
                }
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
                
                if (window.globalWords) {
                    const idx = window.globalWords.findIndex(w => {
                        const wId = w.id || ('W:' + (w.word||'').toLowerCase().trim());
                        return wId === key;
                    });
                    if (idx !== -1) {
                        window.globalWords[idx] = fullData;
                    }
                }
                
                if (window.dbEngine) await window.dbEngine.batchSave('words', { [key]: fullData });
                chrome.storage.local.set({ [key]: fullData }, () => {
                    window.renderWordDetail(fullData);
                    window.triggerWordFilter();
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
                
                if (window.globalWords) {
                    const idx = window.globalWords.findIndex(w => {
                        const wId = w.id || ('W:' + (w.word||'').toLowerCase().trim());
                        return wId === key;
                    });
                    if (idx !== -1) {
                        window.globalWords[idx] = fullData;
                    }
                }
                
                if (window.dbEngine) await window.dbEngine.batchSave('words', { [key]: fullData });
                chrome.storage.local.set({ [key]: fullData }, () => {
                    window.renderWordDetail(fullData);
                    window.triggerWordFilter();
                });
            });
        });

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
                    const targetVal = targetWord.trim();
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
                        // 给 DOM 切换留一点时间，然后自动点击“生成”按钮
                        setTimeout(() => {
                            treeGenBtn.click();
                        }, 100);
                    }
                }
            });
        }
    };
});