import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(repo, "index.html"), "utf8");
const script = readFileSync(path.join(repo, "script.js"), "utf8");
const css = readFileSync(path.join(repo, "style.css"), "utf8");

// Birthdays use one local audio file only: no YouTube iframe, API or thumbnail.
assert.ok(html.includes('src="./assets/birthday-song.mp3"'), "the birthday audio path is missing");
assert.equal((html.match(/<audio\b/g) || []).length, 1, "there must be exactly one audio element");
assert.ok(!/youtube|ytimg|iframe_api/i.test(html), "YouTube markup must not remain");
assert.ok(!/youtube|ytimg|YT\.Player|videoId|videoUrl/i.test(script), "YouTube JavaScript must not remain");
assert.ok(script.includes('gateButton.addEventListener("click"'), "the gate button must own the first play call");
assert.ok(/\.birthday-music\s*\{[^}]*justify-content:\s*center/s.test(css), "the music player must center horizontally");
assert.ok(/env\(safe-area-inset-bottom\)/.test(css), "the music player must respect the bottom safe area");
assert.ok(/\.birthday-music__control\s*\{[^}]*min-width:\s*44px/s.test(css), "music controls need 44px touch targets");

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
  // Pin normal mode: the suite must behave the same on 3 November and every other day.
  await send("Page.navigate", { url: `${origin}?birthday=0` });
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
  // The local audio element is stubbed so the check stays offline and deterministic;
  // the real file path and the absence of YouTube are asserted statically below.
  await send("Emulation.setEmulatedMedia", { features: [] });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    (() => {
      const mediaState = new WeakMap();
      const stateFor = element => {
        if (!mediaState.has(element)) mediaState.set(element, { playing: false, muted: false, preload: "none" });
        return mediaState.get(element);
      };
      const proto = HTMLMediaElement.prototype;
      Object.defineProperty(proto, "paused", { configurable: true, get() { return !stateFor(this).playing; } });
      Object.defineProperty(proto, "ended", { configurable: true, get() { return false; } });
      Object.defineProperty(proto, "preload", {
        configurable: true,
        get() { return stateFor(this).preload; },
        set(value) { stateFor(this).preload = String(value); }
      });
      Object.defineProperty(proto, "muted", {
        configurable: true,
        get() { return stateFor(this).muted; },
        set(value) { stateFor(this).muted = Boolean(value); this.dispatchEvent(new Event("volumechange")); }
      });
      proto.play = function () {
        window.__audioCalls.push("play:" + this.id);
        if (window.__audioBlock) return Promise.reject(new DOMException("blocked", "NotAllowedError"));
        stateFor(this).playing = true;
        this.dispatchEvent(new Event("play"));
        this.dispatchEvent(new Event("playing"));
        return Promise.resolve();
      };
      proto.pause = function () {
        window.__audioCalls.push("pause:" + this.id);
        stateFor(this).playing = false;
        this.dispatchEvent(new Event("pause"));
      };
      proto.load = function () {
        window.__audioCalls.push("load:" + this.id);
        if (window.__audioFail) this.dispatchEvent(new Event("error"));
      };
      const params = new URLSearchParams(location.search);
      window.__audioCalls = [];
      window.__audioBlock = params.has("audioblock");
      window.__audioFail = params.has("audiofail");
    })();
  ` });
  await viewport(390, 844);
  await send("Page.navigate", { url: `${origin}?birthday=1` });
  await until("document.readyState === 'complete'");
  await until("document.querySelector('#birthday-gate').hidden === false");
  assert.equal(await evaluate("document.body.classList.contains('birthday')"), true);
  assert.equal(await evaluate("document.title"), "🎉 Happy birthday Πουπουκάκι μου! 🎂");
  assert.ok((await evaluate("document.querySelector('#welcome-title').textContent")).includes("Happy birthday"));
  assert.ok((await evaluate("document.querySelector('#welcome-intro').textContent")).includes("Μακάρι κάθε σου ευχή να γίνει πραγματικότητα"));
  assert.equal(await evaluate("document.querySelectorAll('.birthday-confetti').length"), 1);
  assert.equal(await evaluate("document.querySelector('#birthday-music').hidden"), false);
  assert.equal(await evaluate("document.querySelector('.birthday-music__title').textContent"), "Celebration");
  assert.equal(await evaluate("document.querySelector('.birthday-music__artist').textContent"), "Kool & The Gang");
  assert.ok((await evaluate("document.querySelector('#birthday-gate-title').textContent")).includes("Happy birthday"));
  assert.ok((await evaluate("document.querySelector('.birthday-gate__note').textContent")).includes("πιο όμορφο κορίτσι του κόσμου"));
  assert.equal(await evaluate("document.getElementById('birthday-gate-button').disabled"), false);
  assert.equal(await evaluate("document.getElementById('birthday-gate-button').textContent"), "Άνοιξέ το ♡");
  assert.equal(await evaluate("document.getElementById('birthday-music-play').getAttribute('aria-label')"), "Αναπαραγωγή τραγουδιού");
  assert.equal(await evaluate("document.getElementById('birthday-music-mute').getAttribute('aria-label')"), "Σίγαση μουσικής");
  assert.equal(await evaluate("document.getElementById('birthday-audio').preload"), "auto");
  assert.equal(await evaluate("document.getElementById('birthday-audio').loop"), true);
  assert.equal(await evaluate("Math.round(document.getElementById('birthday-audio').volume * 100)"), 70);
  assert.deepEqual(await evaluate("window.__audioCalls"), ["load:birthday-audio"]);
  assert.equal(await evaluate("window.YT === undefined"), true);
  assert.equal(await evaluate("document.querySelectorAll('iframe').length"), 0);
  const resources = await evaluate("performance.getEntriesByType('resource').map(entry => entry.name)");
  assert.equal(resources.some(name => /youtube|ytimg/i.test(name)), false, "no YouTube request");
  await screenshot("birthday-gate-390");
  // The gate is the first thing she sees; its tap is the browser gesture that starts sound.
  await tap("#birthday-gate-button");
  await until("document.querySelector('#birthday-gate').hidden === true");
  await until("document.querySelector('#birthday-music').classList.contains('is-playing')");
  assert.ok(await evaluate("window.__audioCalls.includes('play:birthday-audio')"), "the gate tap starts the local song");
  assert.equal(await evaluate("document.querySelector('#welcome').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#birthday-music').classList.contains('is-muted')"), false);
  assert.equal(await evaluate("document.getElementById('birthday-music-play').getAttribute('aria-label')"), "Παύση τραγουδιού");
  assert.equal(await evaluate("document.getElementById('birthday-music-mute').getAttribute('aria-label')"), "Σίγαση μουσικής");
  await screenshot("birthday-390");

  // Play/Pause keeps the position; Mute/Unmute never changes the Play/Pause state.
  const playsBeforeJourney = await evaluate("window.__audioCalls.filter(call => call.startsWith('play:')).length");
  await tap("#birthday-music-play");
  assert.equal(await evaluate("document.querySelector('#birthday-music').classList.contains('is-playing')"), false);
  assert.equal(await evaluate("document.getElementById('birthday-music-play').getAttribute('aria-label')"), "Αναπαραγωγή τραγουδιού");
  assert.ok(await evaluate("window.__audioCalls.includes('pause:birthday-audio')"));
  await pause(400); // Let the double-tap window close before tapping the same spot again.
  await tap("#birthday-music-play");
  await until("document.querySelector('#birthday-music').classList.contains('is-playing')");
  await pause(400);
  await tap("#birthday-music-mute");
  assert.equal(await evaluate("document.querySelector('#birthday-music').classList.contains('is-muted')"), true);
  assert.equal(await evaluate("document.querySelector('#birthday-music').classList.contains('is-playing')"), true);
  assert.equal(await evaluate("document.getElementById('birthday-music-play').textContent"), "❙❙");
  assert.equal(await evaluate("document.getElementById('birthday-music-mute').getAttribute('aria-label')"), "Ενεργοποίηση ήχου");
  await pause(400);
  await tap("#birthday-music-play");
  assert.equal(await evaluate("document.querySelector('#birthday-music').classList.contains('is-playing')"), false);
  assert.equal(await evaluate("document.querySelector('#birthday-music').classList.contains('is-muted')"), true, "muting does not pause the song");
  assert.equal(await evaluate("document.getElementById('birthday-music-play').textContent"), "▶");
  await pause(400);
  await tap("#birthday-music-play");
  await until("document.querySelector('#birthday-music').classList.contains('is-playing')");
  await pause(400);
  await tap("#birthday-music-mute");
  assert.equal(await evaluate("document.querySelector('#birthday-music').classList.contains('is-muted')"), false);
  assert.equal(await evaluate("document.querySelector('#birthday-music').classList.contains('is-playing')"), true);
  assert.equal(await evaluate("document.getElementById('birthday-music-mute').getAttribute('aria-label')"), "Σίγαση μουσικής");
  assert.equal(await evaluate("window.__audioCalls.filter(call => call.startsWith('play:')).length"), playsBeforeJourney + 2);

  // The song keeps playing through cookies, the surprise and the letter.
  await tap("#start-button");
  assert.equal(await evaluate("document.querySelector('#game').hidden"), false);
  for (let index = 0; index < 7; index++) {
    await tap(".cookie-button");
    await until("document.querySelector('#continue-button').hidden === false");
    await tap("#continue-button");
  }
  assert.equal(await evaluate("document.querySelector('#surprise').hidden"), false);
  await tap("#envelope-button");
  await until("document.querySelector('#letter').hidden === false");
  assert.equal(await evaluate("document.querySelector('#birthday-music').classList.contains('is-playing')"), true, "music continues in the letter");
  assert.equal(await evaluate("window.__audioCalls.filter(call => call.startsWith('play:')).length"), playsBeforeJourney + 2, "stage transitions do not restart the song");
  await tap("#replay-button");
  assert.equal(await evaluate("document.querySelector('#welcome').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#birthday-music').classList.contains('is-playing')"), true, "replay keeps the song running");
  await screenshot("birthday-replay-390");

  // The player must fit and center at the required widths, with 44px touch targets.
  for (const [width, height] of [[320, 568], [360, 640], [375, 667], [390, 844], [430, 932], [1280, 900]]) {
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
    const layout = await evaluate(`(() => {
      const rect = element => {
        const r = element.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, center: r.left + r.width / 2 };
      };
      return {
        width: innerWidth,
        card: rect(document.getElementById('birthday-music-card')),
        group: rect(document.querySelector('.birthday-music__controls')),
        play: rect(document.getElementById('birthday-music-play')),
        mute: rect(document.getElementById('birthday-music-mute')),
        welcomePadding: parseFloat(getComputedStyle(document.getElementById('welcome')).paddingBottom),
        titleWidth: document.querySelector('.birthday-music__title').getBoundingClientRect().width
      };
    })()`);
    assert.ok(layout.card.left >= 0 && layout.card.right <= width, `${width}px player overflows: ${JSON.stringify(layout.card)}`);
    assert.ok(Math.abs(layout.card.center - width / 2) <= 1, `${width}px player card is not centered: ${JSON.stringify(layout.card)}`);
    assert.ok(layout.play.width >= 44 && layout.play.height >= 44 && layout.mute.width >= 44 && layout.mute.height >= 44, `${width}px music touch targets are too small`);
    assert.ok(Math.abs(layout.play.top - layout.mute.top) <= 1, `${width}px controls are not aligned`);
    assert.ok(Math.abs((layout.play.center + layout.mute.center) / 2 - layout.group.center) <= 1, `${width}px controls are not centered in their group`);
    assert.ok(Math.abs((layout.play.left - layout.group.left) - (layout.group.right - layout.mute.right)) <= 1, `${width}px controls are not balanced`);
    assert.ok(layout.group.left >= layout.card.left && layout.group.right <= layout.card.right, `${width}px controls leave the card`);
    assert.ok(layout.card.bottom <= height, `${width}px player is below the viewport`);
    assert.ok(layout.welcomePadding >= layout.card.height, `${width}px player obscures the welcome action`);
    assert.ok(layout.titleWidth > 0, `${width}px song title is hidden`);
    await screenshot(`birthday-player-${width}`);
  }
  await viewport(390, 844);

  // Missing or corrupt audio: the page still opens and the controls explain why.
  await send("Page.navigate", { url: `${origin}?birthday=1&audiofail=1` });
  await until("document.readyState === 'complete'");
  await until("document.querySelector('#birthday-gate').hidden === false");
  await until("document.querySelector('#birthday-music').classList.contains('is-error')");
  assert.equal(await evaluate("document.querySelector('.birthday-music__artist').textContent"), "Η μουσική δεν είναι διαθέσιμη");
  assert.equal(await evaluate("document.getElementById('birthday-music-play').disabled"), true);
  await tap("#birthday-gate-button");
  await until("document.querySelector('#birthday-gate').hidden === true");
  assert.equal(await evaluate("document.querySelector('#welcome').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#game').hidden"), true);

  // Blocked autoplay: the gate still closes, and the player controls retry the song.
  await send("Page.navigate", { url: `${origin}?birthday=1&audioblock=1` });
  await until("document.readyState === 'complete'");
  await until("document.querySelector('#birthday-gate').hidden === false");
  await tap("#birthday-gate-button");
  await until("document.querySelector('#birthday-gate').hidden === true");
  assert.equal(await evaluate("document.querySelector('#welcome').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#birthday-music').classList.contains('is-playing')"), false);
  assert.equal(await evaluate("document.getElementById('birthday-music-play').disabled"), false);
  await evaluate("window.__audioBlock = false");
  await pause(400);
  await tap("#birthday-music-play");
  await until("document.querySelector('#birthday-music').classList.contains('is-playing')");

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
  assert.equal(await evaluate("document.getElementById('birthday-audio').preload"), "none");
  assert.deepEqual(await evaluate("window.__audioCalls"), [], "birthday audio is not loaded outside birthday mode");
  assert.equal(await evaluate("window.YT === undefined"), true);
  assert.equal(await evaluate("document.querySelectorAll('iframe').length"), 0);

  assert.deepEqual(runtimeErrors, []);
  console.log(`PASS: seven sequential touch steps, guarded Continue, messages, progress, envelope, letter, replay, 320/360/375/390/430/1280px layouts, local birthday audio with independent Play/Pause and Mute controls, and graceful audio failures. Screenshots: ${screenshots}`);
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
