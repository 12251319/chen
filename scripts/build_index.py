# -*- coding: utf-8 -*-
"""根据 manifest.json 生成课程课件目录索引（Markdown）。

用法：
    python build_index.py <课程目录>

产物：
    <课程目录>/索引.md
"""
import json
import os
import sys


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    root = os.path.abspath(sys.argv[1])
    manifest_path = os.path.join(root, 'manifest.json')
    if not os.path.isfile(manifest_path):
        sys.exit(f'manifest.json not found: {manifest_path}')
    manifest = json.load(open(manifest_path, encoding='utf-8'))
    lessons = manifest.get('lessons', [])

    total_pages = sum(p.get('slide_count', 0) for l in lessons for p in l.get('presentations', []))
    pdf_dir = os.path.join(root, '教案PDF')
    pdfs = sorted(f for f in os.listdir(pdf_dir) if f.endswith('.pdf')) if os.path.isdir(pdf_dir) else []
    ocr_dir = os.path.join(root, 'OCR文本')
    ocr_files = sorted(f for f in os.listdir(ocr_dir) if f.endswith('.txt')) if os.path.isdir(ocr_dir) else []

    lines = [
        '# 课件目录索引',
        '',
        f'- 来源：{manifest.get("source", "")}',
        f'- 班级（classroom）：{manifest.get("classroom_id", "")}',
        f'- 抓取时间：{manifest.get("extracted_at", "")}',
        f'- 课次：{len(lessons)}；幻灯片：{total_pages} 张；PDF：{len(pdfs)} 个；OCR 文本：{len(ocr_files)} 份',
        '',
        '| # | 日期 | 课题 | 页数 | 备注 |',
        '|---|---|---|---|---|',
    ]
    for l in lessons:
        pages = sum(p.get('slide_count', 0) for p in l.get('presentations', []))
        note = '本次无课件' if pages == 0 else ''
        lines.append(f'| {l.get("index")} | {l.get("date", "")} | {l.get("title", "")} | {pages} | {note} |')

    empty = [l for l in lessons if sum(p.get('slide_count', 0) for p in l.get('presentations', [])) == 0]
    if empty:
        lines += ['', '## 缺课件课次', '']
        for l in empty:
            lines.append(f'- 第 {l.get("index")} 讲 {l.get("title", "")}（{l.get("date", "")}）')

    out = os.path.join(root, '索引.md')
    open(out, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print('saved ' + out)


if __name__ == '__main__':
    main()
