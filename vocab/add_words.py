import json
import os
import sys
import urllib.request
import urllib.error
import time

OPENAI_API_URL = "https://api.aaaaapi.com/v1/chat/completions"
API_KEY = "?"
MODEL_NAME = "glm-4"
DB_FILE = "/home/zalo/Downloads/all_upgraded.json"

PROMPT_TEMPLATE = """
你是一个精通英语词源和各类考试（如 PETS、考研、雅思等）的词汇专家。

【用户指令】：
{user_prompt}

【严格要求】：
1. 必须根据用户的指令挑选或生成合适的单词。
2. 将结果作为一个标准的 JSON 数组（Array）返回。
3. 数组中的每一个对象，必须完全遵守以下结构，不能缺少字段，也不要增加额外字段。
4. 纯 JSON 输出，绝对不要包含任何 Markdown 代码块（如 ```json）或多余的解释说明文字。

【JSON对象模板】：
[
  {{
    "word": "String (当前单词)",
    "display_breakdown": "String (用点分隔音节，如 ex.e.cu.tion)",
    "phonetic_us": "String (美式音标)",
    "primary_meaning": "String (最常用的一个中文意思)",
    "noun_source": "String (基础来源名词，格式：英文 (中文))",
    "parts": [
      {{
        "segment": "String (词根/前缀/后缀)",
        "type": "String (词根/前缀/后缀)",
        "meaning": "String (中文含义)",
        "deep_origin": "String (该词根的历史渊源，内部严禁使用双引号，请用单引号代替)",
        "derivatives": ["String (同根词)", "String (同根词)"]
      }}
    ],
    "memory_lines": [
      "1. 中文(`英文部件`) + 中文(`英文部件`) → **完整单词**(中文释义)。",
      "",
      "2. 💡 情景联想：请结合上面用户指令中的【特定情景（如电脑、购物等）】写一段有强烈画面感的记忆联想！",
      "",
      "3. 英文例句 (中文翻译)。",
      "",
      "4. 📖 词源故事：用一两句话讲历史典故。"
    ]
  }}
]
"""

def generate_words(user_prompt):
    prompt = PROMPT_TEMPLATE.format(user_prompt=user_prompt)
    
    data = {
        "model": MODEL_NAME,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.5,
        "stream": False
    }

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {API_KEY}'
    }

    print(f"正在向 AI 请求，指令: '{user_prompt}'\n这可能需要一会儿，请耐心等待...")
    req = urllib.request.Request(OPENAI_API_URL, json.dumps(data).encode('utf-8'), headers)
    
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode())
            content = result['choices'][0]['message']['content'].strip()
            
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
                
            return json.loads(content.strip())
    except Exception as e:
        print(f"AI 请求失败或返回的数据格式不合法: {e}")
        return None

def main():
    if len(sys.argv) < 2:
        print("使用方法: python3 add_words.py \"你的提示词要求\"")
        print("例如: python3 add_words.py \"给我生成10个PETS考试中关于电脑的新单词\"")
        sys.exit(1)
        
    user_prompt = " ".join(sys.argv[1:])
    
    # 1. 向 AI 请求生成数据
    new_words = generate_words(user_prompt)
    if not new_words or not isinstance(new_words, list):
        print("❌ 生成失败，AI 并没有返回合法的单词数组。您可以尝试减少生成的数量（如一次10-20个）重试。")
        sys.exit(1)
        
    print(f"✅ AI 成功生成了 {len(new_words)} 个单词！")
    
    # 2. 读取现有词库
    if os.path.exists(DB_FILE):
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            db_data = json.load(f)
    else:
        db_data = {}
        
    # 3. 补充关键数据库字段并合并数据
    current_time = int(time.time() * 1000)
    for word_obj in new_words:
        word_str = word_obj.get("word", "").strip().lower()
        if not word_str:
            continue
            
        key = f"W:{word_str}"
        word_obj["id"] = key
        word_obj["updated_at"] = current_time
        if "lookup_count" not in word_obj:
            word_obj["lookup_count"] = 0
            
        # 兼容处理 memory_lines -> memory_lines_map
        if "memory_lines" in word_obj:
            lines = word_obj.pop("memory_lines")
            word_obj["memory_lines_map"] = {
                "custom_general": lines
            }
            
        db_data[key] = word_obj
        print(f"   -> 已添加: {word_str}")
        
    # 4. 保存文件
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(db_data, f, ensure_ascii=False, indent=2)
        
    print(f"🎉 全部搞定！已成功将 {len(new_words)} 个新单词写入 {DB_FILE}")
    print("你可以直接去插件里重新导入最新的 JSON 词库了。")

if __name__ == '__main__':
    main()
