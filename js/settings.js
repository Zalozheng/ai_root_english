document.addEventListener('DOMContentLoaded', () => {
    let selectedEngine = 'custom'; 
    const engineTabs = document.querySelectorAll('.engine-tab');
    const enginePanels = document.querySelectorAll('.engine-panel');
    const rootToggleSwitch = document.getElementById('root-toggle-switch');
    const tempSlider = document.getElementById('model-temp');
    const tempVal = document.getElementById('temp-val');

    // ======= API 协议切换辅助函数 =======
    function updateApiProtocolUI(protocol) {
        const baseInput = document.getElementById('api-base');
        const modelInput = document.getElementById('api-model');
        const hintEl = document.getElementById('api-protocol-hint');
        
        // 降低补全强度，不再强制修改已有的合法地址
        if (baseInput && baseInput.value) {
            let val = baseInput.value.trim();
            // 只有当用户填写的地址非常短（只有域名）时才辅助补全
            const isJustDomain = /^(https?:\/\/[^\/]+)\/?$/.test(val);
            if (isJustDomain) {
                if (protocol === 'openai') {
                    baseInput.value = val.replace(/\/?$/, '/v1');
                }
            }
        }

        // 切换协议时自动加载该协议上次保存的模型
        if (modelInput && window.appConfig) {
            const protocolModels = window.appConfig.protocolModels || {};
            if (protocolModels[protocol]) {
                modelInput.value = protocolModels[protocol];
            } else {
                // 默认值
                modelInput.value = protocol === 'claude' ? 'claude-3-5-sonnet-20240620' : 'gpt-4o';
            }
        }

        if (protocol === 'claude') {
            if (baseInput) baseInput.placeholder = '例如: https://api.anthropic.com';
            if (hintEl) hintEl.textContent = '支持完整路径，如包含 /v1/messages 则不自动追加';
        } else {
            if (baseInput) baseInput.placeholder = '例如: https://api.openai.com/v1';
            if (hintEl) hintEl.textContent = '支持完整路径，如包含 /chat/completions 则不自动追加';
        }
    }

    if(tempSlider) { tempSlider.addEventListener('input', (e) => { tempVal.textContent = e.target.value; }); }

    function updateEngineTabs(engineName) {
        selectedEngine = engineName;
        engineTabs.forEach(tab => { if(tab.dataset.engine === engineName) tab.classList.add('active'); else tab.classList.remove('active'); });
        enginePanels.forEach(panel => { if(panel.id === `panel-${engineName}`) panel.classList.add('active'); else panel.classList.remove('active'); });
    }
    engineTabs.forEach(tab => { 
        tab.addEventListener('click', () => updateEngineTabs(tab.dataset.engine)); 
    });

    // 显示版本号
    const versionEl = document.getElementById('plugin-version');
    if (versionEl) {
        const manifest = chrome.runtime.getManifest();
        versionEl.textContent = manifest.version || '未知';
    }

    chrome.storage.local.get(['app_config', 'ui_theme'], (res) => {
      window.appConfig = res.app_config || {};
      updateEngineTabs(window.appConfig.engine || 'custom');
      
      if (!window.appConfig.contexts || window.appConfig.contexts.length === 0) {
          window.appConfig.contexts = [
              { id: 'general', name: '🌍 通用生活 (日常)' },
              { id: 'civ6', name: '🏛️ 文明6游戏策划' },
              { id: 'linux_ai', name: '🐧 Linux/AI极客' },
              { id: 'etymology', name: '📖 openai词源' },
              { id: 'claude', name: '📖 claude词源' },
              { id: 'custom', name: '✍️ 自定义专属角色' }
          ];
      }
      if (!window.appConfig.prompts) window.appConfig.prompts = {};
      
      const initialPrompts = {
          general: '你是一个深谙\u201c唯名词论\u201d的日常英语词汇专家。\n请结合极其常见的生活、购物、交流场景进行解析。\n\n(提示：您可以通过点击【设为基础模板】来覆盖本段系统内置的文字)',
          civ6: '你是一个《文明6》(Civilization VI) 的资深游戏策划兼历史学家。\n请结合游戏中的科技树、尤里卡触发、世界奇观建设、政策卡组合、时代得分或兵种克意等核心游戏机制进行解析。\n\n(这是文明6模式的专属提示词)',
          linux_ai: '你是一个极其硬核的 Linux 内核开发者兼 AI (CUDA/Ollama) 架构师。\n请结合Linux终端命令、C++底层内存管理、GPU显存分配、深度学习模型架构、或者极客黑客的计算机底层逻辑进行解析。\n\n(这是极客模式的专属提示词)',
          claude: '你是一个英语词汇词源专家，你是一个深谙\u201c唯名词论\u201d的日常英语词汇专家。\n请结合极其常见的生活、购物、交流场景进行解析。\n\n仅返回如下纯JSON对象，不要有任何多余文字，memory_lines必须严格输出8个字符串元素：\n{\n  "word": "String",\n  "display_breakdown": "String (用点分隔音节，如 ex.e.cu.tion)",\n  "phonetic_us": "String (美式音标)",\n  "primary_meaning": "String (最常用中文意思)",\n  "noun_source": "String (基础来源名词，格式：英文 (中文))",\n  "parts": [\n    {\n      "segment": "String",\n      "type": "String (词根/前缀/后缀)",\n      "meaning": "String (中文含义)",\n      "deep_origin": "String (历史渊源，内部严禁使用双引号)",\n      "derivatives": ["String"]\n    }\n  ],\n  "memory_lines": [\n    "1. 中文(`英文部件`) + 中文(`英文部件`) → **完整单词**(中文释义)。",\n    "",\n    "2. 💡 情景联想：结合【{CONTEXT}】写画面，30字以内！",\n    "",\n    "3. 极简英文例句带括号中文翻译。",\n    "",\n    "4. 📖 词源故事：用1~2句话讲历史典故或来源趣事，50字以内。",\n    ""\n  ]\n}\n\n(这是词源模式的专属提示词，基于claude真实词源数据)',
          etymology: '你是一个英语词汇词源专家，你是一个深谙\u201c唯名词论\u201d的日常英语词汇专家。\n请结合极其常见的生活、购物、交流场景进行解析。\n\n当用户输入一个英文单词时：\n如果你具有联网搜索能力，请先查询：\nsite:etymonline.com [单词]\n获取真实词源拆解后，再按格式输出。\n禁止凭记忆猜测词根，一律以真实词源为准。\n\n仅返回如下纯JSON对象，不要有任何多余文字：\n{\n  "word": "String",\n  "display_breakdown": "String (用点分隔音节，如 ex.e.cu.tion)",\n  "phonetic_us": "String (美式音标)",\n  "primary_meaning": "String (最常用中文意思)",\n  "noun_source": "String (基础来源名词，格式：英文 (中文))",\n  "parts": [\n    {\n      "segment": "String",\n      "type": "String (词根/前缀/后缀)",\n      "meaning": "String (中文含义)",\n      "deep_origin": "String (历史渊源，内部严禁使用双引号)",\n      "derivatives": ["String"]\n    }\n  ],\n  "memory_lines": [\n    "1. 中文(`英文部件`) + 中文(`英文部件`) → **完整单词**(中文释义)。",\n    "",\n    "2. 💡 情景联想：结合【{CONTEXT}】写画面，30字以内！",\n    "",\n    "3. 极简英文例句带括号中文翻译。",\n    "",\n    "4. 📖 词源故事：用1~2句话讲历史典故或来源趣事，50字以内。",\n    ""\n  ]\n}\n\n(这是词源模式的专属提示词，基于 etymonline.com 真实数据。注意：部分 API 并不支持联网搜索功能)',
          custom: ""
      };

      const defaultGlobalJson = `请严格分析单词，仅返回纯JSON对象。\n【警告】必须用真实解析数据填充！\n{\n  "word": "String (当前查询的单词)",\n  "display_breakdown": "String (用点分隔音节，如 ex.e.cu.tion)",\n  "phonetic_us": "String (美式音标)",\n  "primary_meaning": "String (最常用的一个中文意思)",\n  "noun_source": "String (基础来源名词，格式：英文 (中文))",\n  "parts": [\n    {\n      "segment": "String (词根/前缀/后缀)",\n      "type": "String (词根/前缀/后缀)",\n      "meaning": "String (中文含义)",\n      "deep_origin": "String (该词根的历史渊源，必须结合你的专业角色来生动讲述！内部严禁使用双引号，请用单引号代替)",\n      "derivatives": ["String (同根词)"]\n    }\n  ],\n  "memory_lines": ["String (必须结合 {CONTEXT} 生成一条极度硬核、有强烈画面感的记忆联想，内部严禁使用双引号)"]\n}`;

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

      // 表单回显初始化
      if(document.getElementById('theme')) document.getElementById('theme').value = res.ui_theme || 'system';
      if(tempSlider) { tempSlider.value = window.appConfig.temperature !== undefined ? window.appConfig.temperature : 0.2; tempVal.textContent = tempSlider.value; }
      
      if(document.getElementById('auto-parse')) document.getElementById('auto-parse').checked = window.appConfig.autoParse === true;
      if(document.getElementById('enable-content-script')) document.getElementById('enable-content-script').checked = window.appConfig.enableContentScript !== false;
      if(document.getElementById('history-limit')) document.getElementById('history-limit').value = window.appConfig.historyLimit || '10';
      if(document.getElementById('data-fallback-rule')) document.getElementById('data-fallback-rule').value = window.appConfig.dataFallbackRule || 'cross';
      if(document.getElementById('context-fallback-rule')) document.getElementById('context-fallback-rule').checked = window.appConfig.contextFallbackRule !== false;
      
      if(document.getElementById('data-action-context')) document.getElementById('data-action-context').checked = window.appConfig.dataActionContext === true;
      if(document.getElementById('import-mode')) document.getElementById('import-mode').checked = window.appConfig.importMode === true;

      if(document.getElementById('api-base')) document.getElementById('api-base').value = window.appConfig.apiBase || '';
      if(document.getElementById('api-key')) document.getElementById('api-key').value = window.appConfig.apiKey || '';
      if(document.getElementById('api-model')) document.getElementById('api-model').value = window.appConfig.model || '';
      if(document.getElementById('ollama-base')) document.getElementById('ollama-base').value = window.appConfig.ollamaBase || 'http://127.0.0.1:11434';
      if(window.appConfig.ollamaModel && document.getElementById('ollama-model-select')) document.getElementById('ollama-model-select').innerHTML = `<option value="${window.appConfig.ollamaModel}">${window.appConfig.ollamaModel}</option>`;
      if(document.getElementById('offline-source')) document.getElementById('offline-source').value = window.appConfig.offlineSource || 'remote';
      if(rootToggleSwitch) rootToggleSwitch.checked = (window.appConfig.rootStrategy || 'keep_old') === 'keep_old';

      // 回显 API 协议选择
      const apiProtocolSel = document.getElementById('api-protocol');
      if (apiProtocolSel) {
          apiProtocolSel.value = window.appConfig.apiProtocol || 'openai';
          updateApiProtocolUI(apiProtocolSel.value);
          apiProtocolSel.addEventListener('change', () => {
              updateApiProtocolUI(apiProtocolSel.value);
              window.autoSaveConfig();
          });
      }

      if (typeof updateLabels === 'function') updateLabels();

      if (typeof window.initContextManager === 'function') {
          window.initContextManager(initialPrompts, defaultGlobalJson);
      }
      if (typeof window.initDataEngine === 'function') {
          window.initDataEngine();
      }
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

    window.autoSaveConfig = function() {
        const selectedEngineTab = document.querySelector('.engine-tab.active');
        const engine = selectedEngineTab ? selectedEngineTab.dataset.engine : 'custom';
        const curCtx = document.getElementById('prompt-context').value;
        const customNameInput = document.getElementById('custom-context-input');
        const apiProtocol = document.getElementById('api-protocol') ? document.getElementById('api-protocol').value : 'openai';
        const apiModel = document.getElementById('api-model') ? document.getElementById('api-model').value.trim() : '';

        // 保存各协议对应的模型
        const protocolModels = window.appConfig.protocolModels || {};
        if (apiModel) protocolModels[apiProtocol] = apiModel;

        if (curCtx === 'custom' && customNameInput && customNameInput.value.trim()) {
            const customCtxObj = window.appConfig.contexts.find(c => c.id === 'custom');
            if (customCtxObj) {
                customCtxObj.name = `✍️ ${customNameInput.value.trim()}`;
            }
        }

        const mergedConfig = {
            ...window.appConfig,
            engine: engine, 
            apiProtocol: apiProtocol,
            apiBase: document.getElementById('api-base') ? document.getElementById('api-base').value.trim() : '',
            apiKey: document.getElementById('api-key') ? document.getElementById('api-key').value.trim() : '',
            model: apiModel, 
            protocolModels: protocolModels, // 记录协议对应的模型
            ollamaBase: document.getElementById('ollama-base') ? document.getElementById('ollama-base').value.trim() : '',
            ollamaModel: document.getElementById('ollama-model-select') ? document.getElementById('ollama-model-select').value : '', 
            promptContext: curCtx,
            autoParse: document.getElementById('auto-parse') ? document.getElementById('auto-parse').checked : true, 
            enableContentScript: document.getElementById('enable-content-script') ? document.getElementById('enable-content-script').checked : true,
            historyLimit: document.getElementById('history-limit') ? document.getElementById('history-limit').value : 10, 
            dataFallbackRule: document.getElementById('data-fallback-rule') ? document.getElementById('data-fallback-rule').value : 'cross', 
            contextFallbackRule: document.getElementById('context-fallback-rule') ? document.getElementById('context-fallback-rule').checked : true,
            offlineSource: document.getElementById('offline-source') ? document.getElementById('offline-source').value : 'remote', 
            rootStrategy: document.getElementById('root-toggle-switch') && document.getElementById('root-toggle-switch').checked ? 'keep_old' : 'force_new',
            dataActionContext: document.getElementById('data-action-context') ? document.getElementById('data-action-context').checked : false,
            importMode: document.getElementById('import-mode') ? document.getElementById('import-mode').checked : false,
            ui_theme: document.getElementById('theme') ? document.getElementById('theme').value : 'system'
        };

        chrome.storage.local.set({ app_config: mergedConfig, ui_theme: mergedConfig.ui_theme }, () => {
            window.showStatus('⚡ 设置已实时同步', '#38bdf8');
            const contextSelect = document.getElementById('prompt-context');
            if (contextSelect) {
                const customOpt = Array.from(contextSelect.options).find(opt => opt.value === 'custom');
                const customCtxObj = mergedConfig.contexts.find(c => c.id === 'custom');
                if (customOpt && customCtxObj) {
                    customOpt.textContent = customCtxObj.name;
                }
            }
        });
    };

    document.querySelectorAll('.engine-tab').forEach(tab => {
        tab.addEventListener('click', () => setTimeout(window.autoSaveConfig, 100));
    });

    ['api-protocol', 'api-base', 'api-key', 'api-model', 'ollama-base', 'ollama-model-select', 'custom-context-input'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('blur', window.autoSaveConfig);
    });

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
            contextFallbackLabel.textContent = contextFallbackToggle.checked ? "情景共用模式：开启" : "共用模式：不共用";
            contextFallbackLabel.style.color = contextFallbackToggle.checked ? "#bae6fd" : "#f59e0b";
            if(hints.contextFallback) hints.contextFallback.textContent = contextFallbackToggle.checked ? "允许不同角色间共用缓存数据" : "严格隔离不同角色的解析记录";
        }
        if(rootStrategyToggle && rootStrategyLabel) {
            rootStrategyLabel.textContent = rootStrategyToggle.checked ? "护根模式：开启" : "护根模式：关闭";
            rootStrategyLabel.style.color = rootStrategyToggle.checked ? "#d1d5db" : "#ef4444";
            if(hints.rootStrategy) hints.rootStrategy.textContent = rootStrategyToggle.checked ? "优先保留手动修改过的词源故事" : "词根故事将由 AI 重新生成";
        }
    }

    [ctxToggle, modeToggle, contentToggle, autoToggle, contextFallbackToggle, rootStrategyToggle].forEach(el => {
        if(el) el.addEventListener('change', () => { updateLabels(); window.autoSaveConfig(); });
    });
    
    ['theme', 'data-fallback-rule', 'offline-source', 'history-limit', 'prompt-context'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', window.autoSaveConfig);
    });

    updateLabels();
});