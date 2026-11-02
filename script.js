"use strict";

// PERSONAL TEXT: edit the seven cookie messages and letter here.
const PERSONAL_TEXT = {
  cookieMessages: [
    "Ήθελα να σου φτιάξω λίγο τη διάθεση σήμερα. ❤️",
    "Μου αρέσει πολύ να μιλάμε, ακόμα κι όταν λέμε τις πιο άκυρες βλακείες.",
    "Μου αρέσει να σε πειράζω και να σε κάνω να γελάς.",
    "Μερικές φορές πιάνω τον εαυτό μου να χαμογελάει όταν βλέπω μήνυμά σου.",
    "Χαίρομαι που γνωριζόμαστε όλο και περισσότερο.",
    "Μου αρέσει που έχουμε ήδη τα δικά μας μικρά αστεία.",
    "Και επειδή ήθελα να σου κάνω μια μικρή έκπληξη... σου έχω αφήσει κάτι ακόμα. ❤️"
  ],
  letter: [
    { text: "Πουπουκάκι μου, ❤️", bold: true },
    { text: "Σου έφτιαξα αυτό το μικρό παιχνιδάκι γιατί ήθελα να σου κάνω μια μικρή έκπληξη. Κάτι λίγο διαφορετικό, μόνο για σένα." },
    { text: "Μου αρέσει πολύ να μιλάμε, να γελάμε και να πειραζόμαστε. Είναι ωραίο που ακόμα και μια απλή κουβέντα μαζί σου μπορεί να μου φτιάξει τη διάθεση." },
    { text: "Χαίρομαι πολύ που γνωριστήκαμε και που σιγά σιγά ανακαλύπτω όλο και περισσότερα πράγματα για σένα." },
    { text: "Ελπίζω αυτή η μικρή έκπληξη να σου έφτιαξε τη μέρα και να σε έκανε να χαμογελάσεις." },
    { text: "Ένα φιλί και ένα μπισκοτάκι μόνο για σένα. ❤️🍪", bold: true },
    { prefix: "Υ.Γ.", text: " Τα ψηφιακά μπισκοτάκια δεν τρώγονται, οπότε σου χρωστάω αληθινά!" }
  ]
};

// BIRTHDAY: for one day a year the little universe turns into a party.
// Change the texts here; the whole experience keys off the date below.
const BIRTHDAY = {
  month: 11,
  day: 3,
  timeZone: "Europe/Athens",
  title: "🎉 Happy birthday Πουπουκάκι μου! 🎂",
  heading: '<span class="birthday-hi">Happy birthday</span> Πουπουκάκι μου <span class="birthday-cake" aria-hidden="true">🎂</span>',
  intro: 'Μακάρι κάθε σου ευχή να γίνει πραγματικότητα και κάθε σου μέρα να σου δίνει έναν λόγο να χαμογελάς. 💕',
  videoId: "37GihMpoc24",
  videoUrl: "https://www.youtube.com/watch?v=37GihMpoc24",
  startSeconds: 20,
  colors: ["#ffe5a0", "#ffc6dc", "#e3d2ff", "#fff3dc", "#f79ec1", "#9fe3c9", "#ffd0a8"]
};

// `?birthday=1` previews the party, `?birthday=0` hides it, so it can be tested
// any day without waiting for 3 November.
function birthdayPreview() {
  const value = new URLSearchParams(window.location.search).get("birthday");
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

function isBirthdayToday() {
  const preview = birthdayPreview();
  if (preview !== null) return preview;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: BIRTHDAY.timeZone,
      month: "numeric",
      day: "numeric"
    }).formatToParts(new Date());
    const month = Number(parts.find(part => part.type === "month").value);
    const day = Number(parts.find(part => part.type === "day").value);
    return month === BIRTHDAY.month && day === BIRTHDAY.day;
  } catch {
    // Very old browsers: fall back to the device clock.
    const now = new Date();
    return now.getMonth() + 1 === BIRTHDAY.month && now.getDate() === BIRTHDAY.day;
  }
}

const birthdayMode = isBirthdayToday();

const stages = {
  welcome: document.getElementById("welcome"),
  game: document.getElementById("game"),
  surprise: document.getElementById("surprise"),
  letter: document.getElementById("letter")
};
const welcomeTitle = document.getElementById("welcome-title");
const welcomeIntro = document.getElementById("welcome-intro");
const defaultWelcomeTitle = welcomeTitle.innerHTML;
const lastSeenKey = "little-cookie-universe-last-seen";
const returnVisitGap = 30 * 60 * 1000;
const cookieButton = document.querySelector("[data-cookie]");
const cookieField = document.getElementById("cookie-field");
const progressCount = document.getElementById("progress-count");
const progressFill = document.getElementById("progress-fill");
const messageCard = document.getElementById("message-card");
const messageIndex = document.getElementById("message-index");
const messageText = document.getElementById("message-text");
const continueButton = document.getElementById("continue-button");
const envelopeButton = document.getElementById("envelope-button");
const letterBody = document.getElementById("letter-body");
const totalSteps = PERSONAL_TEXT.cookieMessages.length;
let step = 0;
let phase = "ready";
let collectionTimer = null;
let openingTimer = null;

function updateWelcomeGreeting() {
  try {
    const now = Date.now();
    const lastSeen = Number(window.sessionStorage.getItem(lastSeenKey));
    const key = "little-cookie-universe-visits";
    const previous = Number(window.localStorage.getItem(key));
    const previousVisit = Number.isSafeInteger(previous) && previous >= 1 && previous <= 3 ? previous : 0;
    const elapsed = now - lastSeen;
    const recentVisit = previousVisit > 0 && lastSeen > 0 && elapsed >= 0 && elapsed < returnVisitGap;
    const visit = recentVisit ? previousVisit : previousVisit % 3 + 1;
    if (!recentVisit) {
      window.localStorage.setItem(key, String(visit));
      window.sessionStorage.setItem(lastSeenKey, String(now));
    }
    welcomeTitle.innerHTML = defaultWelcomeTitle;
    if (birthdayMode) {
      // Birthday wins over the rotating return-visit greeting.
      welcomeTitle.innerHTML = BIRTHDAY.heading;
      return !recentVisit;
    }
    if (visit === 3) {
      welcomeTitle.textContent = "Πάλι εδώ είσαι, πουπούκι; 😂";
    }
    return !recentVisit;
  } catch {
    // Keep the usual greeting if browser storage is unavailable.
    return false;
  }
}

function markVisitEnd() {
  try {
    window.sessionStorage.setItem(lastSeenKey, String(Date.now()));
  } catch {
    // Browser storage may be unavailable.
  }
}

function resumeVisit() {
  if (updateWelcomeGreeting()) resetExperience();
}

function showStage(name) {
  for (const [stageName, element] of Object.entries(stages)) {
    element.hidden = stageName !== name;
  }
  document.body.classList.toggle("surprise-sky", name === "surprise" || name === "letter");
  window.scrollTo(0, 0);
  const heading = stages[name].querySelector("h1, h2");
  heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
}

function showCookieMessage(index) {
  messageCard.classList.remove("is-new");
  // Restart the small entrance animation even when cookies are tapped quickly.
  void messageCard.offsetWidth;
  messageIndex.textContent = `ΜΠΙΣΚΟΤΑΚΙ ${index + 1} ΑΠΟ ${totalSteps}`;
  messageText.textContent = PERSONAL_TEXT.cookieMessages[index];
  messageCard.classList.add("is-new");
}

function collectCookie() {
  if (phase !== "ready" || stages.game.hidden) return;

  phase = "collecting";
  cookieButton.disabled = true;
  cookieButton.classList.remove("is-entering");
  cookieButton.classList.add("is-collected");
  cookieField.classList.add("is-collected");
  progressCount.textContent = `${step + 1} / ${totalSteps}`;
  progressFill.style.width = `${((step + 1) / totalSteps) * 100}%`;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  collectionTimer = window.setTimeout(() => {
    collectionTimer = null;
    if (phase !== "collecting") return;
    showCookieMessage(step);
    continueButton.hidden = false;
    phase = "message";
  }, reducedMotion ? 0 : 480);
}

function continueJourney() {
  if (phase !== "message" || stages.game.hidden) return;
  phase = "advancing"; // A second tap cannot skip the next cookie.
  continueButton.hidden = true;

  if (step === totalSteps - 1) {
    phase = "complete";
    showStage("surprise");
    return;
  }

  step += 1;
  cookieButton.dataset.cookie = String(step);
  cookieButton.setAttribute("aria-label", `Μπισκοτάκι ${step + 1} από ${totalSteps}`);
  cookieButton.classList.remove("is-collected");
  cookieField.classList.remove("is-collected");
  cookieButton.classList.add("is-entering");
  cookieButton.disabled = false;
  messageCard.classList.remove("is-new");
  messageIndex.textContent = "ΕΝΑ ΜΙΚΡΟ ΜΥΣΤΙΚΟ";
  messageText.textContent = "Τα μπισκοτάκια περιμένουν να τα ανακαλύψεις.";
  phase = "ready";
  window.scrollTo(0, 0);
  cookieButton.focus({ preventScroll: true });
}

function renderLetter() {
  for (const line of PERSONAL_TEXT.letter) {
    const paragraph = document.createElement("p");
    if (line.prefix) {
      const prefix = document.createElement("strong");
      prefix.textContent = line.prefix;
      paragraph.append(prefix, document.createTextNode(line.text));
    } else if (line.bold) {
      const strong = document.createElement("strong");
      strong.textContent = line.text;
      paragraph.append(strong);
    } else {
      paragraph.textContent = line.text;
    }
    letterBody.append(paragraph);
  }
}

function resetExperience() {
  if (collectionTimer !== null) {
    window.clearTimeout(collectionTimer);
    collectionTimer = null;
  }
  if (openingTimer !== null) {
    window.clearTimeout(openingTimer);
    openingTimer = null;
  }
  step = 0;
  phase = "ready";
  cookieButton.dataset.cookie = "0";
  cookieButton.setAttribute("aria-label", `Μπισκοτάκι 1 από ${totalSteps}`);
  cookieButton.disabled = false;
  cookieButton.classList.remove("is-collected", "is-entering");
  cookieField.classList.remove("is-collected");
  progressCount.textContent = `0 / ${totalSteps}`;
  progressFill.style.width = "0%";
  messageIndex.textContent = "ΕΝΑ ΜΙΚΡΟ ΜΥΣΤΙΚΟ";
  messageText.textContent = "Τα μπισκοτάκια περιμένουν να τα ανακαλύψεις.";
  messageCard.classList.remove("is-new");
  continueButton.hidden = true;
  envelopeButton.disabled = false;
  envelopeButton.classList.remove("is-opening");
  showStage("welcome");
}

// A short canvas confetti burst. The canvas exists only while the party is on.
function startBirthdayConfetti() {
  const noop = { burst: () => {} };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return noop;

  const canvas = document.createElement("canvas");
  canvas.className = "birthday-confetti";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const context = canvas.getContext("2d");
  if (!context) {
    canvas.remove();
    return noop;
  }

  const maxParticles = 420;
  const particles = [];
  let width = 0;
  let height = 0;
  let frame = 0;
  let previous = 0;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function addParticle(x, y) {
    if (particles.length >= maxParticles) return;
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 7.5,
      vy: -4 - Math.random() * 8.5,
      size: 5 + Math.random() * 7,
      color: BIRTHDAY.colors[Math.floor(Math.random() * BIRTHDAY.colors.length)],
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.26,
      wobble: Math.random() * Math.PI * 2,
      life: 1,
      decay: 0.0032 + Math.random() * 0.0032,
      round: Math.random() < 0.3
    });
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    for (const particle of particles) {
      context.save();
      context.globalAlpha = Math.min(1, particle.life * 1.7);
      context.translate(particle.x, particle.y);
      context.rotate(particle.angle);
      context.fillStyle = particle.color;
      if (particle.round) {
        context.beginPath();
        context.arc(0, 0, particle.size * 0.36, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(-particle.size / 2, -particle.size * 0.28, particle.size, particle.size * 0.56);
      }
      context.restore();
    }
  }

  function tick(now) {
    // Normalise to 60fps steps so 120Hz screens do not speed the fall up.
    const delta = previous ? Math.min((now - previous) / 16.667, 3) : 1;
    previous = now;
    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index];
      particle.vx *= Math.pow(0.992, delta);
      particle.vy = particle.vy * Math.pow(0.994, delta) + 0.16 * delta;
      particle.wobble += 0.13 * delta;
      particle.x += (particle.vx + Math.sin(particle.wobble) * 0.9) * delta;
      particle.y += particle.vy * delta;
      particle.angle += particle.spin * delta;
      particle.life -= particle.decay * delta;
      if (particle.life <= 0 || particle.y > height + 60) particles.splice(index, 1);
    }
    draw();
    if (particles.length) {
      frame = window.requestAnimationFrame(tick);
    } else {
      frame = 0;
      previous = 0;
      context.clearRect(0, 0, width, height);
    }
  }

  function burst(count) {
    if (!frame) resize();
    for (let index = 0; index < count; index++) {
      addParticle(width * (0.1 + Math.random() * 0.8), height * (0.14 + Math.random() * 0.16));
    }
    if (!frame) frame = window.requestAnimationFrame(tick);
  }

  window.addEventListener("resize", () => {
    if (frame) resize();
  });
  resize();
  return { burst };
}

// A small YouTube player: the only external request, and only while the party is on.
function startBirthdayMusic() {
  const music = document.getElementById("birthday-music");
  const card = document.getElementById("birthday-music-card");
  const mount = document.getElementById("birthday-player");
  const toggle = document.getElementById("birthday-music-toggle");
  const expand = document.getElementById("birthday-music-expand");
  const artist = music && music.querySelector(".birthday-music__artist");
  if (!music || !card || !mount || !toggle || !expand) return { start() {} };

  let player = null;
  let wantsPlay = true;
  let failed = false;
  let muted = true;
  let gestureSeen = false;

  music.hidden = false;
  music.classList.add("is-loading");

  function setPlaying(playing) {
    music.classList.remove("is-loading");
    music.classList.toggle("is-playing", playing);
    music.classList.toggle("is-muted", muted);
    toggle.disabled = false;
    toggle.textContent = muted ? "🔊" : playing ? "❙❙" : "▶";
    toggle.setAttribute("aria-pressed", String(playing && !muted));
    toggle.setAttribute("aria-label", muted ? "Πάτα για μουσική" : playing ? "Παύση τραγουδιού" : "Παίξε το τραγούδι");
    if (artist) artist.textContent = muted ? "Πάτα για μουσική" : "Kool & The Gang";
  }

  function fail() {
    if (failed) return;
    failed = true;
    music.classList.remove("is-loading", "is-playing");
    music.classList.add("is-error");
    toggle.disabled = true;
    const link = document.createElement("a");
    link.className = "birthday-music__title";
    link.href = BIRTHDAY.videoUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Celebration ↗";
    card.querySelector(".birthday-music__title").replaceWith(link);
  }

  function createPlayer() {
    if (failed || player || !window.YT || !window.YT.Player) return;
    try {
      player = new window.YT.Player(mount, {
        videoId: BIRTHDAY.videoId,
        playerVars: { autoplay: 0, playsinline: 1, rel: 0, controls: 0, start: BIRTHDAY.startSeconds },
        events: {
          onReady: () => {
            setPlaying(false);
            if (player.setVolume) player.setVolume(70);
            // If she already tapped while the player was still loading, the browser
            // still counts that gesture: start right away.
            if (!gestureSeen) return;
            muted = false;
            player.playVideo();
            window.setTimeout(() => {
              if (!player || failed) return;
              const state = player.getPlayerState();
              if (state !== window.YT.PlayerState.PLAYING && state !== window.YT.PlayerState.BUFFERING) setPlaying(false);
            }, 700);
          },
          onStateChange: event => {
            if (event.data === window.YT.PlayerState.ENDED) {
              // "The whole song", on repeat from the good part, as long as she keeps it open.
              player.seekTo(BIRTHDAY.startSeconds, true);
              if (wantsPlay) player.playVideo();
              return;
            }
            if (event.data === window.YT.PlayerState.PLAYING) setPlaying(true);
            if (event.data === window.YT.PlayerState.PAUSED) setPlaying(false);
          },
          onError: fail
        }
      });
    } catch {
      // The embed itself failed: keep the birthday page, offer the song as a link.
      fail();
    }
  }

  function startPlayback() {
    if (failed) return;
    gestureSeen = true;
    wantsPlay = true;
    if (!player) return;
    if (player.unMute) player.unMute();
    if (player.setVolume) player.setVolume(70);
    muted = false;
    const state = player.getPlayerState();
    const rolling = state === window.YT.PlayerState.PLAYING || state === window.YT.PlayerState.BUFFERING;
    if (!rolling && player.playVideo) player.playVideo();
    // The gesture is there, so show it as playing; onStateChange corrects a real pause.
    setPlaying(true);
  }

  // Browsers allow sound only after a gesture: the first tap outside the player starts it.
  function startOnFirstGesture(event) {
    if (failed) return;
    const control = event.target instanceof Element ? event.target.closest("#birthday-music-toggle, #birthday-music-expand") : null;
    if (control) return;
    document.removeEventListener("pointerdown", startOnFirstGesture);
    document.removeEventListener("keydown", startOnFirstGesture);
    startPlayback();
  }
  document.addEventListener("pointerdown", startOnFirstGesture, { passive: true });
  document.addEventListener("keydown", startOnFirstGesture);

  toggle.addEventListener("click", () => {
    if (!player || failed) return;
    if (muted) {
      // Sound is not unlocked yet: this tap is the gesture that starts the song.
      startPlayback();
      return;
    }
    const playing = player.getPlayerState() === window.YT.PlayerState.PLAYING;
    if (playing) {
      wantsPlay = false;
      player.pauseVideo();
      setPlaying(false);
    } else {
      startPlayback();
    }
  });
  expand.addEventListener("click", () => {
    const expanded = card.classList.toggle("is-expanded");
    expand.setAttribute("aria-expanded", String(expanded));
    expand.setAttribute("aria-label", expanded ? "Σμίκρυνση βίντεο" : "Μεγέθυνση βίντεο");
  });

  if (window.YT && window.YT.Player) {
    createPlayer();
    return { start: startPlayback };
  }
  window.onYouTubeIframeAPIReady = createPlayer;
  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  script.async = true;
  script.onerror = fail;
  document.head.append(script);
  window.setTimeout(() => {
    if (!player) fail();
  }, 12000);
  return { start: startPlayback };
}

let birthdayConfetti = null;

function startBirthday() {
  document.body.classList.add("birthday");
  document.title = BIRTHDAY.title;
  if (welcomeIntro) welcomeIntro.innerHTML = BIRTHDAY.intro;
  birthdayConfetti = startBirthdayConfetti();

  const music = startBirthdayMusic();
  const gate = document.getElementById("birthday-gate");
  const gateButton = document.getElementById("birthday-gate-button");
  if (!gate || !gateButton) {
    celebrate();
    music.start();
    return;
  }

  // The gate exists because no browser plays audio before a real tap: her first
  // touch is the gesture that starts both the song and the confetti.
  gate.hidden = false;
  const enter = () => {
    if (gate.hidden) return;
    gate.hidden = true;
    celebrate();
    music.start();
  };
  gate.addEventListener("click", enter);
  gateButton.focus({ preventScroll: true });
}

function celebrate() {
  if (!birthdayConfetti) return;
  birthdayConfetti.burst(120);
  [700, 1600, 2800, 4200].forEach((delay, index) => {
    window.setTimeout(() => birthdayConfetti.burst(64 - index * 8), delay);
  });
}

document.getElementById("start-button").addEventListener("click", () => {
  showStage("game");
  if (birthdayConfetti) birthdayConfetti.burst(70);
});
cookieButton.addEventListener("click", collectCookie);
cookieButton.addEventListener("animationend", event => {
  if (event.animationName === "cookie-appear") cookieButton.classList.remove("is-entering");
});
continueButton.addEventListener("click", continueJourney);
envelopeButton.addEventListener("click", () => {
  if (phase !== "complete" || stages.surprise.hidden || envelopeButton.disabled) return;
  phase = "opening";
  envelopeButton.disabled = true;
  envelopeButton.classList.add("is-opening");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  openingTimer = window.setTimeout(() => {
    openingTimer = null;
    phase = "letter";
    showStage("letter");
    if (birthdayConfetti) birthdayConfetti.burst(130);
  }, reducedMotion ? 0 : 850);
});
document.getElementById("replay-button").addEventListener("click", resetExperience);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) markVisitEnd();
  else resumeVisit();
});
window.addEventListener("pagehide", markVisitEnd);
window.addEventListener("pageshow", event => {
  if (event.persisted) resumeVisit();
});

updateWelcomeGreeting();
renderLetter();
if (birthdayMode) startBirthday();
