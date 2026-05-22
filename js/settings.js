document.addEventListener('DOMContentLoaded', () => {
    let selectedEngine = 'custom'; 
    const engineTabs = document.querySelectorAll('.engine-tab');
    const enginePanels = document.querySelectorAll('.engine-panel');
    const rootToggleSwitch = document.getElementById('root-toggle-switch');
    const tempSlider = document.getElementById('model-temp');
    const tempVal = document.getElementById('temp-val');

    if(tempSlider) { tempSlider.addEventListener('input', (e) => { tempVal.textContent = e.target.value; }); }

    function updateEngineTabs(engineName) {
        selectedEngine = engineName;
        engineTabs.forEach(tab => { if(tab.dataset.engine === engineName) tab.classList.add('active'); else tab.classList.remove('active'); });
        enginePanels.forEach(panel => { if(panel.id === `panel-${engineName}`) panel.classList.add('active'); else panel.classList.remove('active'); });
    }
    engineTabs.forEach(tab => { tab.addEventListener('click', (e) => updateEngineTabs(e.target.dataset.engine)); });

    chrome.storage.local.get(['app_config', 'ui_theme'], (res) => {
      window.appConfig = res.app_config || {};
      updateEngineTabs(window.appConfig.engine || 'custom');
      
      if (!window.appConfig.contexts || window.appConfig.contexts.length === 0) {
          window.appConfig.contexts = [
              { id: 'general', name: '🌍 通用生活 (日常)' },
              { id: 'civ6', name: '🏛️ 文明6游戏策划' },
              { id: 'linux_ai', name: '🐧 Linux/AI极客' },
              { id: 'custom', name: '✍️ 自定义专属角色' }
          ];
      }
      if (!window.appConfig.prompts) window.appConfig.prompts = {};
      
      const initialPrompts = {
          general: "你是一个深谙“唯名词论”的日常英语词汇专家。\n请结合极其常见的生活、购物、交流场景进行解析。\n\n(提示：您可以通过点击【设为基础模板】来覆盖本段系统内置的文字)",
          civ6: "你是一个《文明6》(Civilization VI) 的资深游戏策划兼历史学家。\n请结合游戏中的科技树、尤里卡触发、世界奇观建设、政策卡组合、时代得分或兵种克制等核心游戏机制进行解析。\n\n(这是文明6模式的专属提示词)",
          linux_ai: "你是一个极其硬核的 Linux 内核开发者兼 AI (CUDA/Ollama) 架构师。\n请结合Linux终端命令、C++底层内存管理、GPU显存分配、深度学习模型架构、或者极客黑客的计算机底层逻辑进行解析。\n\n(这是极客模式的专属提示词)",
          custom: ""
      };

      const defaultGlobalJson = `请严格分析单词，仅返回纯JSON对象。\n【警告】必须用真实解析数据填充！\n{\n  "word": "String (当前查询的单词)",\n  "display_breakdown": "String (用点分隔音节，如 ex.e.cu.tion)",\n  "phonetic_us": "String (美式音标)",\n  "primary_meaning": "String (最常用的一个中文意思)",\n  "noun_source": "String (基础来源名词，格式：英文 (中文))",\n  "parts": [\n    {\n      "segment": "String (词根/前缀/后缀)",\n      "type": "String (词根/前缀/后缀)",\n      "meaning": "String (中文含义)",\n      "deep_origin": "String (该词根的历史渊源，必须结合你的专业角色来生动讲述！)",\n      "derivatives": ["String (同根词)"]\n    }\n  ],\n  "memory_lines": ["String (必须结合 {CONTEXT} 生成一条极度硬核、有强烈画面感的记忆联想)"]\n}`;

      let needsImmediateSave = false;
      if (!window.appConfig.baseTemplate || window.appConfig.baseTemplate.includes("专业的AI词汇助手")) {
          window.appConfig.baseTemplate = initialPrompts['general']; needsImmediateSave = true;
      }
      window.appConfig.contexts.forEach(ctx => {
          if (!window.appConfig.prompts[ctx.id] || window.appConfig.prompts[ctx.id].includes("专业的AI词汇助手")) {
              window.appConfig.prompts[ctx.id] = initialPrompts[ctx.id] || ""; needsImmediateSave = true;
          }
      });
      if (!window.appConfig.globalJsonTemplate || !window.appConfig.globalJsonTemplate.includes("memory_lines")) {
          window.appConfig.globalJsonTemplate = defaultGlobalJson; needsImmediateSave = true;
      }
      if (needsImmediateSave) chrome.storage.local.set({ app_config: window.appConfig });
      if (window.appConfig.customPrompt && !window.appConfig.prompts['general']) window.appConfig.prompts['general'] = window.appConfig.customPrompt;

      const contextSelect = document.getElementById('prompt-context');
      const customContextInput = document.getElementById('custom-context-input');
      const promptArea = document.getElementById('custom-prompt');

      function renderContextSelect() {
          if (!contextSelect) return;
          contextSelect.innerHTML = '';
          const wordFilter = document.getElementById('word-context-filter');
          const rootFilter = document.getElementById('root-context-filter');
          if(wordFilter) wordFilter.innerHTML = '<option value="all">🌍 全部情景</option>';
          if(rootFilter) rootFilter.innerHTML = '<option value="all">🌍 全部情景</option>';

          window.appConfig.contexts.forEach(ctx => { 
              const opt = document.createElement('option'); opt.value = ctx.id; opt.textContent = ctx.name; contextSelect.appendChild(opt); 
              if(wordFilter) wordFilter.innerHTML += `<option value="${ctx.id}">${ctx.name}</option>`;
              if(rootFilter) rootFilter.innerHTML += `<option value="${ctx.id}">${ctx.name}</option>`;
          });
          contextSelect.value = window.appConfig.promptContext || 'general';
          checkCustomContextUI();
      }

      function checkCustomContextUI() {
          if (!contextSelect) return;
          const cur = contextSelect.value;
          const isCustom = cur.startsWith('custom');
          const wrapper = document.getElementById('rename-context-wrapper');
          if (wrapper) wrapper.style.display = isCustom ? 'flex' : 'none';

          if (isCustom && customContextInput) {
              const ctxObj = window.appConfig.contexts.find(c => c.id === cur);
              if (ctxObj) {
                  customContextInput.value = ctxObj.name.replace(/^✍️\s*/, '');
              }
          }
      }

      if (document.getElementById('add-context-btn')) {
          document.getElementById('add-context-btn').addEventListener('click', () => {
              const name = prompt('➕ 请输入新情景的名称（例如：考研英语、医学词汇）：');
              if (name && name.trim()) {
                  const newId = 'custom_' + Date.now();
                  window.appConfig.contexts.push({ id: newId, name: '✍️ ' + name.trim() });
                  window.appConfig.prompts[newId] = "";
                  window.appConfig.promptContext = newId;
                  chrome.storage.local.set({ app_config: window.appConfig }, () => {
                      renderContextSelect();
                      updatePromptArea();
                      window.showStatus('✅ 新情景已创建', '#10b981');
                  });
              }
          });
      }

      if (document.getElementById('rename-context-btn')) {
          document.getElementById('rename-context-btn').addEventListener('click', () => {
              const cur = contextSelect.value;
              const newName = customContextInput.value.trim();
              if (cur.startsWith('custom') && newName) {
                  const ctxObj = window.appConfig.contexts.find(c => c.id === cur);
                  if (ctxObj) {
                      ctxObj.name = '✍️ ' + newName;
                      chrome.storage.local.set({ app_config: window.appConfig }, () => {
                          renderContextSelect();
                          window.showStatus('✅ 情景命名已更新', '#10b981');
                      });
                  }
              } else {
                  window.showStatus('⚠️ 名称不能为空', '#f59e0b');
              }
          });
      }

      if (contextSelect && !document.getElementById('global-json-card')) {
          let card = contextSelect.parentElement;
          while(card && card.tagName !== 'BODY') { if (card.textContent.includes('界面设定与历史')) break; card = card.parentElement; }
          if (card && card.tagName !== 'BODY') {
              const globalCard = document.createElement('div');
              globalCard.id = 'global-json-card';
              globalCard.innerHTML = `
                  <div class="json-title">
                      <span>🧩 全局底层 JSON 结构约束</span>
                      <button id="reset-global-json-btn" class="btn-outline" style="padding: 4px 10px; font-size: 12px;">🔄 恢复默认结构</button>
                  </div>
                  <div style="font-size: 12px; color: #888; margin-bottom: 12px; line-height: 1.5;">无论下方切换什么情景，解析时都会自动套用此处数据格式。</div>
                  <textarea id="global-json-prompt" spellcheck="false"></textarea>
              `;
              card.parentNode.insertBefore(globalCard, card);
              const jsonTextarea = document.getElementById('global-json-prompt');
              jsonTextarea.value = window.appConfig.globalJsonTemplate;
              jsonTextarea.addEventListener('input', (e) => window.appConfig.globalJsonTemplate = e.target.value);
              document.getElementById('reset-global-json-btn').addEventListener('click', () => {
                  jsonTextarea.value = defaultGlobalJson; window.appConfig.globalJsonTemplate = defaultGlobalJson; window.showStatus('🔄 已恢复默认', '#10b981');
              });
          }
      }

      if (contextSelect) {
          renderContextSelect();
          if (!document.getElementById('context-controls-wrapper')) {
              const wrapper = document.createElement('div'); wrapper.id = 'context-controls-wrapper'; wrapper.style.cssText = 'display: flex; align-items: center; gap: 8px; width: 100%;';
              contextSelect.parentNode.insertBefore(wrapper, contextSelect); wrapper.appendChild(contextSelect);
              const delBtn = document.createElement('button'); delBtn.id = 'delete-context-btn'; delBtn.innerHTML = '❌'; delBtn.title = '删除此自定义情景'; delBtn.style.cssText = 'background:transparent; border:none; cursor:pointer; opacity:0.8; padding: 4px; display: none;';
              wrapper.appendChild(delBtn);
              
              delBtn.addEventListener('click', () => {
                  const currentId = contextSelect.value;
                  if (!currentId.startsWith('custom')) return window.showStatus('⚠️ 系统预设情景不可删除', '#f59e0b');
                  if (confirm('确定彻底删除此自定义情景？（注意：这不会删除词库里的数据，只会删除此预设身份）')) {
                      window.appConfig.contexts = window.appConfig.contexts.filter(c => c.id !== currentId);
                      delete window.appConfig.prompts[currentId];
                      window.appConfig.promptContext = 'general';
                      renderContextSelect(); updatePromptArea();
                      chrome.storage.local.set({ app_config: window.appConfig }, () => window.showStatus('✅ 已删除该情景', '#10b981'));
                  }
              });
          }
          contextSelect.addEventListener('change', (e) => {
              window.appConfig.promptContext = e.target.value;
              checkCustomContextUI();
              updatePromptArea();
          });
      }

      if (!window.appConfig.customDefaults) window.appConfig.customDefaults = {};
      function updatePromptArea() {
          if (!promptArea) return;
          const currentId = window.appConfig.promptContext || 'general';
          promptArea.value = window.appConfig.prompts[currentId] !== undefined ? window.appConfig.prompts[currentId] : (window.appConfig.customDefaults[currentId] || initialPrompts[currentId] || "");
      }
      updatePromptArea();

      if (promptArea) promptArea.addEventListener('input', (e) => window.appConfig.prompts[window.appConfig.promptContext || 'general'] = e.target.value);

      const restoreBtn = document.getElementById('restore-prompt-btn');
      if (restoreBtn) {
          const newRestoreBtn = restoreBtn.cloneNode(true); restoreBtn.parentNode.replaceChild(newRestoreBtn, restoreBtn);
          newRestoreBtn.textContent = '🔄 重置'; newRestoreBtn.style.cssText = 'padding: 4px 10px; font-size: 12px; cursor: pointer; border-radius: 4px; border: 1px solid var(--border); background: var(--surface2); color: var(--text);';
          
          if (!document.getElementById('set-default-template-btn')) {
              const setDefBtn = document.createElement('button'); setDefBtn.id = 'set-default-template-btn';
              setDefBtn.style.cssText = 'margin-left: 10px; padding: 4px 10px; font-size: 12px; cursor: pointer; border-radius: 4px; border: 1px solid #0ea5e9; background: rgba(14,165,233,0.1); color: #0ea5e9;';
              setDefBtn.textContent = '💾 设为专属默认模板';
              newRestoreBtn.parentNode.insertBefore(setDefBtn, newRestoreBtn.nextSibling);
              setDefBtn.addEventListener('click', () => {
                  const currentId = window.appConfig.promptContext || 'general';
                  window.appConfig.customDefaults[currentId] = promptArea.value;
                  chrome.storage.local.set({ app_config: window.appConfig }, () => window.showStatus('✅ 已设为默认模板！', '#10b981'));
              });
          }
          newRestoreBtn.addEventListener('click', () => {
              const currentId = window.appConfig.promptContext || 'general';
              const defaultText = window.appConfig.customDefaults[currentId] || initialPrompts[currentId] || "";
              promptArea.value = defaultText; window.appConfig.prompts[currentId] = defaultText; window.showStatus('🔄 已重置', '#10b981');
          });
      }

      // 表单回显初始化
      if(document.getElementById('theme')) document.getElementById('theme').value = res.ui_theme || 'system';
      if(tempSlider) { tempSlider.value = window.appConfig.temperature !== undefined ? window.appConfig.temperature : 0.2; tempVal.textContent = tempSlider.value; }
      
      // 读取开关状态 (使用 .checked 替换 .value)
      if(document.getElementById('auto-parse')) document.getElementById('auto-parse').checked = window.appConfig.autoParse === true;
      if(document.getElementById('enable-content-script')) document.getElementById('enable-content-script').checked = window.appConfig.enableContentScript !== false;
      if(document.getElementById('history-limit')) document.getElementById('history-limit').value = window.appConfig.historyLimit || '10';
      if(document.getElementById('data-fallback-rule')) document.getElementById('data-fallback-rule').value = window.appConfig.dataFallbackRule || 'cross';
      if(document.getElementById('context-fallback-rule')) document.getElementById('context-fallback-rule').checked = window.appConfig.contextFallbackRule !== false;
      
      // 数据操作面板持久化
      if(document.getElementById('data-action-context')) document.getElementById('data-action-context').checked = window.appConfig.dataActionContext === true;
      if(document.getElementById('import-mode')) document.getElementById('import-mode').checked = window.appConfig.importMode === true;

      if(document.getElementById('api-base')) document.getElementById('api-base').value = window.appConfig.apiBase || '';
      if(document.getElementById('api-key')) document.getElementById('api-key').value = window.appConfig.apiKey || '';
      if(document.getElementById('api-model')) document.getElementById('api-model').value = window.appConfig.model || '';
      if(document.getElementById('ollama-base')) document.getElementById('ollama-base').value = window.appConfig.ollamaBase || 'http://127.0.0.1:11434';
      if(window.appConfig.ollamaModel && document.getElementById('ollama-model-select')) document.getElementById('ollama-model-select').innerHTML = `<option value="${window.appConfig.ollamaModel}">${window.appConfig.ollamaModel}</option>`;
      if(document.getElementById('offline-source')) document.getElementById('offline-source').value = window.appConfig.offlineSource || 'remote';
      if(rootToggleSwitch) rootToggleSwitch.checked = (window.appConfig.rootStrategy || 'keep_old') === 'keep_old';

      // 状态回显后，同步更新一遍所有 Label 文案
      if (typeof updateLabels === 'function') updateLabels();
    });

    // Ollama 接口绑定
    if(document.getElementById('refresh-ollama-btn')) {
        document.getElementById('refresh-ollama-btn').addEventListener('click', async () => {
          const btn = document.getElementById('refresh-ollama-btn'); btn.textContent = '刷新...';
          try {
            const res = await fetch(`${document.getElementById('ollama-base').value.trim().replace(/\/$/, '')}/api/tags`);
            const data = await res.json();
            if (data.models?.length > 0) document.getElementById('ollama-model-select').innerHTML = data.models.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
            window.showStatus('✅ 获取成功', '#10b981');
          } catch (e) { window.showStatus('❌ 无法连接', '#ef4444'); } finally { btn.textContent = '🔄 刷新'; }
        });
    }

    // 保存全局配置
    if(document.getElementById('save-btn')) {
        document.getElementById('save-btn').addEventListener('click', () => {
            const curCtx = document.getElementById('prompt-context').value;
            window.appConfig.prompts[curCtx] = document.getElementById('custom-prompt').value;
            const globalJsonEl = document.getElementById('global-json-prompt');
            if (globalJsonEl) window.appConfig.globalJsonTemplate = globalJsonEl.value.trim();

            const customNameInput = document.getElementById('custom-context-input');
            if (curCtx === 'custom' && customNameInput && customNameInput.value.trim()) {
                const customCtxObj = window.appConfig.contexts.find(c => c.id === 'custom');
                if (customCtxObj) {
                    customCtxObj.name = `✍️ ${customNameInput.value.trim()}`;
                }
            }

            const mergedConfig = {
                ...window.appConfig, engine: selectedEngine, 
                apiBase: document.getElementById('api-base').value.trim(), apiKey: document.getElementById('api-key').value.trim(), model: document.getElementById('api-model').value.trim(), 
                ollamaBase: document.getElementById('ollama-base').value.trim(), ollamaModel: document.getElementById('ollama-model-select').value, 
                promptContext: curCtx, customPrompt: document.getElementById('custom-prompt').value.trim(), 
                temperature: parseFloat(tempSlider ? tempSlider.value : 0.2), 
                autoParse: document.getElementById('auto-parse').checked, 
                enableContentScript: document.getElementById('enable-content-script').checked,
                historyLimit: document.getElementById('history-limit').value, 
                dataFallbackRule: document.getElementById('data-fallback-rule').value, 
                contextFallbackRule: document.getElementById('context-fallback-rule').checked,
                offlineSource: document.getElementById('offline-source').value, 
                rootStrategy: rootToggleSwitch.checked ? 'keep_old' : 'force_new',
                dataActionContext: document.getElementById('data-action-context').checked,
                importMode: document.getElementById('import-mode').checked
            };
            chrome.storage.local.set({ app_config: mergedConfig, ui_theme: document.getElementById('theme').value }, () => {
                window.showStatus('💾 引擎设置已保存！', '#38bdf8');
                // 刷新下拉框文本
                const contextSelect = document.getElementById('prompt-context');
                if (contextSelect) {
                    const customOpt = Array.from(contextSelect.options).find(opt => opt.value === 'custom');
                    const customCtxObj = mergedConfig.contexts.find(c => c.id === 'custom');
                    if (customOpt && customCtxObj) {
                        customOpt.textContent = customCtxObj.name;
                    }
                }
            });
        });
    }

    // ======= 历史记录限制加减逻辑 =======
    const histInput = document.getElementById('history-limit');
    if(document.getElementById('hist-minus')) {
        document.getElementById('hist-minus').addEventListener('click', () => {
            let val = parseInt(histInput.value) || 10;
            if (val > 1) histInput.value = val - 1;
        });
    }
    if(document.getElementById('hist-plus')) {
        document.getElementById('hist-plus').addEventListener('click', () => {
            let val = parseInt(histInput.value) || 10;
            if (val < 999) histInput.value = val + 1;
        });
    }
    if(document.getElementById('clear-history-btn')) {
        document.getElementById('clear-history-btn').addEventListener('click', () => {
            if(confirm('🗑️ 确定要清空搜索历史下拉列表吗？（这不会删除词库数据）')) {
                chrome.storage.local.remove(['history_list'], () => {
                    window.showStatus('🧹 历史列表已清空', '#10b981');
                });
            }
        });
    }

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
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'}); const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `ai_roots_export_${scopeCtx || 'global'}_${type}_${count}.json`; a.click(); URL.revokeObjectURL(url);
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

    // ======= 动态文案更新逻辑 =======
    const ctxToggle = document.getElementById('data-action-context');
    const ctxLabel = document.getElementById('label-action-context');
    const modeToggle = document.getElementById('import-mode');
    const modeLabel = document.getElementById('label-import-mode');
    
    const contentToggle = document.getElementById('enable-content-script');
    const contentLabel = document.getElementById('label-content-script');
    const autoToggle = document.getElementById('auto-parse');
    const autoLabel = document.getElementById('label-auto-parse');
    
    const contextFallbackToggle = document.getElementById('context-fallback-rule');
    const contextFallbackLabel = document.getElementById('label-context-fallback');
    const rootStrategyToggle = document.getElementById('root-toggle-switch');
    const rootStrategyLabel = document.getElementById('label-root-strategy');
    
    // 获取 Hint 元素
    const hints = {
        actionCtx: document.getElementById('hint-action-context'),
        importMode: document.getElementById('hint-import-mode'),
        contentScript: document.getElementById('hint-content-script'),
        autoParse: document.getElementById('hint-auto-parse'),
        contextFallback: document.getElementById('hint-context-fallback'),
        rootStrategy: document.getElementById('hint-root-strategy')
    };

    function updateLabels() {
        if(ctxToggle && ctxLabel) {
            ctxLabel.textContent = ctxToggle.checked ? "🌍 仅限当前情景" : "🌍 全局数据模式";
            ctxLabel.style.color = ctxToggle.checked ? "#ef4444" : "#a1a1aa";
            if(hints.actionCtx) hints.actionCtx.textContent = ctxToggle.checked ? "操作仅针对当前选择的 AI 情景" : "操作将影响所有情景下的数据";
        }
        if(modeToggle && modeLabel) {
            modeLabel.textContent = modeToggle.checked ? "📥 替换模式导入" : "📥 合并模式导入";
            modeLabel.style.color = modeToggle.checked ? "#ef4444" : "#a1a1aa";
            if(hints.importMode) hints.importMode.textContent = modeToggle.checked ? "导入时将【覆盖】现有的同类记录" : "将新数据与现有记录进行合并";
        }
        if(contentToggle && contentLabel) {
            contentLabel.textContent = contentToggle.checked ? "🌐 网页划词取词已开" : "🌐 网页划词取词已关";
            contentLabel.style.color = contentToggle.checked ? "#38bdf8" : "#71717a";
            if(hints.contentScript) hints.contentScript.textContent = contentToggle.checked ? "选中文本后显示搜索小图标" : "已彻底禁用网页划词功能";
        }
        if(autoToggle && autoLabel) {
            autoLabel.textContent = autoToggle.checked ? "⚡ 图标即点即译已开" : "⚡ 图标即点即译已关";
            autoLabel.style.color = autoToggle.checked ? "#fcd34d" : "#71717a";
            if(hints.autoParse) hints.autoParse.textContent = autoToggle.checked ? "点击插件图标立即翻译选中词" : "图标点击仅打开插件主面板";
        }
        if(contextFallbackToggle && contextFallbackLabel) {
            contextFallbackLabel.textContent = contextFallbackToggle.checked ? "⚡ 跨情景借用已开" : "⚡ 跨情景借用已关";
            contextFallbackLabel.style.color = contextFallbackToggle.checked ? "#bae6fd" : "#71717a";
            if(hints.contextFallback) hints.contextFallback.textContent = contextFallbackToggle.checked ? "允许不同角色间共用缓存数据" : "严格隔离不同角色的解析记录";
        }
        if(rootStrategyToggle && rootStrategyLabel) {
            rootStrategyLabel.textContent = rootStrategyToggle.checked ? "🛡️ 保护旧词根已开" : "🛡️ 保护旧词根已关";
            rootStrategyLabel.style.color = rootStrategyToggle.checked ? "#d1d5db" : "#71717a";
            if(hints.rootStrategy) hints.rootStrategy.textContent = rootStrategyToggle.checked ? "优先保留手动修改过的词源故事" : "词根故事将由 AI 重新生成";
        }
    }

    if(ctxToggle) ctxToggle.addEventListener('change', updateLabels);
    if(modeToggle) modeToggle.addEventListener('change', updateLabels);
    if(contentToggle) contentToggle.addEventListener('change', updateLabels);
    if(autoToggle) autoToggle.addEventListener('change', updateLabels);
    if(contextFallbackToggle) contextFallbackToggle.addEventListener('change', updateLabels);
    if(rootStrategyToggle) rootStrategyToggle.addEventListener('change', updateLabels);
    updateLabels();
});