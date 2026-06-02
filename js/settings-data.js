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
                        if (p && p.segment) usedRoots.add(window.getSegStr(p.segment));
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
                            if (p && p.segment) otherRoots.add(window.getSegStr(p.segment));
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
        
        let items = {};
        (window.globalWords || []).forEach(w => { if(w && w.id) items[w.id] = w; });
        (window.globalRoots || []).forEach(r => { if(r && r.id) items[r.id] = r; });
        
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
                        let rootSeg = window.getSegStr(items[k].segment);
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
            
            let wordExportCount = Object.keys(exportData).filter(k => k.startsWith('W:')).length;
            let rootExportCount = Object.keys(exportData).filter(k => k.startsWith('R:')).length;
            window.showStatus(`📤 准备导出 (单词:${wordExportCount}, 词根:${rootExportCount})`, "#38bdf8");

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
    }

    if(document.getElementById('export-words-btn')) document.getElementById('export-words-btn').addEventListener('click', () => handleExport('words'));
    if(document.getElementById('export-roots-btn')) document.getElementById('export-roots-btn').addEventListener('click', () => handleExport('roots'));
    if(document.getElementById('export-all-btn')) document.getElementById('export-all-btn').addEventListener('click', () => handleExport('all'));

    // 导入引擎
    const importFile = document.getElementById('import-file');
    let pendingImportType = 'all';

    function triggerImport(type) { 
        if (window.dataBusy) return window.showStatus("⚠️ 系统正忙，请稍候...", "#f59e0b");
        pendingImportType = type; 
        importFile.click(); 
    }
    
    if(document.getElementById('import-words-btn')) document.getElementById('import-words-btn').addEventListener('click', () => triggerImport('words'));
    if(document.getElementById('import-roots-btn')) document.getElementById('import-roots-btn').addEventListener('click', () => triggerImport('roots'));
    if(document.getElementById('import-all-btn')) document.getElementById('import-all-btn').addEventListener('click', () => triggerImport('all'));

    if (importFile) {
        importFile.onchange = (e) => {
            const file = e.target.files[0]; if (!file) return;
            const isReplaceMode = document.getElementById('import-mode').checked;
            const scopeCtx = getActionScope();
            
            window.dataBusy = true;
            window.showProgress("🚀 正在导入词库", 5, "正在读取 JSON 文件...");

            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    let importedData = {};
                    let extractedRoots = {};
                    const keys = Object.keys(data);
                    const totalKeys = keys.length;
                    
                    window.showProgress("🚀 正在解析数据", 15, `共 ${totalKeys} 条记录...`);

                    for(let i=0; i<totalKeys; i++) {
                        const k = keys[i];
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
                                    const cleanRoot = window.getSegStr(p.segment);
                                    if (!cleanRoot) return;
                                    const rootKey = "R:" + cleanRoot;
                                    const cleanDerivs = (p.derivatives || []).map(d => {
                                        let str = typeof d === 'string' ? d : (d.word || '');
                                        return str.replace(/（[^）]*）|\([^)]*\)/g, '').toLowerCase().trim();
                                    }).filter(Boolean);
                                    if (!extractedRoots[rootKey]) {
                                        extractedRoots[rootKey] = {
                                            segment: p.segment,
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
                        if (i % 200 === 0) window.showProgress("🚀 正在解析数据", Math.round(15 + (i/totalKeys)*20), `解析进度: ${i}/${totalKeys}`);
                    }

                    for (let rk in extractedRoots) {
                        if (!importedData[rk]) importedData[rk] = extractedRoots[rk];
                        else importedData[rk].derivatives = [...new Set([...(importedData[rk].derivatives || []), ...extractedRoots[rk].derivatives])];
                    }

                    if (Object.keys(importedData).length === 0) {
                        window.dataBusy = false;
                        window.hideProgress();
                        window.showStatus("⚠️ JSON中没有符合条件的数据", "#f59e0b");
                        importFile.value = '';
                        return;
                    }

                    let all = {};
                    (window.globalWords || []).forEach(w => { if(w && w.id) all[w.id] = w; });
                    (window.globalRoots || []).forEach(r => { if(r && r.id) all[r.id] = r; });
                    
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
                                        let rootSeg = window.getSegStr(all[k].segment);
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

                        let finalize = async () => {
                            const totalToSave = Object.keys(toSave).length;
                            if (totalToSave > 0) {
                                window.showProgress("💾 正在持久化存储", 60, `正在同步数据库... (共 ${totalToSave} 条)`);
                                if (window.dbEngine && typeof window.dbEngine.batchSave === 'function') {
                                    const wordsToDb = {}; const rootsToDb = {};
                                    for(let k in toSave) {
                                        if(k.startsWith('W:')) wordsToDb[k] = toSave[k];
                                        if(k.startsWith('R:')) rootsToDb[k] = toSave[k];
                                    }
                                    await window.dbEngine.batchSave('words', wordsToDb).catch(e => console.warn('DB同步跳过:', e));
                                    window.showProgress("💾 正在持久化存储", 80, `数据库同步完成，正在更新配置...`);
                                    await window.dbEngine.batchSave('roots', rootsToDb).catch(e => console.warn('DB同步跳过:', e));
                                }

                                window.dataBusy = false;
                                let wordCount = Object.keys(toSave).filter(k => k.startsWith('W:')).length;
                                let rootCount = Object.keys(toSave).filter(k => k.startsWith('R:')).length;
                                window.finishProgress("✅ 导入成功", `成功导入单词:${wordCount}, 词根:${rootCount}。点击“完成”刷新列表。`);
                                
                                if(window.loadWordsLibrary) window.loadWordsLibrary();
                                if(window.loadRootsLibrary) window.loadRootsLibrary();
                            } else {
                                window.dataBusy = false;
                                window.hideProgress();
                                window.showStatus(`✅ 操作完成`, '#10b981');
                            }
                        };

                        if (keysToRemove.length > 0) {
                            window.showProgress("🧹 正在清理旧数据", 40, `正在移除 ${keysToRemove.length} 条旧记录...`);
                            if (window.dbEngine && typeof window.dbEngine.batchDelete === 'function') {
                                let wordKeys = keysToRemove.filter(k => k.startsWith('W:'));
                                let rootKeys = keysToRemove.filter(k => k.startsWith('R:'));
                                if (wordKeys.length > 0) await window.dbEngine.batchDelete('words', wordKeys).catch(e => console.warn('清理words失败', e));
                                if (rootKeys.length > 0) await window.dbEngine.batchDelete('roots', rootKeys).catch(e => console.warn('清理roots失败', e));
                            }
                            finalize();
                        } else {
                            finalize();
                        }
                } catch (err) { 
                    window.dataBusy = false; 
                    window.hideProgress();
                    window.showStatus("❌ 解析失败，非标准JSON", "#ef4444"); 
                }
                finally { importFile.value = ''; }
            };
            reader.readAsText(file);
        };
    }

    // 删除引擎
    function handleDelete(type) {
        if (window.dataBusy) return window.showStatus("⚠️ 系统正忙，请稍候...", "#f59e0b");
        
        const scopeCtx = getActionScope();
        const typeName = type === 'words' ? '纯单词' : (type === 'roots' ? '纯词根' : '所有单词和词根');
        
        let scopeName = '【全局全量】的';
        if (scopeCtx) {
            const contextSelect = document.getElementById('prompt-context');
            const contextText = contextSelect.options[contextSelect.selectedIndex].text;
            scopeName = `【仅限当前情景: ${contextText}】下的`;
        }
        
        if(!confirm(`🗑️ 确定要彻底清除 ${scopeName} ${typeName} 吗？`)) return;

        window.dataBusy = true;
        window.showProgress("🗑️ 准备清理磁盘", 10, "正在扫描待删除记录...");

        let items = {};
        (window.globalWords || []).forEach(w => { if(w && w.id) items[w.id] = w; });
        (window.globalRoots || []).forEach(r => { if(r && r.id) items[r.id] = r; });

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
                        if (Object.keys(cleanItem.memory_lines_map).length === 0) keysToRemove.push(k);
                        else itemsToUpdate[k] = cleanItem;
                    }
                } else if (isRoot) {
                    let rootSeg = window.getSegStr(items[k].segment);
                    let isUsedInCtx = usedRoots.has(rootSeg);
                    let isUsedElsewhere = otherRoots.has(rootSeg);
                    if (isUsedInCtx && !isUsedElsewhere) keysToRemove.push(k);
                    else if (!isUsedInCtx && !isUsedElsewhere) keysToRemove.push(k);
                }
            }
        }
        
        let finalize = async () => {
            // 立即执行的 UI/内存清理
            window.globalWords = [];
            window.globalRoots = [];
            window.contextRootMap = null;
            const wList = document.getElementById('word-list');
            const rList = document.getElementById('root-list');
            if (wList && (!scopeCtx || type === 'words' || type === 'all')) wList.innerHTML = '';
            if (rList && (!scopeCtx || type === 'roots' || type === 'all')) rList.innerHTML = '';
            if(window.clearWordDetail) window.clearWordDetail();
            if(window.clearRootDetail) window.clearRootDetail();

            window.showProgress("🗑️ 物理抹除中", 40, "正在清理磁盘数据库，请稍候...");

            // 执行物理清理
            if (window.dbEngine) {
                if (!scopeCtx) {
                    if (type === 'words' || type === 'all') await window.dbEngine.clear('words');
                    window.showProgress("🗑️ 物理抹除中", 70, "词根库清理中...");
                    if (type === 'roots' || type === 'all') await window.dbEngine.clear('roots');
                } else {
                    if (keysToRemove.length > 0 && typeof window.dbEngine.batchDelete === 'function') {
                        let wordKeys = keysToRemove.filter(k => k.startsWith('W:'));
                        let rootKeys = keysToRemove.filter(k => k.startsWith('R:'));
                        if (wordKeys.length > 0) await window.dbEngine.batchDelete('words', wordKeys);
                        if (rootKeys.length > 0) await window.dbEngine.batchDelete('roots', rootKeys);
                    }
                    if (Object.keys(itemsToUpdate).length > 0 && typeof window.dbEngine.batchSave === 'function') {
                        let wordItems = {}; let rootItems = {};
                        for(let k in itemsToUpdate) {
                            if(k.startsWith('W:')) wordItems[k] = itemsToUpdate[k];
                            else rootItems[k] = itemsToUpdate[k];
                        }
                        if (Object.keys(wordItems).length > 0) await window.dbEngine.batchSave('words', wordItems);
                        if (Object.keys(rootItems).length > 0) await window.dbEngine.batchSave('roots', rootItems);
                    }
                }
            }
            
            window.dataBusy = false;
            window.finishProgress("✅ 清理完成", `成功移除了选定范围内的数据。`);
            
            // 重新加载数据
            if(window.loadWordsLibrary) window.loadWordsLibrary();
            if(window.loadRootsLibrary) window.loadRootsLibrary();
        };

        finalize();
    }

    if(document.getElementById('delete-words-btn')) document.getElementById('delete-words-btn').addEventListener('click', () => handleDelete('words'));
    if(document.getElementById('delete-roots-btn')) document.getElementById('delete-roots-btn').addEventListener('click', () => handleDelete('roots'));
    if(document.getElementById('delete-all-btn')) document.getElementById('delete-all-btn').addEventListener('click', () => handleDelete('all'));
};