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

const stages = {
  welcome: document.getElementById("welcome"),
  game: document.getElementById("game"),
  surprise: document.getElementById("surprise"),
  letter: document.getElementById("letter")
};
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
    const key = "little-cookie-universe-visits";
    const previous = Number(window.localStorage.getItem(key));
    const visit = (Number.isSafeInteger(previous) && previous >= 0 ? previous : 0) % 3 + 1;
    window.localStorage.setItem(key, String(visit));
    if (visit === 3) {
      document.getElementById("welcome-title").textContent = "Πάλι εδώ είσαι, πουπούκι; 😂";
    }
  } catch {
    // Keep the usual greeting if browser storage is unavailable.
  }
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

document.getElementById("start-button").addEventListener("click", () => showStage("game"));
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
  }, reducedMotion ? 0 : 850);
});
document.getElementById("replay-button").addEventListener("click", resetExperience);

updateWelcomeGreeting();
renderLetter();
