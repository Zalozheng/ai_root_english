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

      // 动态同步所有情景下拉框
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
          if (customContextInput) customContextInput.style.display = contextSelect.value === 'custom' ? 'block' : 'none';
      }

      if (contextSelect) {
          renderContextSelect();
          if (!document.getElementById('context-controls-wrapper')) {
              const wrapper = document.createElement('div'); wrapper.id = 'context-controls-wrapper'; wrapper.style.cssText = 'display: flex; align-items: center; gap: 8px; width: 100%;';
              contextSelect.parentNode.insertBefore(wrapper, contextSelect); wrapper.appendChild(contextSelect);
              const delBtn = document.createElement('button'); delBtn.innerHTML = '❌'; delBtn.style.cssText = 'background:transparent; border:none; cursor:pointer; opacity:0.8; padding: 4px;';
              wrapper.appendChild(delBtn);
              delBtn.addEventListener('click', () => {
                  const currentId = contextSelect.value;
                  if (currentId === 'general') return window.showStatus('⚠️ 默认模式不可删除', '#f59e0b');
                  if (confirm('确定彻底删除此模式？')) {
                      window.appConfig.contexts = window.appConfig.contexts.filter(c => c.id !== currentId);
                      delete window.appConfig.prompts[currentId];
                      window.appConfig.promptContext = 'general';
                      renderContextSelect(); updatePromptArea();
                      chrome.storage.local.set({ app_config: window.appConfig }, () => window.showStatus('✅ 已删除', '#10b981'));
                  }
              });
          }
          contextSelect.addEventListener('change', (e) => {
              window.appConfig.promptContext = e.target.value;
              if (customContextInput) customContextInput.style.display = e.target.value === 'custom' ? 'block' : 'none';
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
      
      // 读取新开关
      if(document.getElementById('auto-parse')) document.getElementById('auto-parse').value = window.appConfig.autoParse || 'auto';
      if(document.getElementById('enable-content-script')) document.getElementById('enable-content-script').value = window.appConfig.enableContentScript || 'enabled';
      if(document.getElementById('history-limit')) document.getElementById('history-limit').value = window.appConfig.historyLimit || '10';
      if(document.getElementById('data-fallback-rule')) document.getElementById('data-fallback-rule').value = window.appConfig.dataFallbackRule || 'cross';
      if(document.getElementById('context-fallback-rule')) document.getElementById('context-fallback-rule').value = window.appConfig.contextFallbackRule || 'cross';
      
      if(document.getElementById('api-base')) document.getElementById('api-base').value = window.appConfig.apiBase || '';
      if(document.getElementById('api-key')) document.getElementById('api-key').value = window.appConfig.apiKey || '';
      if(document.getElementById('api-model')) document.getElementById('api-model').value = window.appConfig.model || '';
      if(document.getElementById('ollama-base')) document.getElementById('ollama-base').value = window.appConfig.ollamaBase || 'http://127.0.0.1:11434';
      if(window.appConfig.ollamaModel && document.getElementById('ollama-model-select')) document.getElementById('ollama-model-select').innerHTML = `<option value="${window.appConfig.ollamaModel}">${window.appConfig.ollamaModel}</option>`;
      if(document.getElementById('offline-source')) document.getElementById('offline-source').value = window.appConfig.offlineSource || 'remote';
      if(rootToggleSwitch) rootToggleSwitch.checked = (window.appConfig.rootStrategy || 'keep_old') === 'keep_old';
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

            const mergedConfig = {
                ...window.appConfig, engine: selectedEngine, 
                apiBase: document.getElementById('api-base').value.trim(), apiKey: document.getElementById('api-key').value.trim(), model: document.getElementById('api-model').value.trim(), 
                ollamaBase: document.getElementById('ollama-base').value.trim(), ollamaModel: document.getElementById('ollama-model-select').value, 
                promptContext: curCtx, customPrompt: document.getElementById('custom-prompt').value.trim(), 
                temperature: parseFloat(tempSlider ? tempSlider.value : 0.2), 
                autoParse: document.getElementById('auto-parse').value, 
                enableContentScript: document.getElementById('enable-content-script').value,
                historyLimit: document.getElementById('history-limit').value, 
                dataFallbackRule: document.getElementById('data-fallback-rule').value, 
                contextFallbackRule: document.getElementById('context-fallback-rule').value,
                offlineSource: document.getElementById('offline-source').value, 
                rootStrategy: rootToggleSwitch.checked ? 'keep_old' : 'force_new'
            };
            chrome.storage.local.set({ app_config: mergedConfig, ui_theme: document.getElementById('theme').value }, () => window.showStatus('💾 引擎设置已保存！', '#38bdf8'));
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

    // ======= 数据矩阵导入/导出/删除引擎 =======
    function getActionScope() {
        const scope = document.getElementById('data-action-context').value;
        return scope === 'all' ? null : document.getElementById('prompt-context').value;
    }

    // 导出引擎
    function handleExport(type) {
        const scopeCtx = getActionScope();
        chrome.storage.local.get(null, (items) => {
            let exportData = {}; let count = 0;
            for (let k in items) {
                let isWord = k.startsWith('W:'); let isRoot = k.startsWith('R:');
                if (!isWord && !isRoot) continue;
                
                // 情景剥离逻辑 (只导当前情景有记忆的词)
                if (scopeCtx && isWord) {
                    if (!items[k].memory_lines_map) continue;
                    let hasCtx = Object.keys(items[k].memory_lines_map).some(key => key.endsWith('_' + scopeCtx));
                    if (!hasCtx) continue;
                }

                if ((type === 'words' && isWord) || (type === 'roots' && isRoot) || type === 'all') {
                    // 脱敏：如果选了特定情景导出，剔除该词在其它情景的记忆，确保纯净
                    if (scopeCtx && isWord) {
                        let cleanItem = JSON.parse(JSON.stringify(items[k]));
                        Object.keys(cleanItem.memory_lines_map).forEach(key => {
                            if (!key.endsWith('_' + scopeCtx)) delete cleanItem.memory_lines_map[key];
                        });
                        exportData[k] = cleanItem;
                    } else {
                        exportData[k] = items[k];
                    }
                    count++;
                }
            }
            if (count === 0) return window.showStatus("⚠️ 该范围内无数据可导", "#f59e0b");
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'}); const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `备份_${scopeCtx||'全量'}_${type}_(${count}条).json`; a.click(); URL.revokeObjectURL(url);
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
            const mode = document.getElementById('import-mode').value;
            const scopeCtx = getActionScope();
            
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    let filteredData = {};
                    
                    // 按需过滤出目标数据
                    for(let k in data) {
                        let isWord = k.startsWith('W:'); let isRoot = k.startsWith('R:');
                        if (pendingImportType === 'words' && !isWord) continue;
                        if (pendingImportType === 'roots' && !isRoot) continue;
                        if (!isWord && !isRoot) continue;
                        
                        // 若指定了当前情景导入，将外来数据强行打上当前情景的标
                        if (scopeCtx && isWord && data[k].memory_lines_map) {
                           let firstKey = Object.keys(data[k].memory_lines_map)[0];
                           if(firstKey) {
                               let engineSource = firstKey.split('_')[0] || 'remote';
                               let newKey = `${engineSource}_${scopeCtx}`;
                               let linesToTransplant = data[k].memory_lines_map[firstKey];
                               data[k].memory_lines_map = {}; // 清空原本情景
                               data[k].memory_lines_map[newKey] = linesToTransplant;
                           }
                        }
                        filteredData[k] = data[k];
                    }

                    if (mode === "replace") {
                        chrome.storage.local.get(null, (all) => {
                            let keysToRemove = Object.keys(all).filter(k => {
                                if (pendingImportType === 'words') return k.startsWith("W:");
                                if (pendingImportType === 'roots') return k.startsWith("R:");
                                return k.startsWith("W:") || k.startsWith("R:");
                            });
                            chrome.storage.local.remove(keysToRemove, () => {
                                chrome.storage.local.set(filteredData, () => window.showStatus("✅ 替换导入成功", "#10b981"));
                            });
                        });
                    } else {
                        // 合并导入 (深层覆盖)
                        chrome.storage.local.get(Object.keys(filteredData), (exist) => {
                           for(let k in filteredData) {
                               if (k.startsWith('W:') && exist[k] && exist[k].memory_lines_map) {
                                   filteredData[k].memory_lines_map = { ...exist[k].memory_lines_map, ...filteredData[k].memory_lines_map };
                               }
                           }
                           chrome.storage.local.set(filteredData, () => window.showStatus("✅ 合并导入成功", "#10b981"));
                        });
                    }
                    importFile.value = ''; 
                } catch (err) { window.showStatus("❌ 解析失败，非标准JSON", "#ef4444"); }
            };
            reader.readAsText(file);
        };
    }

    // 删除引擎
    function handleDelete(type) {
        const scopeCtx = getActionScope();
        const typeName = type === 'words' ? '纯单词' : (type === 'roots' ? '纯词根' : '所有单词和词根');
        const scopeName = scopeCtx ? `【当前情景】下的` : `【全局全量】的`;
        
        if(!confirm(`🗑️ 危险：确定要彻底清除 ${scopeName} ${typeName} 吗？`)) return;

        chrome.storage.local.get(null, (items) => {
            let keysToRemove = [];
            for (let k in items) {
                let isWord = k.startsWith('W:'); let isRoot = k.startsWith('R:');
                if (type === 'words' && !isWord) continue;
                if (type === 'roots' && !isRoot) continue;
                if (type === 'all' && !isWord && !isRoot) continue;

                if (!scopeCtx) {
                    keysToRemove.push(k);
                } else if (isWord && items[k].memory_lines_map) {
                    // 如果只删当前情景，就去 Map 里剔除对应 Key
                    let map = items[k].memory_lines_map;
                    Object.keys(map).forEach(mk => { if (mk.endsWith(`_${scopeCtx}`)) delete map[mk]; });
                    if (Object.keys(map).length === 0) keysToRemove.push(k); // 如果这词没其他情景记忆了，直接删词
                    else chrome.storage.local.set({[k]: items[k]}); // 否则保留该词，只保存剔除了该情景的 Map
                }
            }
            if (keysToRemove.length > 0) chrome.storage.local.remove(keysToRemove, () => window.showStatus("🗑️ 清除完成", "#10b981"));
            else window.showStatus("✅ 该范围内已被清空", "#10b981");
        });
    }

    if(document.getElementById('delete-words-btn')) document.getElementById('delete-words-btn').addEventListener('click', () => handleDelete('words'));
    if(document.getElementById('delete-roots-btn')) document.getElementById('delete-roots-btn').addEventListener('click', () => handleDelete('roots'));
    if(document.getElementById('delete-all-btn')) document.getElementById('delete-all-btn').addEventListener('click', () => handleDelete('all'));
});