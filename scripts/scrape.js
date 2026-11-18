#!/usr/bin/env node
/**
 * 抓取雨课堂某个班级（classroom）的全部课堂课件幻灯片。
 *
 * 用法：
 *   node scrape.js <classroom_id> <输出目录> [--cookies cookies.json] [--base URL]
 *
 * 前置：浏览器已用 --remote-debugging-port 启动并完成扫码登录，
 *       且已用 `node cdp.js cookies` 导出 cookies.json。
 *
 * 产物：
 *   <输出目录>/slides/<课次序号-标题>/<课件序号-标题>/P001.jpg ...
 *   <输出目录>/manifest.json
 */
const fs = require('fs');
const path = require('path');

const COOKIE_FILE = (() => {
  const i = process.argv.indexOf('--cookies');
  return i > -1 ? process.argv[i + 1] : 'cookies.json';
})();
const BASE = (() => {
  const i = process.argv.indexOf('--base');
  return i > -1 ? process.argv[i + 1] : 'https://changjiang.yuketang.cn';
})();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const [, , classroomId, outDir] = process.argv;
if (!classroomId || !outDir) {
  console.error('usage: node scrape.js <classroom_id> <out_dir> [--cookies cookies.json] [--base URL]');
  process.exit(1);
}

if (!fs.existsSync(COOKIE_FILE)) {
  console.error(`cookie file not found: ${COOKIE_FILE}\n先运行: node cdp.js cookies`);
  process.exit(1);
}
const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

const ROOT = path.resolve(outDir);
const SLIDES = path.join(ROOT, 'slides');

function safe(s) {
  return String(s || '')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'untitled';
}

async function getJSON(url) {
  const full = url.startsWith('http') ? url : BASE + url;
  const r = await fetch(full, {
    headers: {
      Cookie: cookieHeader,
      'User-Agent': UA,
      Referer: `${BASE}/v2/web/index`,
      Accept: 'application/json',
    },
  });
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`non-json ${r.status} ${full}: ${text.slice(0, 120)}`);
  }
}

async function download(url, file) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: BASE + '/' } });
  if (!r.ok) throw new Error(`img ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf.length;
}

async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }));
}

function fmtDate(ms) {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

(async () => {
  fs.mkdirSync(SLIDES, { recursive: true });

  // 1) 课堂记录列表（分页）
  const activities = [];
  for (let page = 0; page < 50; page++) {
    const j = await getJSON(`/v2/api/web/logs/learn/${classroomId}?actype=-1&page=${page}&offset=50&sort=-1`);
    const d = j.data || {};
    const a = d.activities || [];
    activities.push(...a);
    if (!d.has_more || a.length === 0) break;
  }

  // 2) 只保留课堂记录（type=14），按时间正序
  const lessons = activities.filter(a => a.type === 14).sort((x, y) => x.create_time - y.create_time);
  console.log(`lessons: ${lessons.length}`);

  const manifest = {
    source: 'changjiang.yuketang.cn',
    classroom_id: classroomId,
    extracted_at: new Date().toISOString(),
    lessons: [],
  };

  for (let li = 0; li < lessons.length; li++) {
    const act = lessons[li];
    const lessonId = act.courseware_id;
    const idx = String(li + 1).padStart(2, '0');
    const title = (act.title || '').trim();
    const lessonDir = path.join(SLIDES, `${idx}-${safe(title)}`);
    console.log(`[${idx}] ${title} (${lessonId})`);

    const rec = {
      index: li + 1,
      title,
      lesson_id: lessonId,
      create_time: act.create_time,
      date: fmtDate(act.create_time),
      dir: path.relative(ROOT, lessonDir),
      presentations: [],
    };

    let detail;
    try {
      detail = await getJSON(`/api/v3/classroom-report/student/detail?lesson_id=${lessonId}`);
    } catch (e) {
      console.log('  detail ERR', e.message);
      manifest.lessons.push(rec);
      continue;
    }

    const presList = (detail.data && detail.data.presentation) || [];
    console.log(`  presentations: ${presList.length}`);

    for (let pi = 0; pi < presList.length; pi++) {
      const pres = presList[pi];
      const pDir = path.join(lessonDir, `${pi + 1}-${safe(pres.title)}`);
      fs.mkdirSync(pDir, { recursive: true });

      let slides = [];
      try {
        const ppt = await getJSON(`/api/v3/classroom-report/student/ppt?lesson_id=${lessonId}&presentationId=${pres.presentationId}`);
        slides = (ppt.data && ppt.data.slideList) || [];
      } catch (e) {
        console.log('  ppt ERR', e.message);
      }
      console.log(`  -> ${pres.title}: ${slides.length} slides`);

      const files = [];
      await pool(slides, 8, async (s, si) => {
        const n = String(s.index != null ? s.index : si + 1).padStart(3, '0');
        const file = path.join(pDir, `P${n}.jpg`);
        try {
          const size = await download(s.cover, file);
          files.push({ index: s.index, file: path.relative(ROOT, file), size });
        } catch (e) {
          console.log('   dl ERR', e.message);
        }
      });
      files.sort((a, b) => (a.index || 0) - (b.index || 0));

      rec.presentations.push({
        index: pi + 1,
        title: (pres.title || '').trim(),
        presentation_id: pres.presentationId,
        slide_count: slides.length,
        slides: files,
      });
    }
    manifest.lessons.push(rec);
  }

  fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const total = manifest.lessons.reduce((a, l) => a + l.presentations.reduce((b, p) => b + p.slide_count, 0), 0);
  console.log(`DONE. lessons: ${manifest.lessons.length}, slides: ${total}`);
  console.log(`output: ${ROOT}`);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
