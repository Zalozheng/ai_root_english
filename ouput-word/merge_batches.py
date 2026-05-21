import json
import os

def merge_json_files(file_list, output_filename):
    combined_dict = {}

    for file_name in file_list:
        if not os.path.exists(file_name):
            print(f"⚠️ 跳过：找不到文件 {file_name}")
            continue
        
        print(f"正在合并: {file_name}")
        with open(file_name, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
                # 使用 update 方法将新字典合并到旧字典中
                combined_dict.update(data)
            except json.JSONDecodeError:
                print(f"❌ 错误：{file_name} 不是有效的 JSON 格式")

    # 将合并后的巨大字典写入新文件
    with open(output_filename, 'w', encoding='utf-8') as f:
        json.dump(combined_dict, f, ensure_ascii=False, indent=2)

    print(f"\n✨ 全部合并完成！")
    print(f"📂 最终文件: {output_filename}")
    print(f"📊 总共有 {len(combined_dict)} 个键值对")

if __name__ == "__main__":
    # 在这里列出你所有的批次文件名
    # 你可以按顺序写，比如 ['batch1.json', 'batch2.json', 'batch3.json']
    files_to_merge = [f"batch{i}.json" for i in range(1, 41)
        # 当你有更多时，继续往这里添加...
    ]
    
    merge_json_files(files_to_merge, 'final_500_words.json')
