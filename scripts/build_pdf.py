# -*- coding: utf-8 -*-
"""把 slides/ 下按课次分目录的幻灯片合并成按课次排列的 PDF。

用法：
    python build_pdf.py <课程目录>

产物：
    <课程目录>/教案PDF/<课次>.pdf
    <课程目录>/教案PDF/index.json
"""
import json
import os
import re
import sys

from PIL import Image


def natkey(s):
    return [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', s)]


def collect(lesson_dir):
    images = []
    for pres in sorted(os.listdir(lesson_dir), key=natkey):
        pdir = os.path.join(lesson_dir, pres)
        if not os.path.isdir(pdir):
            continue
        for f in sorted(os.listdir(pdir), key=natkey):
            if f.lower().endswith(('.jpg', '.jpeg', '.png')):
                images.append(os.path.join(pdir, f))
    return images


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    root = os.path.abspath(sys.argv[1])
    slides = os.path.join(root, 'slides')
    out = os.path.join(root, '教案PDF')
    if not os.path.isdir(slides):
        sys.exit(f'slides directory not found: {slides}')
    os.makedirs(out, exist_ok=True)

    report = []
    for lesson in sorted(os.listdir(slides), key=natkey):
        ldir = os.path.join(slides, lesson)
        if not os.path.isdir(ldir):
            continue
        images = collect(ldir)
        if not images:
            continue
        imgs = [Image.open(p).convert('RGB') for p in images]
        pdf = os.path.join(out, lesson + '.pdf')
        imgs[0].save(pdf, save_all=True, append_images=imgs[1:], resolution=144.0)
        size_mb = round(os.path.getsize(pdf) / 1024 / 1024, 2)
        print(f'{lesson}: {len(imgs)} slides -> {size_mb} MB')
        report.append({'lesson': lesson, 'slides': len(imgs), 'mb': size_mb})

    with open(os.path.join(out, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print(f'DONE {len(report)} PDFs -> {out}')


if __name__ == '__main__':
    main()
