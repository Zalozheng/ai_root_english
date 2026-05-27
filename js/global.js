/**
 * 高性能词库引擎 - 基于 IndexedDB
 */
const DB_NAME = 'AiEtymologyDB';
const DB_VERSION = 1;
const STORES = {
    WORDS: 'words',
    ROOTS: 'roots'
};

window.dbEngine = {
    db: null,
    async init() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => { this.db = request.result; resolve(this.db); };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORES.WORDS)) db.createObjectStore(STORES.WORDS, { keyPath: 'id' });
                if (!db.objectStoreNames.contains(STORES.ROOTS)) db.createObjectStore(STORES.ROOTS, { keyPath: 'id' });
            };
        });
    },
    async batchSave(type, items) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([type], 'readwrite');
            const store = transaction.objectStore(type);
            for (let key in items) {
                const data = items[key];
                if (!data) continue;
                data.id = key;
                store.put(data);
            }
            transaction.oncomplete = () => {
                console.log(`[DB] 批量写入成功: ${type}`);
                resolve();
            };
            transaction.onerror = (e) => {
                console.error(`[DB] 批量写入失败: ${type}`, e);
                reject(e);
            };
        });
    },
    async get(type, key) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([type], 'readonly');
            const store = transaction.objectStore(type);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e);
        });
    },
    async delete(type, key) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([type], 'readwrite');
            const store = transaction.objectStore(type);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    },
    async clear(type) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([type], 'readwrite');
            transaction.objectStore(type).clear();
            transaction.oncomplete = () => resolve();
        });
    }
};

const BUILTIN_FOLDERS = [
    {id: 'fav_default', name: '⭐ 默认收藏夹'}
];

window.appConfig = {
    favFolders: [...BUILTIN_FOLDERS]
};
window.dataBusy = false; // 数据处理状态锁

window.initFavFoldersManager = function() {
    chrome.storage.local.get(['app_config'], (res) => {
        if (res.app_config) {
            window.appConfig = Object.assign(window.appConfig || {}, res.app_config);
        }
        if (!window.appConfig.favFolders || !Array.isArray(window.appConfig.favFolders)) {
            window.appConfig.favFolders = [];
        }
        // 清理老配置中遗留的已学完和待复习分组（它们现在作为独立的标记筛选框存在）
        window.appConfig.favFolders = window.appConfig.favFolders.filter(f => f.id !== 'fav_learned' && f.id !== 'fav_review');
        
        // 确保内置文件夹永远存在于最前面
        BUILTIN_FOLDERS.slice().reverse().forEach(bf => {
            const existing = window.appConfig.favFolders.find(f => f.id === bf.id);
            if (!existing) {
                window.appConfig.favFolders.unshift(bf);
            } else {
                existing.name = bf.name;
            }
        });
        window.renderFavFoldersUI();
    });
};

window.renderFavFoldersUI = function() {
    const statusFilter = document.getElementById('root-status-filter');
    if (!statusFilter) return;

    const val = statusFilter.value; // 保存当前选中的值

    // 清空除了“所有”以外的选项
    statusFilter.innerHTML = '<option value="all">⭐ 所有分组 (全部)</option>';

    window.appConfig.favFolders.forEach((folder) => {
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = folder.name;
        statusFilter.appendChild(option);
    });

    // 尝试恢复选中状态
    if (Array.from(statusFilter.options).find(o => o.value === val)) {
        statusFilter.value = val;
    }

    // 更新管理按钮的显示状态 (仅允许修改自定义文件夹)
    const newVal = statusFilter.value;
    const isCustom = newVal && newVal !== 'all' && !BUILTIN_FOLDERS.find(b => b.id === newVal);
    
    const editBtn = document.getElementById('edit-fav-btn');
    const delBtn = document.getElementById('del-fav-btn');
    if (editBtn) editBtn.style.display = isCustom ? 'flex' : 'none';
    if (delBtn) delBtn.style.display = isCustom ? 'flex' : 'none';
};

window.manageFavFolders = function(action) {
    if (!window.appConfig) window.appConfig = {};
    if (!window.appConfig.favFolders || !Array.isArray(window.appConfig.favFolders)) {
        window.appConfig.favFolders = [...BUILTIN_FOLDERS];
    }
    
    const statusFilter = document.getElementById('root-status-filter');
    const selectedId = statusFilter.value;
    
    const isCustom = selectedId && selectedId !== 'all' && !BUILTIN_FOLDERS.find(b => b.id === selectedId);

    if (action === 'add') {
        const name = prompt("➕ 请输入新分组名称：");
        if (name && name.trim()) {
            const newId = 'fav_' + Date.now();
            window.appConfig.favFolders.push({ id: newId, name: '📁 ' + name.trim() });
            chrome.storage.local.set({ app_config: window.appConfig }, () => {
                window.renderFavFoldersUI();
                statusFilter.value = newId;
                window.triggerRootFilter(true);
            });
        }
    } else if (action === 'edit' && isCustom) {
        const folder = window.appConfig.favFolders.find(f => f.id === selectedId);
        if (folder) {
            const newName = prompt("✏️ 修改分组名称：", folder.name.replace(/^[📁⭐✅🔄]\s*/, ''));
            if (newName && newName.trim()) {
                folder.name = '📁 ' + newName.trim();
                chrome.storage.local.set({ app_config: window.appConfig }, () => {
                    window.renderFavFoldersUI();
                    statusFilter.value = selectedId;
                });
            }
        }
    } else if (action === 'delete' && isCustom) {
        if (confirm("🗑️ 确定要彻底删除该分组吗？（该组内的词根将失去标记，但不会从词库被删除）")) {
            window.appConfig.favFolders = window.appConfig.favFolders.filter(f => f.id !== selectedId);
            chrome.storage.local.set({ app_config: window.appConfig }, () => {
                // 清理所有相关词根的标记
                window.globalRoots.forEach(r => {
                    let changed = false;
                    if (r.favorite_folder_ids && r.favorite_folder_ids.includes(selectedId)) {
                        r.favorite_folder_ids = r.favorite_folder_ids.filter(id => id !== selectedId);
                        changed = true;
                    }
                    if (r.favorite_folder_id === selectedId) {
                        r.favorite_folder_id = null;
                        changed = true;
                    }
                    if (r && changed) {
                        r.favorite_folder_id = (r.favorite_folder_ids && r.favorite_folder_ids[0]) || null;
                        r.is_favorite = !!(r.favorite_folder_ids && r.favorite_folder_ids.includes('fav_default'));
                        const rId = r.id || (r.segment ? ('R:' + r.segment.toLowerCase().replace(/^-|-$/g, '').trim()) : null);
                        if (rId) {
                            if (window.dbEngine) window.dbEngine.batchSave('roots', { [rId]: r });
                            chrome.storage.local.set({ [rId]: r });
                        }
                    }
                });
                statusFilter.value = 'all';
                window.renderFavFoldersUI();
                window.triggerRootFilter(true);
                window.clearRootDetail();
            });
        }
    }
};

window.showProgress = function(title, percent, text) {
    const modal = document.getElementById('progress-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    document.getElementById('progress-title').textContent = title;
    document.getElementById('progress-bar').style.width = percent + '%';
    document.getElementById('progress-text').textContent = text;
    document.getElementById('progress-finish-wrapper').style.display = 'none';
};

window.finishProgress = function(title, text) {
    const modal = document.getElementById('progress-modal');
    if (!modal) return;
    document.getElementById('progress-title').textContent = title;
    document.getElementById('progress-bar').style.width = '100%';
    document.getElementById('progress-text').textContent = text;
    document.getElementById('progress-finish-wrapper').style.display = 'block';
};

window.hideProgress = function() {
    const modal = document.getElementById('progress-modal');
    if (modal) modal.style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
    // 修复：Manifest V3 不允许 inline onclick，必须在这里绑定
    const closeBtn = document.getElementById('progress-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.hideProgress();
            window.dataBusy = false; // 确保关闭弹窗时释放状态锁
        });
    }

    document.querySelectorAll('.nav-item').forEach(item => { 
        item.addEventListener('click', () => window.switchView(item.getAttribute('data-target'))); 
    });
});
window.escapeHtml = function(str) { 
    return (str||'').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); 
};

/**
 * 安全批量写入 chrome.storage.local，自动分片防止超出单次写入配额。
 */
window.safeStorageSet = function(items, callback, batchSize = 50) {
    const keys = Object.keys(items);
    if (keys.length === 0) { if (callback) callback(false); return; }

    let index = 0;
    let hasError = false;

    function writeNextBatch() {
        if (index >= keys.length) {
            if (callback) callback(hasError);
            return;
        }
        const batchKeys = keys.slice(index, index + batchSize);
        const batch = {};
        batchKeys.forEach(k => { batch[k] = items[k]; });
        index += batchSize;

        chrome.storage.local.set(batch, () => {
            if (chrome.runtime.lastError) {
                console.error('[词根引擎] storage.set 失败:', chrome.runtime.lastError.message);
                hasError = true;
            }
            writeNextBatch();
        });
    }
    writeNextBatch();
};

window.showStatus = function(msg, color) { 
    const s = document.getElementById('status'); 
    if(!s) return; 
    s.textContent = msg; s.style.color = color; s.style.display = 'block'; 
    setTimeout(() => s.style.display='none', 3000); 
};

window.sortData = function(arr, type) {
    let sorted = [...arr];
    if (type === 'az') sorted.sort((a, b) => ((a.word || a.segment || '').toLowerCase().replace(/^-|-$/g, '')).localeCompare(((b.word || b.segment || '').toLowerCase().replace(/^-|-$/g, ''))));
    else if (type === 'freq') sorted.sort((a, b) => (b.lookup_count || 0) - (a.lookup_count || 0));
    else if (type === 'time') sorted.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
    return sorted;
};

// 页面导航切换引擎
window.switchView = function(targetId) {
    document.querySelectorAll('.nav-item').forEach(n => {
        if (n.getAttribute('data-target') === targetId) n.classList.add('active');
        else n.classList.remove('active');
    });
    document.querySelectorAll('.view-section').forEach(section => {
        if (section.id === targetId) {
            section.classList.add('active');
            if (targetId === 'view-words') {
                const listEl = document.getElementById('word-list');
                if (!(window.globalWords && window.globalWords.length > 0 && listEl && listEl.children.length > 0) && window.loadWordsLibrary) {
                    window.loadWordsLibrary();
                }
            }
            if (targetId === 'view-roots') {
                const listEl = document.getElementById('root-list');
                if (!(window.globalRoots && window.globalRoots.length > 0 && listEl && listEl.children.length > 0) && window.loadRootsLibrary) {
                    window.loadRootsLibrary();
                }
            }
        } else { section.classList.remove('active'); }
    });
};

// 跨组件跳转路由
window.sanitizeJumpTarget = function(text) { return text.replace(/（[^）]*）|\([^)]*\)/g, '').toLowerCase().trim(); };

window.jumpToWord = function(rawTargetWord) {
    const cleanTarget = window.sanitizeJumpTarget(rawTargetWord);
    if(!cleanTarget) return;
    window.switchView('view-words');

    chrome.storage.local.get(['W:' + cleanTarget], (res) => {
        const existing = res['W:' + cleanTarget];
        if (existing) {
            if (!window.globalWords.find(d => (d.word||'').toLowerCase() === cleanTarget)) {
                window.globalWords.push(existing);
            }
            document.querySelectorAll('#word-list .data-item').forEach(el => el.classList.remove('selected'));
            const listItems = document.querySelectorAll('#word-list .data-item');
            for(let li of listItems) {
                if(li.querySelector('.data-item-title').innerText.split('/')[0].trim().toLowerCase() === cleanTarget) {
                    li.classList.add('selected'); li.scrollIntoView({behavior: "smooth", block: "center"}); break;
                }
            }
            if(window.renderWordDetail) window.renderWordDetail(existing);
        } else {
            const pane = document.getElementById('word-detail');
            pane.innerHTML = `<div style="text-align:center; padding:50px;">正在解析 ${cleanTarget}...</div>`;
            chrome.runtime.sendMessage({ action: "fetchLLM", word: cleanTarget, forceRefresh: true }, (response) => {
                if (response && response.success && window.loadWordsLibrary) {
                    window.loadWordsLibrary(() => window.jumpToWord(cleanTarget)); 
                }
            });
        }
    });
};

window.jumpToRoot = function(rootSegment) {
    const cleanRoot = rootSegment.toLowerCase().replace(/^-|-$/g, '').trim();
    const existing = window.globalRoots.find(d => (d.segment||'').toLowerCase().replace(/^-|-$/g, '') === cleanRoot);
    window.switchView('view-roots');
    if (existing) {
        document.querySelectorAll('#root-list .data-item').forEach(el => el.classList.remove('selected'));
        const listItems = document.querySelectorAll('#root-list .data-item');
        for(let li of listItems) {
            if(li.querySelector('.data-item-title').innerText.replace(/^-|-$/g, '').trim().toLowerCase() === cleanRoot) {
                li.classList.add('selected'); li.scrollIntoView({behavior: "smooth", block: "center"}); break;
            }
        }
        if(window.renderRootDetail) window.renderRootDetail(existing);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (window.initFavFoldersManager) window.initFavFoldersManager();
    // 侧边栏折叠与移动端显示逻辑
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggle-sidebar-btn');
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    
    if (sidebar && toggleBtn) {
        // 读取持久化的折叠状态
        chrome.storage.local.get(['sidebarCollapsed'], (res) => {
            if (res.sidebarCollapsed) {
                sidebar.classList.add('collapsed');
                toggleBtn.textContent = '▶';
            }
        });

        toggleBtn.addEventListener('click', () => {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            toggleBtn.textContent = isCollapsed ? '▶' : '◀';
            chrome.storage.local.set({ sidebarCollapsed: isCollapsed });
        });
    }

    if (mobileMenuBtn && sidebar) {
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('show') && !sidebar.contains(e.target) && e.target !== mobileMenuBtn) {
                sidebar.classList.remove('show');
            }
        });
    }

    document.querySelectorAll('.nav-item').forEach(item => { 
        if (item.id === 'toggle-sidebar-btn') return;
        item.addEventListener('click', () => {
            window.switchView(item.getAttribute('data-target'));
            if (window.innerWidth <= 1000 && sidebar) sidebar.classList.remove('show');
        }); 
    });
});

// ==========================================
// 自动数据迁移
// ==========================================
async function migrateToIndexedDB() {
    if (!window.dbEngine) return;
    const checkKey = '_indexed_db_migrated';
    chrome.storage.local.get([checkKey], async (res) => {
        if (res[checkKey]) return;
        chrome.storage.local.get(null, async (all) => {
            const wordsToSave = {};
            const rootsToSave = {};
            let count = 0;
            for (let k in all) {
                if (k.startsWith('W:')) { wordsToSave[k] = all[k]; count++; }
                if (k.startsWith('R:')) { rootsToSave[k] = all[k]; count++; }
            }
            if (count > 0) {
                try {
                    await window.dbEngine.batchSave('words', wordsToSave);
                    await window.dbEngine.batchSave('roots', rootsToSave);
                    chrome.storage.local.set({ [checkKey]: true });
                } catch (e) { console.error('迁移失败:', e); }
            } else { chrome.storage.local.set({ [checkKey]: true }); }
        });
    });
}
migrateToIndexedDB();
