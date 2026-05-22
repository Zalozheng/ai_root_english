window.initDataEngine = function() {
    // ======= 数据矩阵导入/导出/删除引擎 =======
    function getActionScope() {
        const isSpecific = document.getElementById('data-action-context').checked;
        return isSpecific ? document.getElementById('prompt-context').value : null;
    }

    function getRootsUsedInContext(items, context) {
        let usedRoots = new Set();
        for (let k in items) {
            if (k.startsWith('W:')) {
                let w = items[k];
                if (w.memory_lines_map && Object.keys(w.memory_lines_map).some(mk => mk.endsWith(`_${context}`))) {
                    (w.parts || []).forEach(p => {
                        if (p && p.segment) usedRoots.add(p.segment.toLowerCase().replace(/^-|-$/g, '').trim());
                    });
                }
            }
        }
        return usedRoots;
    }

    function getRootsUsedInOtherContexts(items, context) {
        let otherRoots = new Set();
        for (let k in items) {
            if (k.startsWith('W:')) {
                let w = items[k];
                if (w.memory_lines_map) {
                    let usedInOther = Object.keys(w.memory_lines_map).some(mk => !mk.endsWith(`_${context}`));
                    if (usedInOther) {
                        (w.parts || []).forEach(p => {
                            if (p && p.segment) otherRoots.add(p.segment.toLowerCase().replace(/^-|-$/g, '').trim());
                        });
                    }
                }
            }
        }
        return otherRoots;
    }

    // 导出引擎
    function handleExport(type) {
        const scopeCtx = getActionScope();
        chrome.storage.local.get(null, (items) => {
            let exportData = {}; let count = 0;
            let usedRoots = scopeCtx ? getRootsUsedInContext(items, scopeCtx) : null;

            for (let k in items) {
                let isWord = k.startsWith('W:'); let isRoot = k.startsWith('R:');
                if (!isWord && !isRoot) continue;
                if (type === 'words' && !isWord) continue;
                if (type === 'roots' && !isRoot) continue;
                
                if (scopeCtx) {
                    if (isWord) {
                        if (!items[k].memory_lines_map) continue;
                        let hasCtx = Object.keys(items[k].memory_lines_map).some(key => key.endsWith(`_${scopeCtx}`));
                        if (!hasCtx) continue;
                        let cleanItem = JSON.parse(JSON.stringify(items[k]));
                        Object.keys(cleanItem.memory_lines_map).forEach(key => {
                            if (!key.endsWith(`_${scopeCtx}`)) delete cleanItem.memory_lines_map[key];
                        });
                        exportData[k] = cleanItem;
                        count++;
                    } else if (isRoot) {
                        let rootSeg = (items[k].segment || '').toLowerCase().replace(/^-|-$/g, '').trim();
                        if (usedRoots.has(rootSeg)) {
                            exportData[k] = items[k];
                            count++;
                        }
                    }
                } else {
                    exportData[k] = items[k];
                    count++;
                }
            }
            if (count === 0) return window.showStatus("⚠️ 该范围内无数据可导", "#f59e0b");
            
            let filenamePrefix = "全局导出";
            if (scopeCtx) {
                const contextSelect = document.getElementById('prompt-context');
                if (contextSelect && contextSelect.selectedIndex !== -1) {
                    let rawName = contextSelect.options[contextSelect.selectedIndex].text;
                    // 移除 emoji 和两端的空格/标点，保留纯文本名称
                    filenamePrefix = rawName.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '').trim();
                } else {
                    filenamePrefix = scopeCtx;
                }
            }
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'}); const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${filenamePrefix}_export_${scopeCtx || 'global'}_${type}_${count}.json`; a.click(); URL.revokeObjectURL(url);
        });
    }

    if(document.getElementById('export-words-btn')) document.getElementById('export-words-btn').addEventListener('click', () => handleExport('words'));
    if(document.getElementById('export-roots-btn')) document.getElementById('export-roots-btn').addEventListener('click', () => handleExport('roots'));
    if(document.getElementById('export-all-btn')) document.getElementById('export-all-btn').addEventListener('click', () => handleExport('all'));

    // 导入引擎
    const importFile = document.getElementById('import-file');
    let pendingImportType = 'all';

    function triggerImport(type) { pendingImportType = type; importFile.click(); }
    
    if(document.getElementById('import-words-btn')) document.getElementById('import-words-btn').addEventListener('click', () => triggerImport('words'));
    if(document.getElementById('import-roots-btn')) document.getElementById('import-roots-btn').addEventListener('click', () => triggerImport('roots'));
    if(document.getElementById('import-all-btn')) document.getElementById('import-all-btn').addEventListener('click', () => triggerImport('all'));

    if (importFile) {
        importFile.onchange = (e) => {
            const file = e.target.files[0]; if (!file) return;
            const isReplaceMode = document.getElementById('import-mode').checked;
            const scopeCtx = getActionScope();
            
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    let importedData = {};
                    let extractedRoots = {};
                    
                    for(let k in data) {
                        let isWord = k.startsWith('W:'); let isRoot = k.startsWith('R:');
                        if (!isWord && !isRoot) continue;
                        
                        if (isWord) {
                            if (scopeCtx) {
                               if (!data[k].memory_lines_map) data[k].memory_lines_map = {};
                               let map = data[k].memory_lines_map;
                               let targetLines = [];
                               let engineSource = 'remote';
                               
                               let existingTargetKey = Object.keys(map).find(mk => mk.endsWith(`_${scopeCtx}`));
                               if (existingTargetKey) {
                                   targetLines = map[existingTargetKey] || [];
                                   engineSource = existingTargetKey.split('_')[0];
                               } else {
                                   Object.keys(map).forEach(mk => {
                                       if (Array.isArray(map[mk])) targetLines.push(...map[mk]);
                                   });
                                   if (targetLines.length === 0 && Array.isArray(data[k].memory_lines)) {
                                       targetLines.push(...data[k].memory_lines);
                                   }
                                   targetLines = [...new Set(targetLines)]; 
                                   let firstKey = Object.keys(map)[0];
                                   if (firstKey) engineSource = firstKey.split('_')[0];
                               }
                               
                               data[k].memory_lines_map = {}; 
                               data[k].memory_lines_map[`${engineSource}_${scopeCtx}`] = targetLines;
                            }
                            if (pendingImportType === 'words' || pendingImportType === 'all') {
                                importedData[k] = data[k];
                            }
                            if (pendingImportType === 'roots' || pendingImportType === 'all') {
                                (data[k].parts || []).forEach(p => {
                                    if (!p.segment) return;
                                    const cleanRoot = p.segment.toLowerCase().replace(/^-|-$/g, '').trim();
                                    const rootKey = "R:" + cleanRoot;
                                    const cleanDerivs = (p.derivatives || []).map(d => d.replace(/（[^）]*）|\([^)]*\)/g, '').toLowerCase().trim()).filter(Boolean);
                                    if (!extractedRoots[rootKey]) {
                                        extractedRoots[rootKey] = {
                                            segment: p.segment.toLowerCase().trim(),
                                            type: p.type || '词根',
                                            meaning: p.meaning || '',
                                            deep_origin: p.deep_origin || '',
                                            derivatives: cleanDerivs,
                                            lookup_count: 0,
                                            updated_at: Date.now()
                                        };
                                    } else {
                                        extractedRoots[rootKey].derivatives = [...new Set([...extractedRoots[rootKey].derivatives, ...cleanDerivs])];
                                    }
                                });
                            }
                        }
                        
                        if (isRoot) {
                            if (pendingImportType === 'roots' || pendingImportType === 'all') {
                                importedData[k] = data[k];
                            }
                        }
                    }

                    for (let rk in extractedRoots) {
                        if (!importedData[rk]) importedData[rk] = extractedRoots[rk];
                        else importedData[rk].derivatives = [...new Set([...(importedData[rk].derivatives || []), ...extractedRoots[rk].derivatives])];
                    }

                    if (Object.keys(importedData).length === 0) {
                        window.showStatus("⚠️ JSON中没有符合条件的数据", "#f59e0b");
                        importFile.value = '';
                        return;
                    }

                    chrome.storage.local.get(null, (all) => {
                        let toSave = {};
                        let keysToRemove = [];
                        let usedRoots = scopeCtx ? getRootsUsedInContext(all, scopeCtx) : null;

                        if (isReplaceMode) {
                            if (!scopeCtx) {
                                Object.keys(all).forEach(k => {
                                    if (pendingImportType === 'words' && k.startsWith("W:")) keysToRemove.push(k);
                                    if (pendingImportType === 'roots' && k.startsWith("R:")) keysToRemove.push(k);
                                    if (pendingImportType === 'all' && (k.startsWith("W:") || k.startsWith("R:"))) keysToRemove.push(k);
                                });
                            } else {
                                Object.keys(all).forEach(k => {
                                    let isWord = k.startsWith('W:'); let isRoot = k.startsWith('R:');
                                    if (isWord && (pendingImportType === 'words' || pendingImportType === 'all') && all[k].memory_lines_map) {
                                        let map = all[k].memory_lines_map;
                                        let modified = false;
                                        Object.keys(map).forEach(mk => {
                                            if (mk.endsWith(`_${scopeCtx}`)) { delete map[mk]; modified = true; }
                                        });
                                        if (modified) {
                                            if (Object.keys(map).length === 0) keysToRemove.push(k);
                                            else toSave[k] = all[k]; 
                                        }
                                    } else if (isRoot && (pendingImportType === 'roots' || pendingImportType === 'all')) {
                                        let rootSeg = (all[k].segment || '').toLowerCase().replace(/^-|-$/g, '').trim();
                                        if (usedRoots.has(rootSeg)) keysToRemove.push(k);
                                    }
                                });
                            }
                        }

                        for (let k in importedData) {
                            if (all[k] && !keysToRemove.includes(k) && k.startsWith('W:')) {
                                let baseMap = toSave[k] ? toSave[k].memory_lines_map : all[k].memory_lines_map;
                                importedData[k].memory_lines_map = { ...(baseMap||{}), ...(importedData[k].memory_lines_map||{}) };
                                importedData[k].lookup_count = all[k].lookup_count || 0;
                                importedData[k].updated_at = all[k].updated_at || Date.now();
                            }
                            if (all[k] && !keysToRemove.includes(k) && k.startsWith('R:')) {
                                let existingRoot = all[k];
                                importedData[k].lookup_count = existingRoot.lookup_count || 0;
                                importedData[k].updated_at = existingRoot.updated_at || Date.now();
                                
                                const rootStrategy = document.getElementById('root-toggle-switch').checked ? 'keep_old' : 'force_new';
                                if (rootStrategy === 'keep_old') {
                                    importedData[k].meaning = existingRoot.meaning;
                                    importedData[k].deep_origin = existingRoot.deep_origin;
                                    importedData[k].manual_category = existingRoot.manual_category || importedData[k].manual_category;
                                }
                                let newDerivs = importedData[k].derivatives || [];
                                let oldDerivs = existingRoot.derivatives || [];
                                importedData[k].derivatives = [...new Set([...oldDerivs, ...newDerivs])];
                            }
                            toSave[k] = importedData[k];
                            keysToRemove = keysToRemove.filter(rk => rk !== k);
                        }

                        let finalize = () => {
                            if (Object.keys(toSave).length > 0) {
                                chrome.storage.local.set(toSave, () => window.showStatus(`✅ ${isReplaceMode?'替换':'合并'}导入成功`, "#10b981"));
                            } else {
                                window.showStatus(`✅ 操作完成`, "#10b981");
                            }
                        };

                        if (keysToRemove.length > 0) chrome.storage.local.remove(keysToRemove, finalize);
                        else finalize();
                    });
                } catch (err) { window.showStatus("❌ 解析失败，非标准JSON", "#ef4444"); }
                finally { importFile.value = ''; }
            };
            reader.readAsText(file);
        };
    }

    // 删除引擎
    function handleDelete(type) {
        const scopeCtx = getActionScope();
        const typeName = type === 'words' ? '纯单词' : (type === 'roots' ? '纯词根' : '所有单词和词根');
        
        let scopeName = '【全局全量】的';
        if (scopeCtx) {
            const contextSelect = document.getElementById('prompt-context');
            const contextText = contextSelect.options[contextSelect.selectedIndex].text;
            scopeName = `【仅限当前情景: ${contextText}】下的`;
        }
        
        if(!confirm(`🗑️ 危险：确定要彻底清除 ${scopeName} ${typeName} 吗？`)) return;

        chrome.storage.local.get(null, (items) => {
            let keysToRemove = [];
            let itemsToUpdate = {};
            let usedRoots = null;
            let otherRoots = null;
            
            if (scopeCtx) {
                usedRoots = getRootsUsedInContext(items, scopeCtx);
                otherRoots = getRootsUsedInOtherContexts(items, scopeCtx);
            }

            for (let k in items) {
                let isWord = k.startsWith('W:'); let isRoot = k.startsWith('R:');
                if (type === 'words' && !isWord) continue;
                if (type === 'roots' && !isRoot) continue;
                if (type === 'all' && !isWord && !isRoot) continue;

                if (!scopeCtx) {
                    keysToRemove.push(k);
                } else {
                    if (isWord && items[k].memory_lines_map) {
                        let map = items[k].memory_lines_map;
                        let hasCtx = Object.keys(map).some(mk => mk.endsWith(`_${scopeCtx}`));
                        if (hasCtx) {
                            let cleanItem = JSON.parse(JSON.stringify(items[k]));
                            Object.keys(cleanItem.memory_lines_map).forEach(mk => { 
                                if (mk.endsWith(`_${scopeCtx}`)) delete cleanItem.memory_lines_map[mk]; 
                            });
                            if (Object.keys(cleanItem.memory_lines_map).length === 0) {
                                keysToRemove.push(k);
                            } else {
                                itemsToUpdate[k] = cleanItem;
                            }
                        }
                    } else if (isRoot) {
                        let rootSeg = (items[k].segment || '').toLowerCase().replace(/^-|-$/g, '').trim();
                        // 安全验证：仅当词根在这个情景被使用，且【没有】在其他情景被使用时，才彻底删除
                        if (usedRoots.has(rootSeg) && !otherRoots.has(rootSeg)) {
                            keysToRemove.push(k);
                        }
                    }
                }
            }
            
            let finalize = () => window.showStatus("🗑️ 清除完成", "#10b981");
            let tasks = 0;
            if (keysToRemove.length > 0) tasks++;
            if (Object.keys(itemsToUpdate).length > 0) tasks++;
            
            if (tasks === 0) return window.showStatus("✅ 该范围内已被清空", "#10b981");

            let done = 0;
            let checkDone = () => { done++; if (done === tasks) finalize(); };

            if (keysToRemove.length > 0) chrome.storage.local.remove(keysToRemove, checkDone);
            if (Object.keys(itemsToUpdate).length > 0) chrome.storage.local.set(itemsToUpdate, checkDone);
        });
    }

    if(document.getElementById('delete-words-btn')) document.getElementById('delete-words-btn').addEventListener('click', () => handleDelete('words'));
    if(document.getElementById('delete-roots-btn')) document.getElementById('delete-roots-btn').addEventListener('click', () => handleDelete('roots'));
    if(document.getElementById('delete-all-btn')) document.getElementById('delete-all-btn').addEventListener('click', () => handleDelete('all'));
};