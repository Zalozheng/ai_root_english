// ===== 安全批量写入（service worker 版，无 window）=====
function safeStorageSet(items, callback, batchSize = 50) {
    const keys = Object.keys(items);
    if (keys.length === 0) { if (callback) callback(false); return; }
    let index = 0;
    let hasError = false;
    function writeNextBatch() {
        if (index >= keys.length) { if (callback) callback(hasError); return; }
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
}

function updateOllamaCorsRule(ollamaUrl) {
  try {
    const url = new URL(ollamaUrl || 'http://127.0.0.1:11434');
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [{
        id: 1, priority: 1,
        action: { type: "modifyHeaders", requestHeaders: [ { header: "Origin", operation: "remove" }, { header: "Sec-Fetch-Site", operation: "remove" } ] },
        condition: { urlFilter: `*://${url.host}/*`, resourceTypes: ["xmlhttprequest"] }
      }]
    });
  } catch(e) {}
}

chrome.storage.local.get(['app_config'], (res) => { updateOllamaCorsRule((res.app_config || {}).ollamaBase); });
chrome.storage.onChanged.addListener((changes) => { if (changes.app_config) updateOllamaCorsRule(changes.app_config.newValue.ollamaBase); });

const StorageModule = {
  getWord: (word, engineMode, context, forceRefresh, callback) => {
    if (forceRefresh) return callback(null); 
    const cleanWord = word.toLowerCase().trim(); 

    chrome.storage.local.get(["W:" + cleanWord, "app_config"], (res) => {
      const data = res["W:" + cleanWord];
      const config = res.app_config || {};
      if (!data || !data.memory_lines_map) return callback(null);

      const rule = config.dataFallbackRule || 'cross';
      let actualEngine = engineMode === 'local_only' ? (config.offlineSource || 'remote') : engineMode;
      const targetKey = `${actualEngine}_${context}`; 
      const altKey = actualEngine === 'remote' ? `ollama_${context}` : `remote_${context}`;

      let matchedLines = null;
      let matchedSourceTag = actualEngine;

      if (rule === 'strict') {
          matchedLines = data.memory_lines_map[targetKey];
      } else if (rule === 'cross') {
          if (data.memory_lines_map[targetKey]) { matchedLines = data.memory_lines_map[targetKey]; } 
          else if (data.memory_lines_map[altKey]) { matchedLines = data.memory_lines_map[altKey]; matchedSourceTag = actualEngine === 'remote' ? 'ollama' : 'remote'; }
      } else if (rule === 'remote_first') {
          if (data.memory_lines_map[`remote_${context}`]) { matchedLines = data.memory_lines_map[`remote_${context}`]; matchedSourceTag = 'remote'; }
          else if (data.memory_lines_map[`ollama_${context}`]) { matchedLines = data.memory_lines_map[`ollama_${context}`]; matchedSourceTag = 'ollama'; }
      } else if (rule === 'ollama_first') {
          if (data.memory_lines_map[`ollama_${context}`]) { matchedLines = data.memory_lines_map[`ollama_${context}`]; matchedSourceTag = 'ollama'; }
          else if (data.memory_lines_map[`remote_${context}`]) { matchedLines = data.memory_lines_map[`remote_${context}`]; matchedSourceTag = 'remote'; }
      }

      if (matchedLines) {
        let result = JSON.parse(JSON.stringify(data));
        result.memory_lines = matchedLines;
        result.sourceTag = matchedSourceTag;
        return callback(result);
      }

      // 【新增】跨情景借用逻辑：如果当前情景没数据，且允许借用，则搜索其他情景
      if (config.contextFallbackRule !== false) {
          const allMapKeys = Object.keys(data.memory_lines_map);
          // 优先找当前引擎在其他情景下的记录
          let fallbackKey = allMapKeys.find(k => k.startsWith(actualEngine + '_'));
          // 如果还是没有，找任何引擎的任何情景
          if (!fallbackKey) fallbackKey = allMapKeys[0];

          if (fallbackKey) {
              let result = JSON.parse(JSON.stringify(data));
              result.memory_lines = data.memory_lines_map[fallbackKey];
              // 标记来源，让用户知道这是借来的
              result.sourceTag = fallbackKey.split('_')[0]; 
              return callback(result);
          }
      }

      callback(null);
    });
  }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchLLM") {
    const word = request.word.replace(/（[^）]*）|\([^)]*\)/g, '').toLowerCase().trim(); 
    const forceRefresh = request.forceRefresh || false; 

    chrome.storage.local.get(["app_config"], (res) => {
      const config = res.app_config || {};
      const engine = config.engine || 'custom';
      
      // 【核心修复2】：完美接管右上角弹窗传来的 context 请求，不再强制锁定设置页的上下文
      const context = request.context || config.promptContext || 'general'; 
      const sourceTag = engine; 

      if (engine === 'custom' && (!config.apiKey || !config.apiBase)) { sendResponse({ success: false, error: "未配置 API Key。" }); return; }
      if (engine === 'ollama' && (!config.ollamaBase || !config.ollamaModel)) { sendResponse({ success: false, error: "未配置 Ollama 接口。" }); return; }

      StorageModule.getWord(word, engine, context, forceRefresh, (cachedData) => {
        if (cachedData) sendResponse({ success: true, data: cachedData, cached: true });
        else if (engine === 'local_only') sendResponse({ success: false, error: "当前为断网模式，且本地词库无此数据。" });
        else fetchFromLLM(word, config, sourceTag, context, sendResponse);
      });
    });
    return true; 
  }
});

function fetchFromLLM(word, config, sourceTag, context, sendResponse) {
    let roleInjection = "你是一个深谙“唯名词论”的日常英语词汇专家。";
    let contextInstruction = "极其常见的生活、购物、交流场景";
    
    if (context === 'civ6') {
        roleInjection = "你是一个《文明6》(Civilization VI) 的资深游戏策划兼历史学家。";
        contextInstruction = "游戏中的科技树、尤里卡触发、世界奇观建设、政策卡组合、时代得分或兵种克制等核心游戏机制";
    } else if (context === 'linux_ai') {
        roleInjection = "你是一个极其硬核的 Linux 内核开发者兼 AI (CUDA/Ollama) 架构师。";
        contextInstruction = "Linux终端命令、C++底层内存管理、GPU显存分配、深度学习模型架构、或者极客黑客的计算机底层逻辑";
    } else if (context === 'custom') {
        contextInstruction = `【${config.customContext || '自定义'}】的专属情景`;
    }

    let userPrompt = "";
    if (config.prompts && config.prompts[context]) {
        userPrompt = config.prompts[context];
    } else if (config.baseTemplate) {
        userPrompt = config.baseTemplate;
    } else if (config.customPrompt) {
        userPrompt = config.customPrompt;
    }

    let systemPrompt = userPrompt;

    // 兜底机制：防撞墙与强制 JSON 格式注入（保留你的 {CONTEXT} 设计！）
    if (!systemPrompt || systemPrompt.includes("系统内置的文字") || (!systemPrompt.includes("display_breakdown") && !systemPrompt.includes("primary_meaning"))) {
        
        let baseRole = systemPrompt;
        // 如果连一点角色设定都没写，才给他塞默认的人设
        if (!systemPrompt || systemPrompt.includes("系统内置的文字")) {
            baseRole = roleInjection;
        }

        // 获取 options.js 保存到本地的全局 JSON 模板，如果没有则使用默认回退文本
        const jsonTemplate = config.globalJsonTemplate || `请严格分析单词，仅返回纯JSON对象。
【警告】必须用真实解析数据填充！
{
  "word": "String (当前查询的单词)",
  "display_breakdown": "String (用点分隔音节，如 ex.e.cu.tion)",
  "phonetic_us": "String (美式音标)",
  "primary_meaning": "String (最常用的一个中文意思)",
  "noun_source": "String (基础来源名词，格式：英文 (中文))",
  "parts": [
    {
      "segment": "String (词根/前缀/后缀)",
      "type": "String (词根/前缀/后缀)",
      "meaning": "String (中文含义)",
      "deep_origin": "String (该词根的历史渊源，必须结合你的专业角色来生动讲述！)",
      "derivatives": ["String (同根词)"]
    }
  ],
  "memory_lines": ["String (必须结合 {CONTEXT} 生成一条极度硬核、有强烈画面感的记忆联想)"]
}`;
        
        // 自动注入动态的 JSON 结构，并埋好你原本的 {CONTEXT} 变量
        systemPrompt = `${baseRole}\n${jsonTemplate}`;
    }

    // 【核心修复1】：原汁原味还原你的正则替换注入魔法！
    systemPrompt = systemPrompt.replace(/{CONTEXT}/g, contextInstruction);

    const temperature = config.temperature !== undefined ? parseFloat(config.temperature) : 0.2;
    let fetchPromise;

    if (config.engine === 'ollama') {
        let API_URL = config.ollamaBase.replace(/\/?$/, '') + '/v1/chat/completions';
        fetchPromise = fetch(API_URL, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: config.ollamaModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `请解析单词：${word}` }], temperature: temperature, response_format: { type: "json_object" } })
        }).then(async res => {
            const rawText = await res.text(); if (!res.ok) throw new Error(`Ollama拒绝: ${res.status}`);
            try { const data = JSON.parse(rawText); if (data.error) throw new Error(data.error.message); return data.choices[0].message.content; } 
            catch (e) { throw new Error("Ollama JSON解析失败"); }
        });
    } else {
        let API_URL = config.apiBase.replace(/\/?$/, '') + '/chat/completions';
        fetchPromise = fetch(API_URL, {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
            body: JSON.stringify({ model: config.model || "gpt-4o", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `请解析单词：${word}` }], temperature: temperature, response_format: { type: "json_object" } })
        }).then(res => res.json()).then(data => { if (data.error) throw new Error(data.error.message); return data.choices[0].message.content; });
    }

    fetchPromise.then(text => {
      text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsedData = JSON.parse(text);
      
      chrome.storage.local.get(null, (allData) => {
          let toSave = {};
          const rootStrategy = config.rootStrategy || 'keep_old'; 

          (parsedData.parts || []).forEach(p => {
              const cleanRoot = p.segment.toLowerCase().replace(/^-|-$/g, '').trim();
              const rootKey = "R:" + cleanRoot;
              const cleanDerivatives = (p.derivatives || []).map(d => d.replace(/（[^）]*）|\([^)]*\)/g, '').toLowerCase().trim()).filter(Boolean);
              
              const existingRoot = allData[rootKey] || {};
              p.lookup_count = existingRoot.lookup_count || 0;
              p.updated_at = existingRoot.updated_at || Date.now();

              if (allData[rootKey] && rootStrategy === 'keep_old') {
                  p.meaning = allData[rootKey].meaning; 
                  p.deep_origin = allData[rootKey].deep_origin; 
                  const oldDerivs = (allData[rootKey].derivatives || []).map(d => d.replace(/（[^）]*）|\([^)]*\)/g, '').toLowerCase().trim());
                  p.derivatives = [...new Set([...oldDerivs, ...cleanDerivatives])];
                  toSave[rootKey] = p; 
              } else {
                  p.derivatives = [...new Set(cleanDerivatives)];
                  toSave[rootKey] = p;
              }
          });

          const cleanWordKey = "W:" + word; 
          let wordData = allData[cleanWordKey] || parsedData;
          if (!wordData.memory_lines_map) wordData.memory_lines_map = {};
          
          const newMapKey = `${sourceTag}_${context}`;
          const editedKeys = wordData.edited_keys || [];
          if (!editedKeys.includes(newMapKey)) {
            wordData.memory_lines_map[newMapKey] = parsedData.memory_lines || [];
          }
          wordData.display_breakdown = parsedData.display_breakdown || wordData.display_breakdown;
          wordData.phonetic_us = parsedData.phonetic_us || wordData.phonetic_us;
          wordData.primary_meaning = parsedData.primary_meaning || wordData.primary_meaning;
          wordData.noun_source = parsedData.noun_source || wordData.noun_source;
          wordData.parts = parsedData.parts; 
          
          wordData.lookup_count = allData[cleanWordKey]?.lookup_count || 0;
          wordData.updated_at = allData[cleanWordKey]?.updated_at || Date.now();

          toSave[cleanWordKey] = wordData;
          
          // 使用安全分批写入，避免一次性写入超出配额
          safeStorageSet(toSave, (hasError) => {
              if (hasError) {
                  sendResponse({ success: false, error: '本地存储空间不足 (QuotaBytes exceeded)，数据未能缓存。请到设置页面导出并清理旧数据。' });
                  return;
              }
              let resData = JSON.parse(JSON.stringify(wordData));
              resData.memory_lines = wordData.memory_lines_map[`${sourceTag}_${context}`];
              resData.sourceTag = sourceTag;
              sendResponse({ success: true, data: resData, cached: false });
          });
      });
    }).catch(err => sendResponse({ success: false, error: err.message }));
}