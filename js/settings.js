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
              globalCard.style.cssText = 'background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 20px;';
              globalCard.innerHTML = `
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                      <span style="font-weight:bold; color:var(--text); font-size: 15px;">🧩 全局底层 JSON 结构约束</span>
                      <button id="reset-global-json-btn" style="padding: 4px 10px; font-size: 12px; cursor: pointer; border-radius: 4px; border: 1px solid var(--border); background: var(--surface2); color: var(--text); transition: 0.2s;">🔄 恢复默认结构</button>
                  </div>
                  <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px; line-height: 1.5;">无论下方切换什么情景，解析时都会自动套用此处数据格式。</div>
                  <textarea id="global-json-prompt" spellcheck="false" style="width:100%; height:260px; box-sizing: border-box; background:var(--bg); color:var(--text); border:1px solid var(--border); border-radius:8px; padding:12px; font-family:monospace; font-size:12px; resize:vertical; outline:none; line-height:1.5;"></textarea>
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

      function renderContextSelect() {
          if (!contextSelect) return;
          contextSelect.innerHTML = '';
          window.appConfig.contexts.forEach(ctx => { const opt = document.createElement('option'); opt.value = ctx.id; opt.textContent = ctx.name; contextSelect.appendChild(opt); });
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
              setDefBtn.style.cssText = 'margin-left: 10px; padding: 4px 10px; font-size: 12px; cursor: pointer; border-radius: 4px; border: 1px solid var(--accent); background: rgba(14,165,233,0.1); color: var(--accent);';
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
      if(document.getElementById('auto-parse')) document.getElementById('auto-parse').value = window.appConfig.autoParse || 'auto';
      if(document.getElementById('history-limit')) document.getElementById('history-limit').value = window.appConfig.historyLimit || '10';
      if(document.getElementById('api-base')) document.getElementById('api-base').value = window.appConfig.apiBase || '';
      if(document.getElementById('api-key')) document.getElementById('api-key').value = window.appConfig.apiKey || '';
      if(document.getElementById('api-model')) document.getElementById('api-model').value = window.appConfig.model || '';
      if(document.getElementById('ollama-base')) document.getElementById('ollama-base').value = window.appConfig.ollamaBase || 'http://127.0.0.1:11434';
      if(window.appConfig.ollamaModel && document.getElementById('ollama-model-select')) document.getElementById('ollama-model-select').innerHTML = `<option value="${window.appConfig.ollamaModel}">${window.appConfig.ollamaModel}</option>`;
      if(document.getElementById('offline-source')) document.getElementById('offline-source').value = window.appConfig.offlineSource || 'remote';
      if(document.getElementById('data-fallback-rule')) document.getElementById('data-fallback-rule').value = window.appConfig.dataFallbackRule || 'cross';
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
                temperature: parseFloat(tempSlider ? tempSlider.value : 0.2), autoParse: document.getElementById('auto-parse').value, 
                historyLimit: document.getElementById('history-limit').value, dataFallbackRule: document.getElementById('data-fallback-rule').value, 
                offlineSource: document.getElementById('offline-source').value, rootStrategy: rootToggleSwitch.checked ? 'keep_old' : 'force_new'
            };
            chrome.storage.local.set({ app_config: mergedConfig, ui_theme: document.getElementById('theme').value }, () => window.showStatus('💾 引擎设置已保存！', '#38bdf8'));
        });
    }

    // 导入导出与数据清理
    if(document.getElementById('export-btn')) {
        document.getElementById('export-btn').addEventListener('click', () => { 
            const scope = document.getElementById('export-scope').value;
            chrome.storage.local.get(null, (items) => {
              let exportData = {}; let count = 0;
              for (let k in items) { if ((scope === 'only_roots' && k.startsWith('R:')) || (scope === 'all' && (k.startsWith('R:') || k.startsWith('W:')))) { exportData[k] = items[k]; count++; } }
              if (count === 0) return window.showStatus("⚠️ 数据库为空", "#f59e0b");
              const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'}); const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `备份_${scope}_(${count}条).json`; a.click(); URL.revokeObjectURL(url);
            });
        });
    }

    if(document.getElementById('clear-all-data-btn')) {
        document.getElementById('clear-all-data-btn').addEventListener('click', () => {
          if(confirm("确定清空本地所有单词和词根故事吗？")) {
             chrome.storage.local.get(null, (items) => {
               const keys = Object.keys(items).filter(k => k.startsWith('W:') || k.startsWith('R:') || k === 'history_list');
               chrome.storage.local.remove(keys, () => window.showStatus(`🗑️ 已清空 ${keys.length} 条数据`, '#10b981'));
             });
          }
        });
    }
});