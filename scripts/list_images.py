# -*- coding: utf-8 -*-
"""列出 slides/ 下所有幻灯片图片，供 OCR 批量脚本使用。

用法：
    python list_images.py <课程目录> [--filter 关键字]

输出：每行一个绝对路径（UTF-8）。
"""
import os
import re
import sys


def natkey(s):
    return [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', s)]


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    root = os.path.abspath(sys.argv[1])
    keyword = None
    if '--filter' in sys.argv:
        keyword = sys.argv[sys.argv.index('--filter') + 1]

    slides = os.path.join(root, 'slides')
    out = []
    for lesson in sorted(os.listdir(slides), key=natkey):
        ldir = os.path.join(slides, lesson)
        if not os.path.isdir(ldir):
            continue
        if keyword and keyword not in lesson:
            continue
        for pres in sorted(os.listdir(ldir), key=natkey):
            pdir = os.path.join(ldir, pres)
            if not os.path.isdir(pdir):
                continue
            for f in sorted(os.listdir(pdir), key=natkey):
                if f.lower().endswith(('.jpg', '.jpeg', '.png')):
                    out.append(os.path.join(pdir, f))
    sys.stdout.write('\n'.join(out))


if __name__ == '__main__':
    main()
