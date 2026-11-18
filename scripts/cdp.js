#!/usr/bin/env node
/**
 * Minimal Chrome DevTools Protocol (CDP) client.
 *
 * Talks to an already-running Edge/Chrome started with:
 *   --remote-debugging-port=9222 --remote-allow-origins=*
 *
 * Usage:
 *   node cdp.js list                 # 列出页面 target
 *   node cdp.js eval "<js>"          # 在页面里执行 JS（同源 fetch 会带 cookie）
 *   node cdp.js cookies [--domain yuketang] [--out cookies.json]
 *   node cdp.js nav <url>
 *   node cdp.js click "<text>"
 *   node cdp.js shot [out.png]
 *   node cdp.js pdf [out.pdf]
 *
 * Env:
 *   CDP_PORT  remote debugging port, default 9222
 */
const fs = require('fs');

const PORT = process.env.CDP_PORT || '9222';
const BASE = `http://127.0.0.1:${PORT}`;

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] || fallback;
}

async function targets() {
  const r = await fetch(`${BASE}/json/list`);
  if (!r.ok) throw new Error(`CDP list failed: ${r.status}`);
  return r.json();
}

async function connect() {
  const list = await targets();
  const page = list.find(t => t.type === 'page') || null;
  if (!page) throw new Error('no page target; is the browser open?');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) =>
    new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  return { send, ws, page };
}

async function evaluate(send, expression) {
  const r = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true, userGesture: true,
  });
  if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result && r.result.result ? r.result.result.value : r.result;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log('usage: node cdp.js <list|eval|nav|click|cookies|shot|pdf> [args]');
    return;
  }
  const { send, ws } = await connect();
  try {
    if (cmd === 'list') {
      const list = await targets();
      console.log(JSON.stringify(list.filter(t => t.type === 'page').map(t => ({ title: t.title, url: t.url })), null, 2));
    } else if (cmd === 'eval') {
      console.log(JSON.stringify(await evaluate(send, rest.join(' ')), null, 2));
    } else if (cmd === 'nav') {
      await send('Page.navigate', { url: rest[0] });
      console.log('navigated to ' + rest[0]);
    } else if (cmd === 'click') {
      const text = rest.join(' ');
      const rect = await evaluate(send, `(()=>{
        const t=${JSON.stringify(text)};
        const els=[...document.querySelectorAll('body *')].filter(e=>{
          const s=(e.textContent||'').trim().replace(/\\s+/g,' ');
          return s.includes(t) && e.querySelectorAll('*').length<=3 && s.length<=80;
        });
        if(!els.length) return null;
        const el=els[0];
        el.scrollIntoView({block:'center'});
        const r=el.getBoundingClientRect();
        return {x:r.x+r.width/2, y:r.y+r.height/2, n:els.length};
      })()`);
      if (!rect) { console.log('NOT_FOUND'); return; }
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
      console.log('clicked ' + JSON.stringify(rect));
    } else if (cmd === 'cookies') {
      const domain = argValue('--domain', 'yuketang');
      const out = argValue('--out', 'cookies.json');
      const r = await send('Network.getAllCookies');
      const list = (r.result.cookies || []).filter(c => c.domain.includes(domain));
      fs.writeFileSync(out, JSON.stringify(list.map(c => ({ domain: c.domain, name: c.name, value: c.value })), null, 1));
      console.log(`saved ${out} (${list.length} cookies: ${list.map(c => c.name).join(',')})`);
    } else if (cmd === 'shot') {
      const out = rest[0] || 'shot.png';
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'));
      console.log('saved ' + out);
    } else if (cmd === 'pdf') {
      const out = rest[0] || 'page.pdf';
      const r = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'));
      console.log('saved ' + out);
    } else {
      console.error('unknown command: ' + cmd);
      process.exitCode = 1;
    }
  } finally {
    ws.close();
  }
}

main().catch(e => { console.error('ERR', e.message); process.exit(1); });
