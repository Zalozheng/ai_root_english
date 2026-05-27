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

      if (config.contextFallbackRule !== false) {
          const allMapKeys = Object.keys(data.memory_lines_map);
          let fallbackKey = allMapKeys.find(k => k.startsWith(actualEngine + '_'));
          if (!fallbackKey) fallbackKey = allMapKeys[0];
          if (fallbackKey) {
              let result = JSON.parse(JSON.stringify(data));
              result.memory_lines = data.memory_lines_map[fallbackKey];
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
    let roleInjection = '你是一个深谙"唯名词论"的日常英语词汇专家。';
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

    if (!systemPrompt || systemPrompt.includes("系统内置的文字") || (!systemPrompt.includes("display_breakdown") && !systemPrompt.includes("primary_meaning"))) {
        let baseRole = systemPrompt;
        if (!systemPrompt || systemPrompt.includes("系统内置的文字")) {
            baseRole = roleInjection;
        }
        const jsonTemplate = config.globalJsonTemplate || `请严格分析单词，仅返回纯JSON对象。
【警告】必须用真实解析数据填充！
【JSON 格式规范】
1. 严禁在 JSON 字符串内部直接使用未转义的双引号 "。
2. 如需在描述中使用引号，请务必使用中文双引号 “ ” 或单引号 '。
3. 确保返回的是合法的标准 JSON。

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
      "deep_origin": "String (该词根的历史渊源，必须结合你的专业角色来生动讲述！注意：内部严禁出现双引号，请用单引号或中文引号代替)",
      "derivatives": ["String (同根词)"]
    }
  ],
  "memory_lines": ["String (必须结合 {CONTEXT} 生成一条极度硬核、有强烈画面感的记忆联想，内部严禁出现双引号，请用单引号或中文引号代替)"]
}`;
        systemPrompt = `${baseRole}\n${jsonTemplate}`;
    }

    if (config.apiProtocol === 'claude' || (config.apiBase && config.apiBase.includes('anthropic'))) {
        systemPrompt = systemPrompt
            .replace(/必须先用\s*web_search[^\n]*/g, '')
            .replace(/site:[^\n]*/g, '')
            .replace(/获取真实词源拆解后[^\n]*/g, '')
            .replace(/禁止凭记忆猜测词根[^\n]*/g, '')
            .trim();
    }

    systemPrompt = systemPrompt.replace(/{CONTEXT}/g, contextInstruction);

    const temperature = config.temperature !== undefined ? parseFloat(config.temperature) : 0.2;
    let fetchPromise;

    if (config.engine === 'ollama') {
        let API_URL = config.ollamaBase.replace(/\/?$/, '') + '/v1/chat/completions';
        fetchPromise = fetch(API_URL, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: config.ollamaModel, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `请解析单词：${word}` }], temperature: temperature, response_format: { type: "json_object" } })
        }).then(async res => {
            const rawText = await res.text();
            if (!res.ok) throw new Error(`Ollama拒绝: ${res.status}`);
            try { const data = JSON.parse(rawText); if (data.error) throw new Error(data.error.message); return data.choices[0].message.content; } 
            catch (e) { throw new Error("Ollama JSON解析失败"); }
        });
    } else {
        if (config.apiProtocol === 'claude' || (config.apiBase && config.apiBase.includes('anthropic'))) {
            let API_URL = config.apiBase.replace(/\/?$/, '') + '/v1/messages';
            fetchPromise = fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${config.apiKey}`,
                    "anthropic-version": "2023-06-01"
                },
                body: JSON.stringify({
                    model: config.model || "claude-opus-4-5",
                    max_tokens: 4096,
                    system: systemPrompt,
                    messages: [{ role: "user", content: `请解析单词：${word}` }]
                })
            }).then(async res => {
                const rawText = await res.text();
                if (!res.ok) throw new Error(`Claude API 拒绝: ${res.status} ${rawText.slice(0, 200)}`);
                try {
                    const data = JSON.parse(rawText);
                    if (data.error) throw new Error(data.error.message);
                    return data.content[0].text;
                } catch(e) { throw new Error("Claude 响应解析失败: " + e.message); }
            });
        } else {
            let API_URL = config.apiBase.replace(/\/?$/, '') + '/chat/completions';
            const needsWebSearch = systemPrompt.includes('web_search') || systemPrompt.includes('site:');
            const requestBody = {
                model: config.model || "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `请解析单词：${word}` }
                ],
                temperature: temperature,
                response_format: { type: "json_object" }
            };
            /* 
            if (needsWebSearch) {
                requestBody.tools = [{ type: "web_search_preview" }];
            }
            */
            fetchPromise = fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
                body: JSON.stringify(requestBody)
            }).then(async res => {
                const rawText = await res.text();
                if (!res.ok) throw new Error(`OpenAI API 拒绝: ${res.status} ${rawText.slice(0, 200)}`);
                try {
                    const data = JSON.parse(rawText);
                    if (data.error) throw new Error(data.error.message);
                    return data.choices[0].message.content;
                } catch(e) { throw new Error("OpenAI JSON解析失败: " + e.message); }
            });
        }
    }

    fetchPromise.then(text => {
      text = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      text = text.replace(/<[^>]+>/g, "").trim();
      if (!text.startsWith('{')) {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) text = jsonMatch[0];
      }
      // 综合修复 AI 返回的 JSON 字符串
      function repairJson(jsonStr) {
          // 1. 尝试修复未转义的双引号（处理键值对中的字符串值）
          jsonStr = jsonStr.replace(/("[\w_]+":\s*")([\s\S]*?)("(?=\s*[,}\n\r]))/g, (match, p1, p2, p3) => {
              if (p2.includes('": ')) return match; 
              const escaped = p2.replace(/\\"/g, '[[TEMP]]').replace(/"/g, '\\"').replace(/\[\[TEMP\]\]/g, '\\"');
              return p1 + escaped + p3;
          });
          // 2. 尝试修复未转义的双引号（处理数组中的字符串元素）
          jsonStr = jsonStr.replace(/(\[\s*)([\s\S]*?)(\s*\])/g, (match, p1, p2, p3) => {
              if (p2.includes('{') || p2.includes('": ')) return match; 
              const repairedElements = p2.replace(/("\s*)([\s\S]*?)("\s*(?=[,\]]|$))/g, (m, a1, a2, a3) => {
                   const escaped = a2.replace(/\\"/g, '[[TEMP]]').replace(/"/g, '\\"').replace(/\[\[TEMP\]\]/g, '\\"');
                   return a1 + escaped + a3;
              });
              return p1 + repairedElements + p3;
          });
          // 3. 修复非法换行符
          jsonStr = jsonStr.replace(/"((?:[^"\\]|\\.)*)"/gs, (match, inner) =>
              '"' + inner.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"'
          );
          // 4. 移除多余的逗号
          jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
          return jsonStr;
      }

      let parsedData;
      try {
          parsedData = JSON.parse(text);
      } catch (e) {
          try {
              parsedData = JSON.parse(repairJson(text));
          } catch (e2) {
              console.error("AI 响应 JSON 解析失败。原始文本：", text);
              throw e;
          }
      }
      
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