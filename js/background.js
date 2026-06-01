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

// 通知 options 页面把新数据同步进 IndexedDB 并刷新列表
function notifyOptionsPage(keys) {
    chrome.tabs.query({ url: chrome.runtime.getURL('options.html') + '*' }, (tabs) => {
        if (!tabs || tabs.length === 0) return;
        chrome.storage.local.get(keys, (freshData) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'syncNewDataToDb',
                    data: freshData
                }).catch(() => {});
            });
        });
    });
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
    const isPyramid = request.isPyramid || false;

    chrome.storage.local.get(["app_config"], (res) => {
      const config = res.app_config || {};
      const engine = config.engine || 'custom';
      
      const context = request.context || config.promptContext || 'general'; 
      const sourceTag = engine; 

      if (engine === 'custom' && (!config.apiKey || !config.apiBase)) { sendResponse({ success: false, error: "未配置 API Key。" }); return; }
      if (engine === 'ollama' && (!config.ollamaBase || !config.ollamaModel)) { sendResponse({ success: false, error: "未配置 Ollama 接口。" }); return; }

      if (isPyramid) {
          if (forceRefresh) {
              fetchFromLLM(word, config, sourceTag, context, sendResponse, isPyramid);
          } else {
              const rootKey = "R:" + word;
              chrome.storage.local.get([rootKey], (rootRes) => {
                  if (rootRes[rootKey] && rootRes[rootKey].deep_origin) {
                      sendResponse({ success: true, data: rootRes[rootKey], cached: true });
                  } else {
                      if (engine === 'local_only') {
                          if (rootRes[rootKey]) sendResponse({ success: true, data: rootRes[rootKey], cached: true });
                          else sendResponse({ success: false, error: "当前为断网模式，且本地词库无此数据。" });
                      } else {
                          fetchFromLLM(word, config, sourceTag, context, sendResponse, isPyramid);
                      }
                  }
              });
          }
      } else {
          StorageModule.getWord(word, engine, context, forceRefresh, (cachedData) => {
            if (cachedData) {
                sendResponse({ success: true, data: cachedData, cached: true });
            } else if (engine === 'local_only') {
                sendResponse({ success: false, error: "当前为断网模式，且本地词库无此数据。" });
            } else {
                fetchFromLLM(word, config, sourceTag, context, sendResponse, isPyramid);
            }
          });
      }
    });
    return true; 
  }
});

function fetchFromLLM(word, config, sourceTag, context, sendResponse, isPyramid = false) {
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
        let jsonTemplate;
        if (isPyramid && config.enablePyramidJson !== false) {
             jsonTemplate = config.pyramidJsonTemplate || `请严格分析词根，仅返回纯JSON对象。
【警告】必须用真实词根金字塔数据填充！
{
  "meaning": "核心词根含义，例如：系列，连续",
  "segment": ["ser", "seri", "sert"],
  "deep_origin": "用最简短精炼的一句话(15字以内)概括该词根的核心意境或记忆口诀，例如：表示'系列，连续'",
  "derivatives": ["serial", "series", "insert", "desert"]
}`;
        } else {
             jsonTemplate = config.globalJsonTemplate || `请严格分析单词，仅返回纯JSON对象。
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
        }
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
            // 智能构建 API 地址：如果用户已经写了完整路径，则不再追加
            let API_URL = config.apiBase.trim();
            if (!API_URL.includes('/chat/completions') && !API_URL.includes('/messages')) {
                API_URL = API_URL.replace(/\/?$/, '') + '/chat/completions';
            }
            
            const needsWebSearch = systemPrompt.includes('web_search') || systemPrompt.includes('site:');
            
            // 检查当前 API 是否已被标记为不支持某些参数
            const unsupportedToolsMap = config.unsupportedToolsMap || {};
            const isToolUnsupported = unsupportedToolsMap[config.apiBase] === true;
            const unsupportedParamsMap = config.unsupportedParamsMap || {};
            const isTempUnsupported = unsupportedParamsMap[config.apiBase + ':temp'] === true;
            const isJsonFmtUnsupportedWithSearch = unsupportedParamsMap[config.apiBase + ':json_with_search'] === true;

            const makeRequest = (includeTools, includeTemp, includeJsonFmt) => {
                const requestBody = {
                    model: config.model || "gpt-4o",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: `请解析单词：${word}` }
                    ]
                };
                
                if (includeJsonFmt) {
                    requestBody.response_format = { type: "json_object" };
                }

                if (includeTemp) {
                    requestBody.temperature = temperature;
                }
                
                // 仅在需要联网且未被标记为不支持时尝试添加联网参数
                if (includeTools) {
                    requestBody.tools = [{ type: "web_search_preview" }];
                    requestBody.web_search_options = {}; 
                }

                return fetch(API_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
                    body: JSON.stringify(requestBody)
                });
            };

            // 智能决定初始请求参数
            const shouldTryTools = needsWebSearch && !isToolUnsupported;
            const shouldTryTemp = !isTempUnsupported;
            const shouldTryJsonFmt = !(shouldTryTools && isJsonFmtUnsupportedWithSearch);
            
            fetchPromise = makeRequest(shouldTryTools, shouldTryTemp, shouldTryJsonFmt).then(async res => {
                let rawText = await res.text();
                
                if (!res.ok) {
                    let needsRetry = false;
                    let nextTryTools = shouldTryTools;
                    let nextTryTemp = shouldTryTemp;
                    let nextTryJsonFmt = shouldTryJsonFmt;

                    // 1. 检测是否是不支持联网参数
                    if (shouldTryTools && (
                        rawText.includes('tools') || 
                        rawText.includes('web_search_preview') || 
                        rawText.includes('web_search_options') ||
                        rawText.includes('Unsupported value')
                    )) {
                        console.warn("当前 API 不支持联网参数，正在降级重试...");
                        nextTryTools = false;
                        needsRetry = true;

                        chrome.storage.local.get(['app_config'], (currentRes) => {
                            const updatedConfig = currentRes.app_config || {};
                            updatedConfig.unsupportedToolsMap = { ...(updatedConfig.unsupportedToolsMap || {}), [config.apiBase]: true };
                            chrome.storage.local.set({ app_config: updatedConfig });
                        });
                    }

                    // 2. 检测是否是不支持 temperature 参数
                    if (shouldTryTemp && (rawText.includes('temperature') || rawText.includes('incompatible request argument'))) {
                        console.warn("当前模型不支持 temperature 参数，正在移除重试...");
                        nextTryTemp = false;
                        needsRetry = true;

                        chrome.storage.local.get(['app_config'], (currentRes) => {
                            const updatedConfig = currentRes.app_config || {};
                            const pMap = updatedConfig.unsupportedParamsMap || {};
                            pMap[config.apiBase + ':temp'] = true;
                            updatedConfig.unsupportedParamsMap = pMap;
                            chrome.storage.local.set({ app_config: updatedConfig });
                        });
                    }

                    // 3. 检测是否是 JSON 格式与联网功能冲突
                    if (shouldTryTools && shouldTryJsonFmt && rawText.includes('json_object') && (rawText.includes('supported with web_search') || rawText.includes('conflict'))) {
                        console.warn("当前 API 不支持 JSON 格式与联网功能同时开启，正在降级重试...");
                        nextTryJsonFmt = false;
                        needsRetry = true;

                        chrome.storage.local.get(['app_config'], (currentRes) => {
                            const updatedConfig = currentRes.app_config || {};
                            const pMap = updatedConfig.unsupportedParamsMap || {};
                            pMap[config.apiBase + ':json_with_search'] = true;
                            updatedConfig.unsupportedParamsMap = pMap;
                            chrome.storage.local.set({ app_config: updatedConfig });
                        });
                    }

                    if (needsRetry) {
                        const retryRes = await makeRequest(nextTryTools, nextTryTemp, nextTryJsonFmt);
                        rawText = await retryRes.text();
                        if (!retryRes.ok) throw new Error(`OpenAI API 拒绝 (重试): ${retryRes.status} ${rawText.slice(0, 200)}`);
                    } else {
                        throw new Error(`OpenAI API 拒绝: ${res.status} ${rawText.slice(0, 200)}`);
                    }
                }

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
              // 预处理：把 AI 用单引号包裹的字符串值转换为双引号
              let fixedText = text.replace(/("[\w_]+":\s*)'([\s\S]*?)'/g, (match, key, val) => {
                  const escaped = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
                  return key + '"' + escaped + '"';
              });
              parsedData = JSON.parse(repairJson(fixedText));
          } catch (e2) {
              console.error("AI 响应 JSON 解析失败。原始文本：", text);
              throw e;
          }
      }
      
      chrome.storage.local.get(null, (allData) => {
          let toSave = {};
          const rootStrategy = config.rootStrategy || 'keep_old'; 

          if (isPyramid) {
              const cleanRoot = (word || '').toLowerCase().replace(/^-|-$/g, '').trim();
              const rootKey = "R:" + cleanRoot;
              
              // 处理 segment：支持数组和字符串两种格式
              let segmentRaw = parsedData.segment;
              if (Array.isArray(segmentRaw)) {
                  parsedData.segment = segmentRaw.map(s => (s || '').toLowerCase().replace(/^-|-$/g, '').trim()).filter(Boolean);
              } else if (typeof segmentRaw === 'string') {
                  // 兼容旧的逗号分隔字符串格式 → 转为数组
                  parsedData.segment = segmentRaw.split(/[,，、\s]+/).map(s => s.toLowerCase().replace(/^-|-$/g, '').trim()).filter(s => /^[a-z]+$/.test(s));
              }
              if (!parsedData.segment || parsedData.segment.length === 0) {
                  parsedData.segment = [cleanRoot];
              }

              // 处理 derivatives：纯字符串数组
              let rawDerivs = parsedData.derivatives;
              if (typeof rawDerivs === 'string') rawDerivs = rawDerivs.split(',');
              const derivsArray = Array.isArray(rawDerivs) ? rawDerivs : [];
              const cleanDerivatives = derivsArray.map(d => {
                  let str = typeof d === 'string' ? d : d.word;
                  return (str || '').replace(/（[^）]*）|\([^)]*\)/g, '').toLowerCase().trim();
              }).filter(Boolean);

              let rootData = allData[rootKey] || {};
              parsedData.lookup_count = rootData.lookup_count || 0;
              parsedData.updated_at = Date.now();
              parsedData.derivatives = [...new Set(cleanDerivatives)];
              parsedData.type = "根";

              toSave[rootKey] = parsedData;

              safeStorageSet(toSave, (hasError) => {
                  if (hasError) {
                      sendResponse({ success: false, error: '本地存储空间不足。' });
                      return;
                  }
                  notifyOptionsPage(Object.keys(toSave));
                  sendResponse({ success: true, data: parsedData, cached: false });
              });
              return;
          }


          let partsArray = Array.isArray(parsedData.parts) ? parsedData.parts : [];
          partsArray.forEach(p => {
              const cleanRoot = (p.segment || '').toLowerCase().replace(/^-|-$/g, '').trim();
              if (!cleanRoot) return;
              const rootKey = "R:" + cleanRoot;
              
              let rawDerivs = p.derivatives;
              if (typeof rawDerivs === 'string') rawDerivs = rawDerivs.split(',');
              const derivsArray = Array.isArray(rawDerivs) ? rawDerivs : [];
              const cleanDerivatives = derivsArray.map(d => {
                  let str = typeof d === 'string' ? d : d.word;
                  return (str || '').replace(/（[^）]*）|\([^)]*\)/g, '').toLowerCase().trim();
              }).filter(Boolean);
              
              const existingRoot = allData[rootKey] || {};
              p.lookup_count = existingRoot.lookup_count || 0;
              p.updated_at = existingRoot.updated_at || Date.now();

              if (allData[rootKey] && rootStrategy === 'keep_old') {
                  p.meaning = allData[rootKey].meaning || p.meaning; 
                  p.deep_origin = allData[rootKey].deep_origin || p.deep_origin; 
                  let oldRawDerivs = allData[rootKey].derivatives;
                  if (typeof oldRawDerivs === 'string') oldRawDerivs = oldRawDerivs.split(',');
                  const oldDerivsArray = Array.isArray(oldRawDerivs) ? oldRawDerivs : [];
                  const oldDerivs = oldDerivsArray.map(d => {
                      let str = typeof d === 'string' ? d : d.word;
                      return (str || '').replace(/（[^）]*）|\([^)]*\)/g, '').toLowerCase().trim();
                  });
                  p.derivatives = [...new Set([...oldDerivs, ...cleanDerivatives])];
                  toSave[rootKey] = p; 
              } else {
                  p.derivatives = [...new Set(cleanDerivatives)];
                  toSave[rootKey] = p;
              }
          });

          const cleanWordKey = "W:" + word; 
          let wordData = allData[cleanWordKey] ? JSON.parse(JSON.stringify(allData[cleanWordKey])) : {};
          if (!wordData.memory_lines_map) wordData.memory_lines_map = {};
          
          const newMapKey = `${sourceTag}_${context}`;
          const editedKeys = wordData.edited_keys || [];
          // 强制保存，不管是否被编辑过
          const memLines = parsedData.memory_lines;
          wordData.memory_lines_map[newMapKey] = Array.isArray(memLines) ? memLines : (memLines ? [memLines] : []);
          
          wordData.display_breakdown = parsedData.display_breakdown || wordData.display_breakdown || '';
          wordData.phonetic_us = parsedData.phonetic_us || wordData.phonetic_us || '';
          wordData.primary_meaning = parsedData.primary_meaning || wordData.primary_meaning || '';
          wordData.noun_source = parsedData.noun_source || wordData.noun_source || '';
          wordData.word = parsedData.word || word;
          wordData.parts = parsedData.parts || wordData.parts || [];
          
          wordData.lookup_count = (allData[cleanWordKey]?.lookup_count || 0);
          wordData.updated_at = Date.now();

          toSave[cleanWordKey] = wordData;
          console.log('[词根引擎] 即将入库:', cleanWordKey, '已有词根条目:', Object.keys(toSave).filter(k => k.startsWith('R:')).length);
          
          safeStorageSet(toSave, (hasError) => {
              if (hasError) {
                  sendResponse({ success: false, error: '本地存储空间不足 (QuotaBytes exceeded)，数据未能缓存。请到设置页面导出并清理旧数据。' });
                  return;
              }
              notifyOptionsPage(Object.keys(toSave));
              let resData = JSON.parse(JSON.stringify(wordData));
              resData.memory_lines = wordData.memory_lines_map[`${sourceTag}_${context}`];
              resData.sourceTag = sourceTag;
              sendResponse({ success: true, data: resData, cached: false });
          });
      });
    }).catch(err => sendResponse({ success: false, error: err.message }));
}