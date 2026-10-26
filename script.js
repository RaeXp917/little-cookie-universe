"use strict";

// PERSONAL TEXT: edit the seven cookie messages and letter here.
const PERSONAL_TEXT = {
  cookieMessages: [
    "Ένα μπισκοτάκι για το όμορφο χαμόγελό σου. 🍪",
    "Μου αρέσει που μπορούμε να μιλάμε για τα πάντα, ακόμα και για τις πιο άκυρες βλακείες.",
    "Έχεις έναν πολύ γλυκό τρόπο να μου φτιάχνεις τη διάθεση.",
    "Μου αρέσουν τα γέλια μας και τα μικρά μας πειράγματα.",
    "Χαίρομαι που σε γνωρίζω όλο και περισσότερο.",
    "Μου αρέσει που έχουμε ήδη τα δικά μας μικρά αστεία.",
    "Τελευταίο μπισκοτάκι! Αλλά σου έχω κρατήσει κάτι ακόμα... 💌"
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
const cookieButtons = [...document.querySelectorAll("[data-cookie]")];
const progressCount = document.getElementById("progress-count");
const progressFill = document.getElementById("progress-fill");
const messageCard = document.getElementById("message-card");
const messageIndex = document.getElementById("message-index");
const messageText = document.getElementById("message-text");
const continueButton = document.getElementById("continue-button");
const envelopeButton = document.getElementById("envelope-button");
const letterBody = document.getElementById("letter-body");
const collected = new Set();
let openingTimer = null;

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
  messageIndex.textContent = `ΜΠΙΣΚΟΤΑΚΙ ${index + 1} ΑΠΟ 7`;
  messageText.textContent = PERSONAL_TEXT.cookieMessages[index];
  messageCard.classList.add("is-new");
}

function collectCookie(button) {
  const index = Number(button.dataset.cookie);
  if (collected.has(index) || stages.game.hidden) return;

  collected.add(index);
  button.disabled = true;
  button.classList.add("is-collected");
  const count = collected.size;
  progressCount.textContent = `${count} / ${cookieButtons.length}`;
  progressFill.style.width = `${(count / cookieButtons.length) * 100}%`;
  showCookieMessage(index);

  if (count === cookieButtons.length) {
    continueButton.hidden = false;
  }
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
  if (openingTimer !== null) {
    window.clearTimeout(openingTimer);
    openingTimer = null;
  }
  collected.clear();
  for (const button of cookieButtons) {
    button.disabled = false;
    button.classList.remove("is-collected");
  }
  progressCount.textContent = `0 / ${cookieButtons.length}`;
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
cookieButtons.forEach(button => button.addEventListener("click", () => collectCookie(button)));
continueButton.addEventListener("click", () => {
  if (collected.size === cookieButtons.length) showStage("surprise");
});
envelopeButton.addEventListener("click", () => {
  if (collected.size !== cookieButtons.length || envelopeButton.disabled) return;
  envelopeButton.disabled = true;
  envelopeButton.classList.add("is-opening");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  openingTimer = window.setTimeout(() => {
    openingTimer = null;
    showStage("letter");
  }, reducedMotion ? 0 : 850);
});
document.getElementById("replay-button").addEventListener("click", resetExperience);

renderLetter();
