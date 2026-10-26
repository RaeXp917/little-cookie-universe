import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const edge = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].find(existsSync);
if (!edge) throw new Error("Microsoft Edge is needed for this browser check.");

const origin = process.env.SITE_URL || "http://127.0.0.1:8765/";
const profile = mkdtempSync(path.join(tmpdir(), "cookie-qa-"));
const screenshots = mkdtempSync(path.join(tmpdir(), "cookie-shots-"));
const browser = spawn(edge, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"
], { stdio: "ignore", windowsHide: true });

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
let nextId = 0;
const pending = new Map();
const runtimeErrors = [];

async function connect() {
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 100 && !existsSync(portFile); attempt++) {
    await pause(100);
  }
  if (!existsSync(portFile)) throw new Error("Edge debugging port did not open.");
  const port = readFileSync(portFile, "utf8").split("\n")[0];
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = pages.find(item => item.type === "page");
  if (!page) throw new Error("No browser page was created.");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(message.params.exceptionDetails.text);
    }
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      runtimeErrors.push(message.params.entry.text);
    }
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
  });
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

async function until(expression, expected = true) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await evaluate(expression) === expected) return;
    await pause(100);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function viewport(width, height = 760) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await pause(100);
  const metrics = await evaluate(`({scroll:document.documentElement.scrollWidth, inner:innerWidth, body:document.body.scrollWidth})`);
  assert.ok(metrics.scroll <= metrics.inner, `${width}px viewport has horizontal document overflow: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.body <= metrics.inner, `${width}px viewport has horizontal body overflow: ${JSON.stringify(metrics)}`);
}

async function tap(selector) {
  const box = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({block:'center', behavior:'instant'}); const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}; })()`);
  assert.ok(box.width >= 44 && box.height >= 44, `${selector} is too small for touch`);
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y }] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function screenshot(name) {
  await pause(700); // Capture the settled stage, after its entrance animation.
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(path.join(screenshots, `${name}.png`), Buffer.from(result.data, "base64"));
}

try {
  await connect();
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await viewport(390, 844);
  await send("Page.navigate", { url: origin });
  await until("document.readyState === 'complete'");
  await until("document.querySelector('#letter-body').children.length === 7");
  assert.equal(await evaluate("document.querySelector('#welcome-title').textContent.trim()"), "Πουπουκάκι μου ♡");
  assert.equal(await evaluate("document.querySelectorAll('[data-cookie]').length"), 1);
  assert.equal(await evaluate("document.querySelector('#surprise').hidden"), true);
  await screenshot("welcome-390");

  await tap("#start-button");
  assert.equal(await evaluate("document.querySelector('#game').hidden"), false);
  await screenshot("game-390");
  const messages = [
    "Ήθελα να σου φτιάξω λίγο τη διάθεση σήμερα. ❤️",
    "Μου αρέσει πολύ να μιλάμε, ακόμα κι όταν λέμε τις πιο άκυρες βλακείες.",
    "Μου αρέσει να σε πειράζω και να σε κάνω να γελάς.",
    "Μερικές φορές πιάνω τον εαυτό μου να χαμογελάει όταν βλέπω μήνυμά σου.",
    "Χαίρομαι που γνωριζόμαστε όλο και περισσότερο.",
    "Μου αρέσει που έχουμε ήδη τα δικά μας μικρά αστεία.",
    "Και επειδή ήθελα να σου κάνω μια μικρή έκπληξη... σου έχω αφήσει κάτι ακόμα. ❤️"
  ];
  for (let index = 0; index < 7; index++) {
    assert.equal(await evaluate("document.querySelectorAll('.cookie-button').length"), 1);
    assert.equal(await evaluate("document.querySelector('.cookie-button').dataset.cookie"), String(index));
    assert.equal(await evaluate("document.querySelector('.cookie-button').disabled"), false);
    assert.equal(await evaluate("document.querySelector('#continue-button').hidden"), true);
    await tap(".cookie-button");
    await tap(".cookie-button"); // A rapid second touch must not collect another step.
    assert.equal(await evaluate("document.querySelector('#progress-count').textContent"), `${index + 1} / 7`);
    assert.equal(await evaluate("document.querySelector('.cookie-button').disabled"), true);
    await until("document.querySelector('#continue-button').hidden === false");
    assert.equal(await evaluate("document.querySelector('#message-text').textContent"), messages[index]);
    assert.equal(await evaluate("document.querySelector('#surprise').hidden"), true);
    assert.equal(await evaluate("document.querySelector('.cookie-button').dataset.cookie"), String(index));
    if (index === 0 || index === 6) await screenshot(`message-${index + 1}-390`);
    if (index === 0) {
      assert.equal(await evaluate("document.querySelector('.cookie-button').dataset.cookie"), "0");
      assert.equal(await evaluate("document.querySelector('#message-text').textContent"), messages[0]);
      assert.equal(await evaluate("document.querySelector('#continue-button').hidden"), false);
    }
    await tap("#continue-button");
    await evaluate("document.querySelector('#continue-button').click()"); // A duplicate Continue event must be ignored.
    if (index < 6) {
      assert.equal(await evaluate("document.querySelector('#game').hidden"), false);
      assert.equal(await evaluate("document.querySelector('.cookie-button').dataset.cookie"), String(index + 1));
      assert.equal(await evaluate("document.querySelector('#continue-button').hidden"), true);
      assert.equal(await evaluate("document.querySelector('#progress-count').textContent"), `${index + 1} / 7`);
    }
  }
  assert.equal(await evaluate("document.querySelector('#surprise').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#surprise p').textContent.trim()"), "Ένα μικρό γράμμα για σένα 💌");
  assert.equal(await evaluate("document.querySelector('#envelope-button').getAttribute('aria-label')"), "Άνοιξέ το ♡");
  await screenshot("surprise-390");
  await tap("#envelope-button");
  await until("document.querySelector('#letter').hidden === false");
  assert.equal(await evaluate("document.querySelector('#letter-body').children.length"), 7);
  assert.equal(await evaluate("document.querySelector('#letter-body').children[1].textContent"), "Σου έφτιαξα αυτό το μικρό παιχνιδάκι γιατί ήθελα να σου κάνω μια μικρή έκπληξη. Κάτι λίγο διαφορετικό, μόνο για σένα.");
  assert.ok((await evaluate("document.querySelector('#letter-body').textContent")).includes("σου χρωστάω αληθινά!"));
  await screenshot("letter-390");
  await tap("#replay-button");
  assert.equal(await evaluate("document.querySelector('#welcome').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#progress-count').textContent"), "0 / 7");
  assert.equal(await evaluate("document.querySelector('.cookie-button').dataset.cookie"), "0");
  assert.equal(await evaluate("document.querySelector('.cookie-button').disabled"), false);

  for (const width of [320, 360, 412]) {
    await viewport(width, 640);
    await screenshot(`welcome-${width}`);
    await tap("#start-button");
    await viewport(width, 640);
    const target = await evaluate("(() => { const r=document.querySelector('.cookie-button').getBoundingClientRect(); return {width:r.width,height:r.height,left:r.left,right:r.right} })()");
    assert.ok(target.width >= 44 && target.height >= 44 && target.left >= 0 && target.right <= width, `${width}px cookie target overflows`);
    await screenshot(`game-${width}`);
    await tap(".cookie-button");
    await until("document.querySelector('#continue-button').hidden === false");
    await viewport(width, 640);
    await screenshot(`message-${width}`);
    await tap("#continue-button");
    assert.equal(await evaluate("document.querySelector('.cookie-button').dataset.cookie"), "1");
    await send("Page.reload", { ignoreCache: true });
    await until("document.querySelector('#welcome').hidden === false");
  }
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await viewport(320, 568);
  assert.equal(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"), true);
  await tap("#start-button");
  await tap(".cookie-button");
  await until("document.querySelector('#continue-button').hidden === false");
  await tap("#continue-button");
  assert.equal(await evaluate("document.querySelector('.cookie-button').dataset.cookie"), "1");
  assert.deepEqual(runtimeErrors, []);
  console.log(`PASS: seven sequential touch steps, guarded Continue, messages, progress, envelope, letter, replay, and 320/360/390/412px layouts. Screenshots: ${screenshots}`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    await Promise.race([send("Browser.close").catch(() => {}), pause(500)]);
  }
  socket?.close();
  browser.kill();
  if (path.dirname(profile) === tmpdir() && path.basename(profile).startsWith("cookie-qa-")) {
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Edge may still be closing. */ }
  }
}
