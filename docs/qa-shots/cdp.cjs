// CDP driver: log in once, then screenshot every route at two widths.
const fs = require('fs');
const path = require('path');

const PORT = 9333;
const BASE = 'http://127.0.0.1:4321';
const OUT = process.argv[2] || 'shot';
const WIDTH = Number(process.argv[3] || 1440);
const HEIGHT = Number(process.argv[4] || 1000);
const PAGES = (process.argv[5] || '').split(',').filter(Boolean);

async function listTargets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return r.json();
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      } else if (msg.method) events.push(msg);
    });
    ws.addEventListener('open', () => resolve({ ws, send, events }));
    ws.addEventListener('error', reject);
    function send(method, params = {}) {
      const mid = ++id;
      ws.send(JSON.stringify({ id: mid, method, params }));
      return new Promise((res, rej) => pending.set(mid, { res, rej }));
    }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const targets = (await listTargets()).filter((t) => t.type === 'page');
  const page = targets[0];
  const { send, ws } = await connect(page.webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: WIDTH < 500 });

  async function goto(url) {
    await send('Page.navigate', { url });
    await sleep(600);
    // wait for network quiet-ish: poll for a mounted root
    for (let i = 0; i < 40; i += 1) {
      const r = await send('Runtime.evaluate', { expression: 'document.querySelector("#root")?.children.length || 0', returnByValue: true });
      if ((r.result?.value || 0) > 0) break;
      await sleep(250);
    }
    await sleep(1200);
  }

  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r.result?.value;
  }

  // Log in with the verification account so every page renders real data.
  await goto(`${BASE}/login`);
  const login = await evaluate(`fetch('/api/auth/login',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({email:'growth5@example.com',password:'TestPass123'})}).then(r=>r.status)`);
  console.log('login status', login);

  fs.mkdirSync(OUT, { recursive: true });
  const report = [];
  for (const p of PAGES) {
    const [route, name] = p.split('=');
    await goto(`${BASE}${route}`);
    const info = await evaluate(`(() => {
      const de = document.documentElement;
      return {
        hOverflow: de.scrollWidth - de.clientWidth,
        title: document.querySelector('h1')?.textContent?.trim() || document.querySelector('h2')?.textContent?.trim() || '',
        bodyText: (document.body.innerText || '').slice(0, 160).replace(/\\n/g, ' | '),
        errors: (window.__errs || []).slice(0, 3),
      };
    })()`);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(OUT, `${name}-${WIDTH}.png`), Buffer.from(shot.data, 'base64'));
    report.push({ name, width: WIDTH, ...info });
    console.log(`${name} ${WIDTH} overflow=${info.hOverflow} title="${info.title}"`);
  }
  fs.writeFileSync(path.join(OUT, `report-${WIDTH}.json`), JSON.stringify(report, null, 2));
  ws.close();
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
