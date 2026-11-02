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

  for (let reload = 0; reload < 2; reload++) {
    await evaluate("window.__visitTestMarker = true");
    await send("Page.reload", { ignoreCache: true });
    await until("window.__visitTestMarker === undefined && document.readyState === 'complete'");
    assert.equal(await evaluate("document.querySelector('#welcome-title').textContent.trim()"), "Πουπουκάκι μου ♡", "A quick reload is the same visit");
  }
  assert.equal(await evaluate("document.hidden"), false);

  async function returnAfterTimeAway() {
    await evaluate("sessionStorage.setItem('little-cookie-universe-last-seen', String(Date.now() - 31 * 60 * 1000)); document.dispatchEvent(new Event('visibilitychange'))");
  }
  for (const [visit, greeting] of [
    [2, "Πουπουκάκι μου ♡"],
    [3, "Πάλι εδώ είσαι, πουπούκι; 😂"],
    [4, "Πουπουκάκι μου ♡"],
    [5, "Πουπουκάκι μου ♡"],
    [6, "Πάλι εδώ είσαι, πουπούκι; 😂"]
  ]) {
    if (visit === 3) {
      await evaluate("window.__realNow = Date.now(); Date.now = () => window.__realNow - 31 * 60 * 1000; window.__visitTestMarker = true");
      await send("Page.reload", { ignoreCache: true });
      await until("window.__visitTestMarker === undefined && document.readyState === 'complete'");
    } else {
      if (visit === 4) await tap("#start-button");
      await returnAfterTimeAway();
    }
    assert.equal(await evaluate("document.querySelector('#welcome').hidden"), false, `Visit ${visit} returns to welcome`);
    assert.equal(await evaluate("document.querySelector('#welcome-title').textContent.trim()"), greeting, `Visit ${visit} greeting`);
    if (visit === 3) {
      await viewport(320, 640);
      await screenshot("return-greeting-320");
      await viewport(390, 844);
      await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
      assert.equal(await evaluate("document.querySelector('#welcome-title').textContent.trim()"), greeting, "Immediate return stays on the same visit");
      await evaluate("window.__visitTestMarker = true");
      await send("Page.reload", { ignoreCache: true });
      await until("window.__visitTestMarker === undefined && document.readyState === 'complete'");
      assert.equal(await evaluate("document.querySelector('#welcome-title').textContent.trim()"), greeting, "Quick reload keeps the current greeting");
    }
  }

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

  // Birthday mode: ?birthday=1 previews it; ?birthday=0 proves the rest of the year stays untouched.
  // YouTube is stubbed so this check stays offline and deterministic.
  await send("Emulation.setEmulatedMedia", { features: [] });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__ytCalls = [];
    window.__ytBlockAutoplay = true;
    window.YT = {
      PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
      Player: function (element, options) {
        window.__ytOptions = options;
        const self = this;
        this.state = -1;
        this.playVideo = () => {
          window.__ytCalls.push("play");
          if (window.__ytBlockAutoplay && !self.silent && !window.__ytGesture) return;
          self.state = 1;
          options.events.onStateChange({ data: 1 });
        };
        this.pauseVideo = () => { window.__ytCalls.push("pause"); self.state = 2; options.events.onStateChange({ data: 2 }); };
        this.seekTo = seconds => window.__ytCalls.push("seek:" + seconds);
        this.mute = () => { window.__ytCalls.push("mute"); self.silent = true; };
        this.unMute = () => { window.__ytCalls.push("unmute"); self.silent = false; window.__ytGesture = true; };
        this.setVolume = value => window.__ytCalls.push("volume:" + value);
        this.getPlayerState = () => self.state;
        setTimeout(() => options.events.onReady(), 0);
      }
    };
  ` });
  await viewport(390, 844);
  await send("Page.navigate", { url: `${origin}?birthday=1` });
  await until("document.readyState === 'complete'");
  await until("window.__ytOptions !== undefined");
  assert.equal(await evaluate("document.body.classList.contains('birthday')"), true);
  assert.equal(await evaluate("document.title"), "🎉 Happy birthday Πουπουκάκι μου! 🎂");
  assert.ok((await evaluate("document.querySelector('#welcome-title').textContent")).includes("Happy birthday"));
  assert.ok((await evaluate("document.querySelector('#welcome-intro').textContent")).includes("Μακάρι κάθε σου ευχή να γίνει πραγματικότητα"));
  assert.equal(await evaluate("document.querySelectorAll('.birthday-confetti').length"), 1);
  assert.equal(await evaluate("document.querySelector('#birthday-music').hidden"), false);
  assert.equal(await evaluate("window.__ytOptions.videoId"), "37GihMpoc24");
  assert.equal(await evaluate("window.__ytOptions.playerVars.start"), undefined);
  assert.equal(await evaluate("document.querySelector('.birthday-music__title').textContent"), "Celebration");
  // The gate is the first thing she sees; its tap is the browser gesture that allows sound.
  assert.equal(await evaluate("document.querySelector('#birthday-gate').hidden"), false);
  assert.equal(await evaluate("document.activeElement.id"), "birthday-gate-button");
  assert.ok((await evaluate("document.querySelector('#birthday-gate-title').textContent")).includes("Happy birthday"));
  assert.ok((await evaluate("document.querySelector('.birthday-gate__note').textContent")).includes("πιο όμορφο κορίτσι του κόσμου"));
  assert.equal(await evaluate("document.querySelector('#birthday-gate-button').textContent"), "Άνοιξέ το ♡");
  // Browsers block audible autoplay, so the player waits paused until she taps.
  await until("document.querySelector('#birthday-music').classList.contains('is-muted')");
  assert.equal(await evaluate("window.__ytOptions.playerVars.autoplay"), 0);
  assert.equal(await evaluate("document.querySelector('#birthday-music-toggle').getAttribute('aria-label')"), "Πάτα για μουσική");
  assert.equal(await evaluate("document.querySelector('.birthday-music__artist').textContent"), "Πάτα για μουσική");
  assert.equal(await evaluate("window.__ytCalls.includes('play')"), false, "nothing plays before a gesture");
  await screenshot("birthday-gate-390");
  await tap("#birthday-gate-button");
  await until("document.querySelector('#birthday-gate').hidden === true");
  await until("document.querySelector('#birthday-music').classList.contains('is-playing')");
  await until("document.querySelector('#birthday-music').classList.contains('is-muted') === false");
  assert.ok(await evaluate("window.__ytCalls.includes('unmute')"), "the gate tap starts the song with sound");
  await screenshot("birthday-390");
  await tap("#start-button");
  assert.equal(await evaluate("document.querySelector('#game').hidden"), false);
  await tap("#birthday-music-toggle");
  assert.equal(await evaluate("document.querySelector('#birthday-music').classList.contains('is-playing')"), false);
  assert.ok(await evaluate("window.__ytCalls.includes('pause')"));
  await pause(400); // Let the double-tap window close before tapping the same spot again.
  await tap("#birthday-music-toggle");
  await until("document.querySelector('#birthday-music').classList.contains('is-playing')");
  await evaluate("window.__ytOptions.events.onStateChange({ data: 0 })");
  assert.ok(await evaluate("window.__ytCalls.includes('seek:0')"), "the song restarts from the start when it ends");
  await tap("#birthday-music-expand");
  assert.equal(await evaluate("document.querySelector('#birthday-music-card').classList.contains('is-expanded')"), true);
  assert.equal(await evaluate("document.querySelector('#birthday-music-expand').getAttribute('aria-expanded')"), "true");
  await viewport(320, 640);
  const musicBox = await evaluate("(() => { const r = document.getElementById('birthday-music-card').getBoundingClientRect(); return { left: r.left, right: r.right, height: r.height }; })()");
  assert.ok(musicBox.left >= 0 && musicBox.right <= 320, `birthday player overflows: ${JSON.stringify(musicBox)}`);
  await screenshot("birthday-320");

  // The birthday gate and the welcome screen have to fit the smallest phones too.
  for (const [width, height] of [[320, 568], [360, 640], [412, 732]]) {
    await viewport(width, height);
    await send("Page.navigate", { url: `${origin}?birthday=1` });
    await until("document.readyState === 'complete'");
    await until("document.querySelector('#birthday-gate').hidden === false");
    const gateBox = await evaluate("(() => { const r = document.querySelector('.birthday-gate__card').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })()");
    assert.ok(gateBox.left >= 0 && gateBox.right <= width, `${width}x${height} gate card overflows sideways: ${JSON.stringify(gateBox)}`);
    assert.ok(gateBox.top >= 0 && gateBox.bottom <= height, `${width}x${height} gate card overflows vertically: ${JSON.stringify(gateBox)}`);
    await screenshot(`birthday-gate-${width}`);
    await tap("#birthday-gate-button");
    await until("document.querySelector('#birthday-gate').hidden === true");
    await until("document.querySelector('#birthday-music').classList.contains('is-playing')");
    await screenshot(`birthday-welcome-${width}`);
  }
  await viewport(390, 844);

  await send("Page.navigate", { url: `${origin}?birthday=0` });
  await until("document.readyState === 'complete'");
  await until("document.querySelector('#letter-body').children.length === 7");
  assert.equal(await evaluate("document.body.classList.contains('birthday')"), false);
  assert.equal(await evaluate("document.title"), "A Little World For You ♡");
  assert.equal(await evaluate("document.querySelector('#welcome-title').textContent.includes('Happy birthday')"), false);
  assert.equal(await evaluate("document.querySelector('#welcome-intro').textContent.includes('Σου έφτιαξα κάτι μικρό')"), true);
  assert.equal(await evaluate("document.querySelectorAll('.birthday-confetti').length"), 0);
  assert.equal(await evaluate("document.querySelector('#birthday-gate').hidden"), true);
  assert.equal(await evaluate("document.querySelector('#birthday-music').hidden"), true);
  assert.equal(await evaluate("document.querySelector('#birthday-player iframe')"), null);
  assert.equal(await evaluate("window.__ytOptions === undefined"), true, "the player is not created outside the birthday");

  assert.deepEqual(runtimeErrors, []);
  console.log(`PASS: seven sequential touch steps, guarded Continue, messages, progress, envelope, letter, replay, 320/360/390/412px layouts, and birthday mode on 390/320px. Screenshots: ${screenshots}`);
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
