import re

with open('js/background.js', 'r') as f:
    content = f.read()

# 1. Update the message listener for fetchLLM
old_listener = """    const forceRefresh = request.forceRefresh || false; 

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
    });"""

new_listener = """    const forceRefresh = request.forceRefresh || false; 
    const isPyramid = request.isPyramid || false;

    chrome.storage.local.get(["app_config"], (res) => {
      const config = res.app_config || {};
      const engine = config.engine || 'custom';
      
      const context = request.context || config.promptContext || 'general'; 
      const sourceTag = engine; 

      if (engine === 'custom' && (!config.apiKey || !config.apiBase)) { sendResponse({ success: false, error: "未配置 API Key。" }); return; }
      if (engine === 'ollama' && (!config.ollamaBase || !config.ollamaModel)) { sendResponse({ success: false, error: "未配置 Ollama 接口。" }); return; }

      const cacheKeyWord = isPyramid ? ("P:" + word) : word;

      StorageModule.getWord(cacheKeyWord, engine, context, forceRefresh, (cachedData) => {
        if (cachedData) {
            sendResponse({ success: true, data: cachedData, cached: true });
        } else if (isPyramid && !forceRefresh) {
            // Try fetching R:word if P:word doesn't exist
            StorageModule.getWord("R:" + word, engine, context, false, (rootData) => {
                if (rootData) sendResponse({ success: true, data: rootData, cached: true });
                else if (engine === 'local_only') sendResponse({ success: false, error: "当前为断网模式，且本地词库无此数据。" });
                else fetchFromLLM(word, config, sourceTag, context, sendResponse, isPyramid);
            });
        } else if (engine === 'local_only') {
            sendResponse({ success: false, error: "当前为断网模式，且本地词库无此数据。" });
        } else {
            fetchFromLLM(word, config, sourceTag, context, sendResponse, isPyramid);
        }
      });
    });"""
content = content.replace(old_listener, new_listener)

# 2. Update fetchFromLLM signature
content = content.replace("function fetchFromLLM(word, config, sourceTag, context, sendResponse) {", "function fetchFromLLM(word, config, sourceTag, context, sendResponse, isPyramid = false) {")

# 3. Update jsonTemplate in fetchFromLLM
old_template = """        const jsonTemplate = config.globalJsonTemplate || `请严格分析单词，仅返回纯JSON对象。
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
      "deep_origin": "String (该词根的历史渊源，必须结合你的专业角色来生动讲述！注意：内部严禁出现双引号，请用单引号或中文引号代替
)",
      "derivatives": ["String (同根词)"]
    }
  ],
  "memory_lines": ["String (必须结合 {CONTEXT} 生成一条极度硬核、有强烈画面感的记忆联想，内部严禁出现双引号，请用单引号或
中文引号代替)"]
}`;"""

new_template = """        let jsonTemplate = '';
        if (isPyramid) {
            jsonTemplate = config.pyramidJsonTemplate || `请生成词根金字塔数据，必须返回纯JSON对象：
{
  "meaning": "String (核心词根含义)",
  "segment": "String (根的变体分割，如 vis, vid)",
  "deep_origin": "String (详细词源故事)",
  "derivatives": [
    {"word": "String (派生词)", "meaning": "String (派生词含义)"}
  ]
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
      "deep_origin": "String (该词根的历史渊源，必须结合你的专业角色来生动讲述！注意：内部严禁出现双引号，请用单引号或中文引号代替
)",
      "derivatives": ["String (同根词)"]
    }
  ],
  "memory_lines": ["String (必须结合 {CONTEXT} 生成一条极度硬核、有强烈画面感的记忆联想，内部严禁出现双引号，请用单引号或
中文引号代替)"]
}`;
        }"""
content = content.replace(old_template, new_template)

# 4. Update the key when saving data back to cache.
old_save = """          const cleanWordKey = "W:" + word;
          let wordData = allData[cleanWordKey] || parsedData;
          if (!wordData.memory_lines_map) wordData.memory_lines_map = {};"""

new_save = """          const cleanWordKey = "W:" + (isPyramid ? ("P:" + word) : word);
          let wordData = allData[cleanWordKey] || parsedData;
          if (!wordData.memory_lines_map) wordData.memory_lines_map = {};"""
content = content.replace(old_save, new_save)

with open('js/background.js', 'w') as f:
    f.write(content)
