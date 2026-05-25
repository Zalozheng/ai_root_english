// 全局状态库
window.globalWords = [];
window.globalRoots = [];
window.appConfig = {};

// 通用工具函数
window.escapeHtml = function(str) { 
    return (str||'').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); 
};

/**
 * 安全批量写入 chrome.storage.local，自动分片防止超出单次写入配额。
 * @param {Object} items - 要写入的键值对对象
 * @param {Function} [callback] - 全部写入完成后的回调，参数 (hasError: boolean)
 * @param {number} [batchSize=50] - 每批最多写入的 key 数量
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
                // 尝试显示友好提示（仅在 options 页面有效）
                if (typeof window.showStatus === 'function') {
                    window.showStatus('⚠️ 存储空间不足，部分数据未能保存。请在"数据管理"页面导出并清理旧数据。', '#ef4444');
                }
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
            if (targetId === 'view-words' && window.loadWordsLibrary) window.loadWordsLibrary();
            if (targetId === 'view-roots' && window.loadRootsLibrary) window.loadRootsLibrary();
        } else { section.classList.remove('active'); }
    });
};

// 跨组件跳转路由
window.sanitizeJumpTarget = function(text) { return text.replace(/（[^）]*）|\([^)]*\)/g, '').toLowerCase().trim(); };

window.jumpToWord = function(rawTargetWord) {
    const cleanTarget = window.sanitizeJumpTarget(rawTargetWord);
    if(!cleanTarget) return;
    window.switchView('view-words');

    // 直接查 storage，不依赖 globalWords 是否已加载
    chrome.storage.local.get(['W:' + cleanTarget], (res) => {
        const existing = res['W:' + cleanTarget];
        if (existing) {
            // 确保 globalWords 里也有这条，避免列表选中失败
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
            pane.innerHTML = `
               <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#38bdf8;">
                  <div style="font-size:40px; animation: spin 1s infinite linear; margin-bottom:20px;">🧠</div>
                  <div style="font-size:18px; font-weight:bold;">发现新知识盲区，引擎正在现场解析：<span style="color:#fff;">${window.escapeHtml(cleanTarget)}</span></div>
               </div>
            `;
            chrome.runtime.sendMessage({ action: "fetchLLM", word: cleanTarget, forceRefresh: true }, (response) => {
                if (response && response.success && window.loadWordsLibrary) {
                    window.loadWordsLibrary(() => window.jumpToWord(cleanTarget)); 
                } else {
                    pane.innerHTML = `<div class="error" style="margin:40px;">解析中断：${window.escapeHtml(response?.error || '网络或配置错误')}</div>`;
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
    document.querySelectorAll('.nav-item').forEach(item => { 
        item.addEventListener('click', () => window.switchView(item.getAttribute('data-target'))); 
    });
});

// ==========================================
// 监听来自 Popup 的特训库跳转指令
// ==========================================
chrome.storage.local.get(['pendingLibraryWord'], (res) => { 
    if (res.pendingLibraryWord) {
        executeLibraryJump(res.pendingLibraryWord); 
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => { 
    if (namespace === 'local' && changes.pendingLibraryWord && changes.pendingLibraryWord.newValue) {
        executeLibraryJump(changes.pendingLibraryWord.newValue); 
    }
});

function executeLibraryJump(word) { 
    // 稍微延迟 150ms，确保工作台的基础 DOM 和 global 变量已经加载完毕
    setTimeout(() => { 
        if (typeof window.jumpToWord === 'function') {
            // 直接调用你写好的全局函数，它会自动完成菜单切换和定位渲染
            window.jumpToWord(word);
        }
        // 阅后即焚，防止刷新页面时死循环
        chrome.storage.local.remove('pendingLibraryWord'); 
    }, 150); 
}