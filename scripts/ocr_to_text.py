# -*- coding: utf-8 -*-
"""把 OCR 的 TSV（路径<TAB>文本）汇总成每个课件一个 txt。

用法：
    python ocr_to_text.py <ocr.tsv> <输出目录>

产物：
    <输出目录>/<课次目录名>/<课件目录名>.txt
    每行格式：[P001] 识别文本
"""
import os
import re
import sys

CJK = '\u4e00-\u9fff\u3000-\u303f\uff00-\uffef'


def clean(t):
    """去掉中文字符之间被 OCR 插入的空格。"""
    prev = None
    while prev != t:
        prev = t
        t = re.sub('(?<=[' + CJK + r'])[ ]+(?=[' + CJK + '])', '', t)
    return re.sub(r' +', ' ', t).strip()


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    tsv, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)

    decks = {}
    for line in open(tsv, encoding='utf-8'):
        line = line.rstrip('\n')
        if not line:
            continue
        path, _, text = line.partition('\t')
        parts = re.split(r'[\\/]+', path)
        if len(parts) >= 3:
            deck, page = parts[-3], os.path.splitext(parts[-1])[0]
        else:
            deck, page = 'misc', os.path.splitext(parts[-1])[0]
        decks.setdefault(deck, []).append((page, clean(text)))

    for deck, items in decks.items():
        items.sort(key=lambda x: x[0])
        p = os.path.join(outdir, deck + '.txt')
        with open(p, 'w', encoding='utf-8') as f:
            f.write('# ' + deck + '  %d 页\n\n' % len(items))
            for page, text in items:
                f.write('[%s] %s\n' % (page, text))
        print(deck, len(items))
    print('DONE -> ' + outdir)


if __name__ == '__main__':
    main()
