function createIconImageData(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = size / 2;
  ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(r, size * 0.75); ctx.lineTo(r, size * 0.45); ctx.lineTo(size * 0.25, size * 0.25); ctx.moveTo(r, size * 0.45); ctx.lineTo(size * 0.75, size * 0.25); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(r, size * 0.45, size*0.12, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(size * 0.25, size * 0.25, size*0.12, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(size * 0.75, size * 0.25, size*0.12, 0, Math.PI*2); ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

chrome.runtime.onInstalled.addListener(() => {
  try { chrome.action.setIcon({ imageData: { '16': createIconImageData(16), '48': createIconImageData(48), '128': createIconImageData(128) } }); } catch (e) {}
});

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
          
          wordData.memory_lines_map[`${sourceTag}_${context}`] = parsedData.memory_lines || [];
          wordData.display_breakdown = parsedData.display_breakdown || wordData.display_breakdown;
          wordData.phonetic_us = parsedData.phonetic_us || wordData.phonetic_us;
          wordData.primary_meaning = parsedData.primary_meaning || wordData.primary_meaning;
          wordData.noun_source = parsedData.noun_source || wordData.noun_source;
          wordData.parts = parsedData.parts; 
          
          wordData.lookup_count = allData[cleanWordKey]?.lookup_count || 0;
          wordData.updated_at = allData[cleanWordKey]?.updated_at || Date.now();

          toSave[cleanWordKey] = wordData;
          
          chrome.storage.local.set(toSave, () => {
              let resData = JSON.parse(JSON.stringify(wordData));
              resData.memory_lines = wordData.memory_lines_map[`${sourceTag}_${context}`];
              resData.sourceTag = sourceTag;
              sendResponse({ success: true, data: resData, cached: false });
          });
      });
    }).catch(err => sendResponse({ success: false, error: err.message }));
}