const actionMeta = {
  boost: { name: "Boost (+3)", needsTarget: false },
  shield: { name: "Shield", needsTarget: false },
  swap: { name: "Swap", needsTarget: true },
  double: { name: "Double Down", needsTarget: false },
  drain: { name: "Drain (-3)", needsTarget: true },
  steal: { name: "Steal Point", needsTarget: false },
};

const numberDistribution = [
  { value: 1, copies: 9 },
  { value: 2, copies: 9 },
  { value: 3, copies: 9 },
  { value: 4, copies: 9 },
  { value: 5, copies: 8 },
  { value: 6, copies: 8 },
  { value: 7, copies: 8 },
  { value: 8, copies: 8 },
  { value: 9, copies: 6 },
  { value: 10, copies: 6 },
  { value: 11, copies: 5 },
  { value: 12, copies: 5 },
];

const actionDistribution = {
  boost: 7,
  shield: 6,
  drain: 6,
  swap: 4,
  double: 4,
  steal: 3,
};

const state = {
  activeTab: "play",
  difficulty: "medium",
  totalRounds: 15,
  currentRound: 0,
  phase: "waiting",
  players: [],
  logs: [],
  winnerText: "",
  selectedNumberId: null,
  selectedActionId: null,
  selectedTargetId: null,
  revealEntries: [],
  revealMode: "idle",
  rating: 1200,
  lastRatingDelta: 0,
  comboDatabase: new Map(),
  reviewEntries: [],
  pendingReview: null,
  roundHistory: [],
  ratingCommitted: false,
  ratingActive: false,
  handIntro: false,
};

let cardId = 0;
let revealTimer = null;
let dealTimer = null;
let tableClearTimer = null;
const RATING_KEY = "deck-of-destiny-rating";
const SETTINGS_KEY = "deck-of-destiny-settings";

const tabButtons = document.querySelectorAll(".nav-tab");
const playPanel = document.querySelector("#tab-play");
const rulesPanel = document.querySelector("#tab-rules");
const settingsPanel = document.querySelector("#tab-settings");
const lobbyScreen = document.querySelector("#lobby-screen");
const tableScreen = document.querySelector("#table-screen");
const deckStack = document.querySelector("#deck-stack");
const magicTrail = document.querySelector("#magic-trail");

const playerCountSelect = document.querySelector("#player-count");
const difficultySelect = document.querySelector("#ai-difficulty");
const startButton = document.querySelector("#start-game");
const newMatchButton = document.querySelector("#new-match");
const playAgainButton = document.querySelector("#play-again");
const viewReviewButton = document.querySelector("#view-review");
const roundLabel = document.querySelector("#round-label");
const phasePill = document.querySelector("#phase-pill");
const difficultyPill = document.querySelector("#difficulty-pill");
const tableRatingPill = document.querySelector("#table-rating-pill");
const statusMessage = document.querySelector("#status-message");
const selectionTitle = document.querySelector("#selection-title");
const selectionText = document.querySelector("#selection-text");
const yourPoints = document.querySelector("#your-points");
const opponentRow = document.querySelector("#opponent-row");
const trickArea = document.querySelector("#trick-area");
const scoreboard = document.querySelector("#scoreboard");
const roundLog = document.querySelector("#round-log");
const numberHand = document.querySelector("#number-hand");
const actionHand = document.querySelector("#action-hand");
const targetCard = document.querySelector("#target-card");
const targetGrid = document.querySelector("#target-grid");
const targetHint = document.querySelector("#target-hint");
const playRoundButton = document.querySelector("#play-round");
const clearSelectionButton = document.querySelector("#clear-selection");
const clearNumberButton = document.querySelector("#clear-number");
const clearActionButton = document.querySelector("#clear-action");
const winOverlay = document.querySelector("#win-overlay");
const winTitle = document.querySelector("#win-title");
const winText = document.querySelector("#win-text");
const ratingValue = document.querySelector("#rating-value");
const ratingTier = document.querySelector("#rating-tier");
const ratingNote = document.querySelector("#rating-note");
const ratingResult = document.querySelector("#rating-result");
const reviewSummary = document.querySelector("#review-summary");
const reviewList = document.querySelector("#review-list");
const starTrailSetting = document.querySelector("#setting-star-trail");
const soundSetting = document.querySelector("#setting-sound");
const glowSetting = document.querySelector("#setting-glow");
const reducedMotionSetting = document.querySelector("#setting-reduced-motion");

const settingsState = {
  starTrail: true,
  sound: true,
  glow: true,
  reducedMotion: false,
};

let audioContext = null;

function safeReadRating() {
  try {
    const raw = window.localStorage.getItem(RATING_KEY);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  } catch (_error) {
    return 1200;
  }
  return 1200;
}

function safeWriteRating(value) {
  try {
    window.localStorage.setItem(RATING_KEY, String(value));
  } catch (_error) {
    return;
  }
}

function safeReadSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return;
    settingsState.starTrail = parsed.starTrail !== false;
    settingsState.sound = parsed.sound !== false;
    settingsState.glow = parsed.glow !== false;
    settingsState.reducedMotion = parsed.reducedMotion === true;
  } catch (_error) {
    return;
  }
}

function safeWriteSettings() {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsState));
  } catch (_error) {
    return;
  }
}

function totalNumberCopies(value) {
  return numberDistribution.find((entry) => entry.value === value)?.copies || 0;
}

function totalActionCopies(type) {
  return actionDistribution[type] || 0;
}

function nextCardId() {
  cardId += 1;
  return `card-${cardId}`;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function difficultyLabel(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function applySettingsToDocument() {
  document.body.classList.toggle("no-glow", !settingsState.glow);
  document.body.classList.toggle("reduced-motion", settingsState.reducedMotion);
  starTrailSetting.checked = settingsState.starTrail;
  soundSetting.checked = settingsState.sound;
  glowSetting.checked = settingsState.glow;
  reducedMotionSetting.checked = settingsState.reducedMotion;
}

function ensureAudioContext() {
  if (!settingsState.sound) return null;
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    audioContext = new AudioCtor();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playToneSequence(sequence) {
  const ctx = ensureAudioContext();
  if (!ctx || settingsState.reducedMotion) return;
  const start = ctx.currentTime;

  sequence.forEach((tone, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = tone.type || "sine";
    oscillator.frequency.value = tone.frequency;
    gain.gain.setValueAtTime(0.0001, start + tone.at);
    gain.gain.exponentialRampToValueAtTime(tone.volume ?? 0.045, start + tone.at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.at + tone.duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start + tone.at);
    oscillator.stop(start + tone.at + tone.duration + 0.02);
  });
}

function playUiSound(kind) {
  if (!settingsState.sound) return;
  if (kind === "click") {
    playToneSequence([{ frequency: 612, at: 0, duration: 0.08, volume: 0.018, type: "sine" }]);
  } else if (kind === "deal") {
    playToneSequence([
      { frequency: 294, at: 0, duration: 0.09, volume: 0.018, type: "triangle" },
      { frequency: 392, at: 0.08, duration: 0.09, volume: 0.016, type: "triangle" },
    ]);
  } else if (kind === "reveal") {
    playToneSequence([
      { frequency: 432, at: 0, duration: 0.11, volume: 0.02, type: "sine" },
      { frequency: 648, at: 0.1, duration: 0.13, volume: 0.018, type: "triangle" },
    ]);
  } else if (kind === "win") {
    playToneSequence([
      { frequency: 523.25, at: 0, duration: 0.12, volume: 0.03, type: "triangle" },
      { frequency: 698.46, at: 0.12, duration: 0.13, volume: 0.03, type: "triangle" },
      { frequency: 880, at: 0.26, duration: 0.21, volume: 0.03, type: "sine" },
    ]);
  }
}

function spawnSparkle(x, y) {
  if (!settingsState.starTrail || settingsState.reducedMotion) return;
  const star = document.createElement("span");
  star.className = "spark-star";
  star.style.left = `${x}px`;
  star.style.top = `${y}px`;
  star.style.setProperty("--spark-dx", `${Math.round(randomBetween(-14, 14))}px`);
  star.style.setProperty("--spark-dy", `${Math.round(randomBetween(-18, -4))}px`);
  star.style.setProperty("--spark-rot", `${Math.round(randomBetween(-40, 40))}deg`);
  const core = document.createElement("i");
  core.setAttribute("aria-hidden", "true");
  star.appendChild(core);
  magicTrail.appendChild(star);
  window.setTimeout(() => {
    star.remove();
  }, 700);
}

function displayedDifficulty() {
  return state.phase === "waiting" ? difficultySelect.value : state.difficulty;
}

function ratingTierLabel(rating) {
  if (rating >= 1700) return "Oracle Master";
  if (rating >= 1500) return "High Table";
  if (rating >= 1300) return "Rising Fortune";
  if (rating >= 1100) return "Rookie Table";
  return "New Challenger";
}

function comboKey(numberValue, actionType) {
  return `${numberValue ?? "none"}|${actionType ?? "none"}`;
}

function getComboRecord(numberValue, actionType) {
  const key = comboKey(numberValue, actionType);
  if (state.comboDatabase.has(key)) {
    return state.comboDatabase.get(key);
  }

  let baseScore = 0;
  let volatility = 0;
  let label = "";

  if (numberValue !== null) {
    baseScore += numberValue;
    volatility += numberValue >= 9 ? 1.1 : numberValue <= 4 ? 0.4 : 0.7;
    label = `Number ${numberValue}`;
  }

  if (actionType) {
    const actionBonus =
      actionType === "boost" ? 2.8 :
      actionType === "shield" ? 2.1 :
      actionType === "swap" ? 3.2 :
      actionType === "double" ? 3.5 :
      actionType === "drain" ? 2.9 :
      2.4;
    const actionVolatility =
      actionType === "shield" ? 0.8 :
      actionType === "boost" ? 0.9 :
      actionType === "drain" ? 1 :
      actionType === "double" ? 1.4 :
      actionType === "swap" ? 1.5 :
      1.25;
    baseScore += actionBonus;
    volatility += actionVolatility;
    label = label ? `${label} + ${actionMeta[actionType].name}` : actionMeta[actionType].name;
  }

  const record = {
    key,
    label: label || "Pass",
    baseScore,
    volatility,
  };
  state.comboDatabase.set(key, record);
  return record;
}

function buildSeenSnapshot() {
  const numbersSeen = new Map();
  const actionsSeen = new Map();
  let totalNumbersSeen = 0;
  let totalActionsSeen = 0;

  state.roundHistory.forEach((round) => {
    round.entries.forEach((entry) => {
      if (entry.numberCard) {
        numbersSeen.set(entry.numberCard.value, (numbersSeen.get(entry.numberCard.value) || 0) + 1);
        totalNumbersSeen += 1;
      }
      if (entry.actionCard) {
        actionsSeen.set(entry.actionCard.type, (actionsSeen.get(entry.actionCard.type) || 0) + 1);
        totalActionsSeen += 1;
      }
    });
  });

  return {
    roundsObserved: state.roundHistory.length,
    numbersSeen,
    actionsSeen,
    totalNumbersSeen,
    totalActionsSeen,
  };
}

function ensureComboDatabase() {
  for (let numberValue = 1; numberValue <= 12; numberValue += 1) {
    getComboRecord(numberValue, null);
    Object.keys(actionMeta).forEach((actionType) => {
      getComboRecord(numberValue, actionType);
    });
  }
  Object.keys(actionMeta).forEach((actionType) => {
    getComboRecord(null, actionType);
  });
}

function createNumberDeck() {
  const deck = [];
  numberDistribution.forEach(({ value, copies }) => {
    for (let count = 0; count < copies; count += 1) {
      deck.push({ id: nextCardId(), kind: "number", value });
    }
  });
  return shuffle(deck);
}

function createActionDeck() {
  const deck = [];
  Object.entries(actionDistribution).forEach(([type, copies]) => {
    for (let count = 0; count < copies; count += 1) {
      deck.push({ id: nextCardId(), kind: "action", type, label: actionMeta[type].name });
    }
  });
  return shuffle(deck);
}

function dealBalancedNumberHands(playerCount) {
  const deck = createNumberDeck().sort((a, b) => b.value - a.value);
  const hands = Array.from({ length: playerCount }, () => []);
  let forward = true;

  for (let start = 0; start < deck.length; start += playerCount) {
    const chunk = shuffle(deck.slice(start, start + playerCount));
    const order = forward
      ? Array.from({ length: playerCount }, (_, index) => index)
      : Array.from({ length: playerCount }, (_, index) => playerCount - 1 - index);

    chunk.forEach((card, index) => {
      const seat = order[index % order.length];
      hands[seat].push(card);
    });

    forward = !forward;
  }

  return hands.map((hand) => hand.slice(0, 15).sort((a, b) => a.value - b.value));
}

function dealCards(playerCount) {
  const numberHands = dealBalancedNumberHands(playerCount);
  const actionDeck = createActionDeck();
  const players = [];

  for (let index = 0; index < playerCount; index += 1) {
    const isHuman = index === 0;
    players.push({
      id: `player-${index + 1}`,
      name: isHuman ? "You" : `Bot ${index}`,
      isHuman,
      aiDifficulty: isHuman ? null : state.difficulty,
      botProfile: isHuman ? null : createBotProfile(state.difficulty),
      points: 0,
      numbers: numberHands[index],
      actions: actionDeck.splice(0, 5),
      lastPlayed: null,
    });
  }

  return players;
}

function setActiveTab(tab) {
  state.activeTab = tab;
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  playPanel.classList.toggle("active", tab === "play");
  rulesPanel.classList.toggle("active", tab === "rules");
  settingsPanel.classList.toggle("active", tab === "settings");
}

function setPlayScreen(mode) {
  const showTable = mode === "table";
  lobbyScreen.hidden = showTable;
  tableScreen.hidden = !showTable;
}

function clearTimers() {
  if (revealTimer) window.clearTimeout(revealTimer);
  if (dealTimer) window.clearTimeout(dealTimer);
  if (tableClearTimer) window.clearTimeout(tableClearTimer);
  revealTimer = null;
  dealTimer = null;
  tableClearTimer = null;
}

function getHumanPlayer() {
  return state.players.find((player) => player.isHuman) || null;
}

function currentSelection() {
  const human = getHumanPlayer();
  if (!human) return { number: null, action: null };

  return {
    number: human.numbers.find((card) => card.id === state.selectedNumberId) || null,
    action: human.actions.find((card) => card.id === state.selectedActionId) || null,
  };
}

function actionNeedsTarget(actionCard) {
  return Boolean(actionCard && actionMeta[actionCard.type].needsTarget);
}

function describePlay(play) {
  const parts = [];
  if (play.numberCard) parts.push(`Number ${play.numberCard.value}`);
  if (play.actionCard) parts.push(play.actionCard.label);
  return parts.length ? parts.join(" + ") : "No cards";
}

function actionGlyph(type) {
  return (
    {
      boost: "✨",
      shield: "🛡",
      swap: "🜂",
      double: "✶",
      drain: "☾",
      steal: "🜁",
    }[type] || "🔮"
  );
}

function numberGlyph(value) {
  if (value >= 10) return "🔮";
  if (value >= 7) return "✦";
  if (value >= 4) return "☽";
  return "✧";
}

function pickRandom(items) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createBotProfile(difficulty) {
  const base =
    difficulty === "easy"
      ? { actionBias: 0.68, highBias: 0.3, bluffBias: 0.55, greedBias: 0.58 }
      : difficulty === "hard"
        ? { actionBias: 0.46, highBias: 0.68, bluffBias: 0.28, greedBias: 0.44 }
        : { actionBias: 0.56, highBias: 0.5, bluffBias: 0.42, greedBias: 0.5 };

  return {
    actionBias: Math.max(0.2, Math.min(0.82, randomBetween(base.actionBias - 0.12, base.actionBias + 0.12))),
    highBias: Math.max(0.2, Math.min(0.84, randomBetween(base.highBias - 0.14, base.highBias + 0.14))),
    bluffBias: Math.max(0.12, Math.min(0.8, randomBetween(base.bluffBias - 0.15, base.bluffBias + 0.15))),
    greedBias: Math.max(0.18, Math.min(0.82, randomBetween(base.greedBias - 0.12, base.greedBias + 0.12))),
  };
}

function weightedPick(items, scorer) {
  if (!items.length) return null;
  const scored = items.map((item) => ({ item, score: Math.max(0.01, scorer(item)) }));
  const total = scored.reduce((sum, entry) => sum + entry.score, 0);
  let roll = Math.random() * total;
  for (const entry of scored) {
    roll -= entry.score;
    if (roll <= 0) return entry.item;
  }
  return scored[scored.length - 1].item;
}

function getNumberBands(numbers) {
  const sorted = [...numbers].sort((a, b) => a.value - b.value);
  const sliceSize = Math.max(1, Math.ceil(sorted.length / 3));
  const mid = sorted.slice(sliceSize, Math.max(sliceSize + 1, sorted.length - sliceSize));
  return {
    sorted,
    low: sorted.slice(0, sliceSize),
    mid: mid.length ? mid : sorted,
    high: sorted.slice(Math.max(0, sorted.length - sliceSize)),
  };
}

function getActionPriorityForDifficulty(numberValue, difficulty) {
  if (difficulty === "easy") {
    if (numberValue >= 8) return { boost: 0, double: 1, swap: 2, shield: 3, drain: 4, steal: 5 };
    return { steal: 0, double: 1, boost: 2, swap: 3, drain: 4, shield: 5 };
  }

  if (difficulty === "hard") {
    if (numberValue >= 9) return { shield: 0, boost: 1, double: 2, drain: 3, swap: 4, steal: 5 };
    if (numberValue <= 4) return { shield: 0, drain: 1, steal: 2, swap: 3, boost: 4, double: 5 };
    return { drain: 0, boost: 1, shield: 2, swap: 3, double: 4, steal: 5 };
  }

  if (numberValue >= 8) return { boost: 0, shield: 1, double: 2, drain: 3, swap: 4, steal: 5 };
  if (numberValue <= 4) return { shield: 0, drain: 1, boost: 2, steal: 3, swap: 4, double: 5 };
  return { shield: 0, boost: 1, drain: 2, swap: 3, double: 4, steal: 5 };
}

function sortActionsForDifficulty(actions, numberValue, difficulty) {
  const order = getActionPriorityForDifficulty(numberValue, difficulty);
  return [...actions].sort((a, b) => (order[a.type] ?? 99) - (order[b.type] ?? 99));
}

function botTargetFor(player, actionType, otherPlayers) {
  if (!otherPlayers.length) return null;
  const sorted = [...otherPlayers].sort((a, b) => b.points - a.points);
  if (actionType === "drain" || actionType === "swap") return sorted[0].id;
  return otherPlayers[0].id;
}

function buildHandState(player) {
  return {
    numbers: player.numbers.map((card) => ({ id: card.id, value: card.value })),
    actions: player.actions.map((card) => ({ id: card.id, type: card.type, label: card.label })),
  };
}

function enumerateBotPlays(player) {
  const opponents = state.players.filter((candidate) => candidate.id !== player.id);
  const plays = [];

  player.numbers.forEach((numberCard) => {
    plays.push({ numberCard, actionCard: null, targetId: null });
  });

  player.actions.forEach((actionCard) => {
    if (actionNeedsTarget(actionCard)) {
      opponents.forEach((target) => {
        plays.push({ numberCard: null, actionCard, targetId: target.id });
      });
    } else {
      plays.push({ numberCard: null, actionCard, targetId: null });
    }
  });

  player.numbers.forEach((numberCard) => {
    player.actions.forEach((actionCard) => {
      if (actionNeedsTarget(actionCard)) {
        opponents.forEach((target) => {
          plays.push({ numberCard, actionCard, targetId: target.id });
        });
      } else {
        plays.push({ numberCard, actionCard, targetId: null });
      }
    });
  });

  return plays;
}

function scoreBotCandidate(player, play, difficulty, seen) {
  const ranking = [...state.players].sort((a, b) => b.points - a.points);
  const currentLeader = ranking[0];
  const roundPressure = (state.currentRound + 1) / state.totalRounds;
  const target = play.targetId ? state.players.find((entry) => entry.id === play.targetId) : null;
  const numberValue = play.numberCard ? play.numberCard.value : 0;
  const actionType = play.actionCard ? play.actionCard.type : null;
  const behind = player.points < currentLeader.points;
  const protectingLead = player.id === currentLeader.id && !behind;
  const unseenTwelves = Math.max(0, totalNumberCopies(12) - (seen.numbersSeen.get(12) || 0));
  const unseenElevens = Math.max(0, totalNumberCopies(11) - (seen.numbersSeen.get(11) || 0));

  let score = numberValue;
  score += numberValue >= 9 ? (behind ? 1.25 : 0.1) : 0;
  score += numberValue <= 4 ? (difficulty === "easy" ? 0.3 : -0.25) : 0;

  if (protectingLead && roundPressure < 0.55 && numberValue >= 10) score -= difficulty === "hard" ? 1.15 : 0.7;
  if (difficulty === "hard" && roundPressure < 0.35 && numberValue >= 11 && unseenTwelves + unseenElevens > 5) score -= 1.1;
  if (difficulty === "hard" && roundPressure > 0.7 && numberValue >= 8) score += 0.9;
  if (difficulty === "medium" && roundPressure > 0.72 && numberValue >= 9) score += 0.55;

  if (actionType === "shield") {
    score += numberValue >= 8 ? 1.25 : 0.4;
    score += protectingLead ? 0.55 : 0;
  }

  if (actionType === "boost") {
    score += numberValue >= 6 && numberValue <= 9 ? 1.35 : 0.35;
    if (!play.numberCard) score -= 0.9;
  }

  if (actionType === "double") {
    score += numberValue >= 6 && numberValue <= 9 ? 1.7 : 0.15;
    if (!play.numberCard || numberValue <= 3) score -= 1.1;
  }

  if (actionType === "swap") {
    score += numberValue <= 5 ? 1.5 : -0.15;
    if (target) score += target.points * 0.24;
  }

  if (actionType === "drain") {
    if (target) {
      score += target.points * 0.26;
      score += target.id === currentLeader.id ? 0.55 : 0;
    } else {
      score -= 0.9;
    }
  }

  if (actionType === "steal") {
    score += behind ? 1.1 : -0.8;
    score += numberValue >= 8 ? -0.45 : 0.3;
  }

  if (difficulty === "easy") {
    score += Math.random() * 0.65;
  } else if (difficulty === "medium") {
    score += Math.random() * 0.28;
  } else {
    score += Math.random() * 0.08;
  }

  return score;
}

function findTargetForReview(play, players) {
  if (!play.actionCard || !actionNeedsTarget(play.actionCard)) return null;
  return players.find((player) => player.id === play.targetId) || null;
}

function scorePlayCandidate(play, context) {
  const human = context.human;
  const leaders = [...context.players].sort((a, b) => b.points - a.points);
  const currentLeader = leaders[0];
  const numberValue = play.numberCard ? play.numberCard.value : null;
  const actionType = play.actionCard ? play.actionCard.type : null;
  const record = getComboRecord(numberValue, actionType);
  const target = findTargetForReview(play, context.players);
  const reasons = [];

  let score = record.baseScore;
  const roundPressure = context.round / context.totalRounds;
  const ahead = currentLeader && human.points >= currentLeader.points;
  const ownNumberCounts = new Map();
  human.numbers.forEach((card) => {
    ownNumberCounts.set(card.value, (ownNumberCounts.get(card.value) || 0) + 1);
  });
  const ownActionCounts = new Map();
  human.actions.forEach((card) => {
    ownActionCounts.set(card.type, (ownActionCounts.get(card.type) || 0) + 1);
  });
  const unseenHighNumbers = [10, 11, 12].reduce((sum, value) => (
    sum
    + Math.max(
      0,
      totalNumberCopies(value)
      - (context.seen.numbersSeen.get(value) || 0)
      - (ownNumberCounts.get(value) || 0)
      - (numberValue === value ? 1 : 0)
    )
  ), 0);
  const unseenAggroActions = ["drain", "swap", "double"].reduce((sum, type) => (
    sum
    + Math.max(
      0,
      totalActionCopies(type)
      - (context.seen.actionsSeen.get(type) || 0)
      - (ownActionCounts.get(type) || 0)
      - (actionType === type ? 1 : 0)
    )
  ), 0);
  const unseenShields = Math.max(
    0,
    totalActionCopies("shield")
    - (context.seen.actionsSeen.get("shield") || 0)
    - (ownActionCounts.get("shield") || 0)
    - (actionType === "shield" ? 1 : 0)
  );
  const topCardsAlreadyGone = (context.seen.numbersSeen.get(11) || 0) + (context.seen.numbersSeen.get(12) || 0);
  const lowCardsSeen = [1, 2, 3, 4].reduce((sum, value) => sum + (context.seen.numbersSeen.get(value) || 0), 0);

  if (numberValue !== null) {
    if (ahead && roundPressure < 0.45 && numberValue >= 10) score -= 1.25;
    if (!ahead && roundPressure > 0.55 && numberValue >= 9) score += 1.1;
    if (ahead && numberValue >= 11) score -= 0.65;
    if (roundPressure < 0.25 && numberValue <= 5) score += 0.3;
    if (unseenHighNumbers <= 4 && numberValue >= 8) {
      score += 0.75;
      reasons.push("most of the top-end numbers are already gone");
    }
    if (unseenHighNumbers >= 10 && numberValue >= 10 && roundPressure < 0.6) {
      score -= 0.65;
      reasons.push("too many big numbers are still hidden, so spending a premium card now is risky");
    }
    if (lowCardsSeen >= 10 && numberValue >= 6 && numberValue <= 8) {
      score += 0.35;
      reasons.push("mid cards gain value once lots of low cards have already appeared");
    }
  }

  if (!actionType && numberValue !== null && numberValue >= 9 && roundPressure < 0.3) {
    score -= 0.55;
  }

  if (actionType === "boost") {
    if (numberValue === null) score -= 1.1;
    if (numberValue !== null && numberValue >= 7 && numberValue <= 9) score += 0.9;
    if (unseenHighNumbers <= 3 && numberValue !== null && numberValue >= 6) {
      score += 0.4;
      reasons.push("a modest boost is stronger when the field is running out of huge numbers");
    }
  }

  if (actionType === "double") {
    if (numberValue === null) score -= 1.6;
    if (numberValue !== null && numberValue >= 6 && numberValue <= 9) score += 1.25;
    if (numberValue !== null && numberValue <= 3) score -= 0.5;
    if (unseenShields >= 2 && target) {
      score -= 0.2;
    }
  }

  if (actionType === "shield") {
    if (numberValue !== null && numberValue >= 8) score += 1;
    if (ahead) score += 0.4;
    if (unseenAggroActions >= 5) {
      score += 0.65;
      reasons.push("several attack cards are still unaccounted for, so protection matters more");
    }
    if (unseenAggroActions <= 2) {
      score -= 0.55;
      reasons.push("most of the attack cards have already been spent");
    }
  }

  if (actionType === "drain") {
    if (!target) score -= 1;
    if (target) {
      score += Math.min(1.4, target.points * 0.3);
      score += target.numbers.length <= 6 ? 0.4 : 0;
      const targetLikelyLoaded = target.numbers.length > 0 && unseenHighNumbers >= 6;
      if (targetLikelyLoaded) {
        score += 0.35;
        reasons.push(`there are still strong hidden numbers, so pressuring ${target.name} makes sense`);
      }
    }
    if (unseenShields >= 3) {
      score -= 0.4;
      reasons.push("too many shields may still be out there");
    }
  }

  if (actionType === "swap") {
    if (numberValue === null) score -= 0.8;
    if (numberValue !== null && numberValue <= 5) score += 1.1;
    if (target) score += Math.min(1.2, target.points * 0.25);
    if (unseenHighNumbers >= 8) {
      score += 0.45;
      reasons.push("swap gets better when a lot of big cards could still be in enemy hands");
    }
    if (unseenShields >= 2) {
      score -= 0.3;
    }
  }

  if (actionType === "steal") {
    const richLeader = leaders.find((player) => player.id !== human.id && player.points >= 2);
    if (richLeader) score += 1;
    if (ahead) score -= 1.1;
    if (numberValue !== null && numberValue >= 9) score -= 0.5;
    if (unseenHighNumbers >= 8) {
      score += 0.55;
      reasons.push("a steal line improves when opponents are still likely to spike high rounds");
    }
  }

  if (target) {
    if (target.id === currentLeader?.id) score += 0.55;
  }

  if (context.seen.roundsObserved >= 4 && topCardsAlreadyGone >= 6 && numberValue !== null && numberValue >= 7) {
    score += 0.25;
  }

  score += Math.min(0.6, roundPressure * 0.9);

  return {
    score,
    label: record.label,
    key: record.key,
    reasons,
  };
}

function enumerateLegalHumanPlays() {
  const human = getHumanPlayer();
  if (!human) return [];
  const opponents = state.players.filter((player) => !player.isHuman);
  const plays = [];

  human.numbers.forEach((numberCard) => {
    plays.push({ numberCard, actionCard: null, targetId: null });
  });

  human.actions.forEach((actionCard) => {
    if (actionNeedsTarget(actionCard)) {
      opponents.forEach((target) => {
        plays.push({ numberCard: null, actionCard, targetId: target.id });
      });
    } else {
      plays.push({ numberCard: null, actionCard, targetId: null });
    }
  });

  human.numbers.forEach((numberCard) => {
    human.actions.forEach((actionCard) => {
      if (actionNeedsTarget(actionCard)) {
        opponents.forEach((target) => {
          plays.push({ numberCard, actionCard, targetId: target.id });
        });
      } else {
        plays.push({ numberCard, actionCard, targetId: null });
      }
    });
  });

  return plays;
}

function classifyReviewLoss(loss) {
  if (loss <= 0.2) return { label: "Best", className: "review-best" };
  if (loss <= 0.55) return { label: "Great", className: "review-great" };
  if (loss <= 1.1) return { label: "Good", className: "review-good" };
  if (loss <= 1.8) return { label: "Inaccuracy", className: "review-inaccuracy" };
  if (loss <= 2.7) return { label: "Mistake", className: "review-mistake" };
  return { label: "Blunder", className: "review-blunder" };
}

function analyzeHumanDecision(actualPlay) {
  const human = getHumanPlayer();
  if (!human) return null;
  const seen = buildSeenSnapshot();

  const context = {
    human,
    players: state.players,
    round: state.currentRound + 1,
    totalRounds: state.totalRounds,
    seen,
  };

  const candidates = enumerateLegalHumanPlays()
    .map((play) => {
      const evaluation = scorePlayCandidate(play, context);
      return {
        ...play,
        ...evaluation,
      };
    })
    .sort((a, b) => b.score - a.score);

  const actualKey = [
    actualPlay.numberCard ? actualPlay.numberCard.id : "none",
    actualPlay.actionCard ? actualPlay.actionCard.id : "none",
    actualPlay.targetId || "none",
  ].join("|");

  const actual = candidates.find((candidate) => [
    candidate.numberCard ? candidate.numberCard.id : "none",
    candidate.actionCard ? candidate.actionCard.id : "none",
    candidate.targetId || "none",
  ].join("|") === actualKey);

  const best = candidates[0];
  if (!actual || !best) return null;

  const loss = Math.max(0, best.score - actual.score);
  const classification = classifyReviewLoss(loss);
  const bestTarget = best.targetId ? state.players.find((player) => player.id === best.targetId) : null;

  return {
    round: state.currentRound + 1,
    classification,
    actualLabel: actual.label,
    actualScore: actual.score,
    actualReasons: actual.reasons || [],
    bestLabel: best.label,
    bestScore: best.score,
    bestReasons: best.reasons || [],
    bestTargetLabel: bestTarget ? ` on ${bestTarget.name}` : "",
    loss,
    seenSummary: `Seen so far: ${seen.totalNumbersSeen} number cards and ${seen.totalActionsSeen} action cards.`,
  };
}

function chooseBotPlay(player) {
  const difficulty = player.aiDifficulty || state.difficulty;
  const seen = buildSeenSnapshot();
  const candidateScores = enumerateBotPlays(player)
    .map((play) => ({ play, score: scoreBotCandidate(player, play, difficulty, seen) }))
    .sort((a, b) => b.score - a.score);

  if (!candidateScores.length) return { numberCard: null, actionCard: null, targetId: null };

  const shortlistSize = difficulty === "easy" ? Math.min(6, candidateScores.length) : difficulty === "medium" ? Math.min(4, candidateScores.length) : Math.min(3, candidateScores.length);
  const shortlist = candidateScores.slice(0, shortlistSize);

  if (difficulty === "hard") {
    return shortlist[0].play;
  }

  if (difficulty === "medium") {
    return weightedPick(shortlist, (entry) => Math.max(0.2, entry.score - shortlist[shortlist.length - 1].score + 0.6)).play;
  }

  return weightedPick(shortlist, (entry) => Math.max(0.15, entry.score - shortlist[shortlist.length - 1].score + 0.35)).play;
}

function buildHumanPlay() {
  const { number, action } = currentSelection();
  if (!number && !action) return { error: "Choose at least one card before revealing." };
  if (actionNeedsTarget(action) && !state.selectedTargetId) {
    return { error: "This action needs a target before you can reveal." };
  }

  return {
    playerId: getHumanPlayer().id,
    numberCard: number,
    actionCard: action,
    targetId: state.selectedTargetId,
  };
}

function removeCardFromHand(player, card, key) {
  if (!card) return;
  player[key] = player[key].filter((entry) => entry.id !== card.id);
}

function makeRoundEntry(player, play) {
  return {
    playerId: player.id,
    playerName: player.name,
    numberCard: play.numberCard || null,
    actionCard: play.actionCard || null,
    targetId: play.targetId || null,
    finalValue: play.numberCard ? play.numberCard.value : 0,
    shielded: Boolean(play.actionCard && play.actionCard.type === "shield"),
    wonRound: false,
    stolePoint: false,
  };
}

function resolveRound(plays) {
  const entries = state.players.map((player) =>
    makeRoundEntry(
      player,
      plays.find((play) => play.playerId === player.id) || { numberCard: null, actionCard: null, targetId: null }
    )
  );

  const byId = Object.fromEntries(entries.map((entry) => [entry.playerId, entry]));
  const notes = [];

  entries.forEach((entry) => {
    if (entry.actionCard?.type === "shield") notes.push(`${entry.playerName} activates Shield.`);
  });

  entries.forEach((entry) => {
    if (entry.actionCard?.type === "drain" && entry.targetId) {
      const target = byId[entry.targetId];
      if (!target) return;
      if (target.shielded) {
        notes.push(`${entry.playerName}'s Drain is blocked by ${target.playerName}'s Shield.`);
        return;
      }
      target.finalValue = Math.max(0, target.finalValue - 3);
      notes.push(`${entry.playerName} drains ${target.playerName} to ${target.finalValue}.`);
    }
  });

  entries.forEach((entry) => {
    if (entry.actionCard?.type === "swap" && entry.targetId) {
      const target = byId[entry.targetId];
      if (!target) return;
      if (entry.shielded || target.shielded) {
        notes.push(`${entry.playerName}'s Swap fails because a Shield protects the exchange.`);
        return;
      }
      const temp = entry.finalValue;
      entry.finalValue = target.finalValue;
      target.finalValue = temp;
      notes.push(`${entry.playerName} swaps values with ${target.playerName}.`);
    }
  });

  entries.forEach((entry) => {
    if (entry.actionCard?.type === "double") {
      entry.finalValue = Math.min(entry.finalValue * 2, 18);
      notes.push(`${entry.playerName} doubles to ${entry.finalValue}.`);
    }
    if (entry.actionCard?.type === "boost") {
      entry.finalValue += 3;
      notes.push(`${entry.playerName} boosts to ${entry.finalValue}.`);
    }
  });

  const highest = Math.max(...entries.map((entry) => entry.finalValue));
  const leaders = entries.filter((entry) => entry.finalValue === highest);
  let uniqueWinner = null;

  if (leaders.length === 1) {
    uniqueWinner = leaders[0];
    uniqueWinner.wonRound = true;
    state.players.find((player) => player.id === uniqueWinner.playerId).points += 1;
    notes.push(`${uniqueWinner.playerName} wins the round and gains 1 Destiny Point.`);
  } else {
    const leaderIds = new Set(leaders.map((entry) => entry.playerId));
    state.players.forEach((player) => {
      if (!leaderIds.has(player.id) && player.points > 0) player.points -= 1;
    });
    notes.push(`Tie for first between ${leaders.map((entry) => entry.playerName).join(", ")}.`);
  }

  entries.forEach((entry) => {
    if (entry.actionCard?.type !== "steal" || entry.wonRound || !uniqueWinner) return;
    const winnerPlayer = state.players.find((player) => player.id === uniqueWinner.playerId);
    const thiefPlayer = state.players.find((player) => player.id === entry.playerId);
    if (uniqueWinner.shielded || winnerPlayer.points < 2) return;
    winnerPlayer.points -= 1;
    thiefPlayer.points += 1;
    entry.stolePoint = true;
    notes.push(`${entry.playerName} steals 1 Destiny Point from ${uniqueWinner.playerName}.`);
  });

  state.players.forEach((player) => {
    player.lastPlayed = byId[player.id];
  });

  return {
    highest,
    uniqueWinnerName: uniqueWinner ? uniqueWinner.playerName : null,
    leaders: leaders.map((entry) => entry.playerName),
    notes,
    entries,
  };
}

function createLogMessage(summary) {
  return {
    title: `Round ${state.currentRound}`,
    outcome: summary.uniqueWinnerName
      ? `${summary.uniqueWinnerName} won with ${summary.highest}.`
      : `Tie for first at ${summary.highest} between ${summary.leaders.join(", ")}.`,
    entries: summary.entries.map((entry) => ({
      name: entry.playerName,
      play: describePlay(entry),
      finalValue: entry.finalValue,
      note: entry.stolePoint ? "Stole 1 point after scoring." : entry.shielded ? "Shielded this round." : "",
    })),
    notes: summary.notes,
  };
}

function evaluateGameEnd() {
  if (state.currentRound < state.totalRounds) return false;
  state.phase = "finished";
  const ranking = [...state.players].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.actions.length - a.actions.length;
  });
  const best = ranking[0];
  const tied = ranking.filter(
    (player) => player.points === best.points && player.actions.length === best.actions.length
  );

  if (tied.length > 1) {
    const humanShared = tied.some((player) => player.isHuman);
    state.winnerText = `Shared victory: ${tied.map((player) => player.name).join(", ")}.`;
    winTitle.textContent = humanShared ? "Shared Victory" : "Match Over";
    updateRating(humanShared ? 0.5 : 0);
  } else if (best.isHuman) {
    state.winnerText = `You won with ${best.points} Destiny Points.`;
    winTitle.textContent = "You Win";
    updateRating(1);
  } else {
    state.winnerText = `${best.name} wins with ${best.points} Destiny Points.`;
    winTitle.textContent = "Match Over";
    updateRating(0);
  }
  winText.textContent = state.winnerText;
  return true;
}

function expectedScore(playerRating, opponentRating) {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

function botPoolRating() {
  const difficultyBase = state.difficulty === "easy" ? 1050 : state.difficulty === "hard" ? 1380 : 1210;
  return difficultyBase + (state.players.length - 3) * 18;
}

function updateRating(resultScore) {
  if (!state.ratingActive) {
    state.lastRatingDelta = 0;
    state.ratingCommitted = true;
    ratingResult.textContent = "Rating mode is inactive.";
    return;
  }
  const previous = state.rating;
  const opponent = botPoolRating();
  const expected = expectedScore(previous, opponent);
  const kFactor = 28;
  const next = Math.max(100, Math.round(previous + kFactor * (resultScore - expected)));
  state.lastRatingDelta = next - previous;
  state.rating = next;
  safeWriteRating(next);
  const sign = state.lastRatingDelta > 0 ? "+" : "";
  ratingResult.textContent = `Rating ${sign}${state.lastRatingDelta} to ${state.rating}`;
  state.ratingCommitted = true;
}

function applyAbortPenaltyIfNeeded() {
  if (!state.ratingActive) return false;
  const matchStarted = state.currentRound > 0 || state.phase === "revealing" || state.phase === "finished";
  if (!matchStarted || state.ratingCommitted) return false;

  const previous = state.rating;
  const opponent = botPoolRating();
  const expected = expectedScore(previous, opponent);
  const abortPenalty = 6;
  const next = Math.max(100, Math.round(previous + 28 * (0 - expected) - abortPenalty));
  state.lastRatingDelta = next - previous;
  state.rating = next;
  state.ratingCommitted = true;
  safeWriteRating(next);
  const sign = state.lastRatingDelta > 0 ? "+" : "";
  ratingResult.textContent = `Abort penalty ${sign}${state.lastRatingDelta} to ${state.rating}`;
  return true;
}

function clearLiveMatchState() {
  state.phase = "waiting";
  state.currentRound = 0;
  state.players = [];
  state.logs = [];
  state.winnerText = "";
  state.selectedNumberId = null;
  state.selectedActionId = null;
  state.selectedTargetId = null;
  state.revealEntries = [];
  state.revealMode = "idle";
  state.reviewEntries = [];
  state.pendingReview = null;
  state.roundHistory = [];
  state.ratingCommitted = false;
  state.handIntro = false;
  deckStack.classList.remove("dealing");
  winOverlay.hidden = true;
}

function openPostGameReview() {
  winOverlay.hidden = true;
  setActiveTab("play");
  setPlayScreen("table");
  render();
  window.requestAnimationFrame(() => {
    reviewSummary.closest(".ribbon-card")?.scrollIntoView({
      behavior: settingsState.reducedMotion ? "auto" : "smooth",
      block: "center",
    });
  });
}

function startGame() {
  clearTimers();
  playUiSound("click");
  state.difficulty = difficultySelect.value;
  state.players = dealCards(Number(playerCountSelect.value));
  state.currentRound = 0;
  state.phase = "dealing";
  state.logs = [];
  state.winnerText = "";
  state.selectedNumberId = null;
  state.selectedActionId = null;
  state.selectedTargetId = null;
  state.revealEntries = [];
  state.revealMode = "idle";
  state.lastRatingDelta = 0;
  state.reviewEntries = [];
  state.pendingReview = null;
  state.roundHistory = [];
  state.ratingCommitted = false;
  state.handIntro = false;
  deckStack.classList.add("dealing");
  winOverlay.hidden = true;
  ratingResult.textContent = state.ratingActive ? "Rating pending..." : "Rating mode is inactive.";
  setPlayScreen("table");
  setActiveTab("play");
  statusMessage.textContent = "Dealing cards to the table...";
  render();

  dealTimer = window.setTimeout(() => {
    state.phase = "playing";
    state.handIntro = true;
    deckStack.classList.remove("dealing");
    playUiSound("deal");
    statusMessage.textContent = `Hands dealt. ${difficultyLabel(state.difficulty)} AI is ready. Choose your opening play.`;
    render();
    state.handIntro = false;
  }, 1200);
}

function resetToLobby() {
  clearTimers();
  playUiSound("click");
  const aborted = applyAbortPenaltyIfNeeded();
  clearLiveMatchState();
  if (!aborted) state.lastRatingDelta = 0;
  setPlayScreen("lobby");
  render();
}

function finishReveal(summary) {
  state.revealEntries = summary.entries;
  state.revealMode = "faceup";
  playUiSound("reveal");
  state.logs.unshift(createLogMessage(summary));
  state.logs = state.logs.slice(0, 8);
  state.roundHistory.push({
    round: state.currentRound,
    entries: summary.entries.map((entry) => ({
      playerId: entry.playerId,
      playerName: entry.playerName,
      numberCard: entry.numberCard ? { value: entry.numberCard.value } : null,
      actionCard: entry.actionCard ? { type: entry.actionCard.type, label: entry.actionCard.label } : null,
      targetId: entry.targetId || null,
      finalValue: entry.finalValue,
    })),
  });
  state.selectedNumberId = null;
  state.selectedActionId = null;
  state.selectedTargetId = null;

  if (evaluateGameEnd()) {
    statusMessage.textContent = state.winnerText;
    winOverlay.hidden = false;
    playUiSound("win");
    tableClearTimer = null;
  } else {
    state.phase = "playing";
    statusMessage.textContent = summary.uniqueWinnerName
      ? `${summary.uniqueWinnerName} took round ${state.currentRound}. Choose your next play.`
      : `Round ${state.currentRound} ended in a tie for first. Choose your next play.`;
    tableClearTimer = window.setTimeout(() => {
      state.revealEntries = [];
      state.revealMode = "idle";
      render();
      tableClearTimer = null;
    }, settingsState.reducedMotion ? 1500 : 3000);
  }

  render();
}

function playRound() {
  if (state.phase !== "playing") return;
  playUiSound("click");
  const humanPlay = buildHumanPlay();
  if (humanPlay.error) {
    statusMessage.textContent = humanPlay.error;
    return;
  }
  state.pendingReview = analyzeHumanDecision(humanPlay);

  const plays = [humanPlay];
  state.players.forEach((player) => {
    if (!player.isHuman) plays.push({ playerId: player.id, ...chooseBotPlay(player) });
  });

  state.players.forEach((player) => {
    const play = plays.find((entry) => entry.playerId === player.id);
    removeCardFromHand(player, play.numberCard, "numbers");
    removeCardFromHand(player, play.actionCard, "actions");
  });

  state.currentRound += 1;
  state.phase = "revealing";
  state.revealEntries = state.players.map((player) => ({
    playerId: player.id,
    playerName: player.name,
    numberCard: null,
    actionCard: null,
  }));
  state.revealMode = "facedown";
  statusMessage.textContent = "Cards are on the table...";
  render();

  const summary = resolveRound(plays);
  if (state.pendingReview) {
    state.reviewEntries.unshift({
      ...state.pendingReview,
      outcome: summary.uniqueWinnerName === "You" ? "You won the round." : summary.uniqueWinnerName ? `${summary.uniqueWinnerName} won the round.` : "The round ended tied for first.",
    });
    state.reviewEntries = state.reviewEntries.slice(0, state.totalRounds);
    state.pendingReview = null;
  }
  revealTimer = window.setTimeout(() => finishReveal(summary), 950);
}

function renderStatus() {
  difficultyPill.textContent = `Difficulty: ${difficultyLabel(displayedDifficulty())}`;
  tableRatingPill.textContent = state.ratingActive ? `Rating: ${state.rating}` : "Rating: Inactive";
  if (state.phase === "waiting") {
    roundLabel.textContent = "No game running";
    phasePill.textContent = "Waiting";
    return;
  }
  if (state.phase === "dealing") {
    roundLabel.textContent = "Opening Deal";
    phasePill.textContent = "Dealing";
    return;
  }
  if (state.phase === "finished") {
    roundLabel.textContent = `Round ${state.totalRounds} of ${state.totalRounds}`;
    phasePill.textContent = "Finished";
    return;
  }
  if (state.phase === "revealing") {
    roundLabel.textContent = `Round ${state.currentRound} of ${state.totalRounds}`;
    phasePill.textContent = "Reveal";
    return;
  }
  roundLabel.textContent = `Round ${state.currentRound + 1} of ${state.totalRounds}`;
  phasePill.textContent = "In Play";
}

function renderOpponents() {
  const opponents = state.players.filter((player) => !player.isHuman);
  opponentRow.innerHTML = opponents
    .map((player) => {
      const backCount = 6;
      const backs = Array.from({ length: backCount }, () => `<span class="card-back"><span class="card-back-glyph">🔮</span></span>`).join("");
      return `
        <article class="opponent-seat">
          <div class="seat-topline">
            <h3>${player.name}</h3>
            <span class="pill subtle">${difficultyLabel(player.aiDifficulty)} AI</span>
          </div>
          <div class="back-fan">${backs}</div>
        </article>
      `;
    })
    .join("");
}

function renderTrickArea() {
  if (!state.revealEntries.length) {
    trickArea.innerHTML = `
      <article class="trick-card facedown">
        <div class="trick-player">Table</div>
        <div class="trick-detail">Played cards will land here face down, then flip to reveal the round.</div>
      </article>
    `;
    return;
  }

  trickArea.innerHTML = state.revealEntries
    .map((entry, index) => {
      if (state.revealMode === "facedown") {
        return `
          <article class="trick-card facedown" style="animation-delay:${index * 80}ms">
            <div class="trick-player">${entry.playerName}</div>
            <div class="trick-art">🔮</div>
            <div class="trick-detail">Face-down play</div>
          </article>
        `;
      }

      const primaryGlyph = entry.actionCard ? actionGlyph(entry.actionCard.type) : numberGlyph(entry.finalValue);
      return `
        <article class="trick-card faceup" style="animation-delay:${index * 80}ms">
          <div class="trick-player">${entry.playerName}</div>
          <div class="trick-art">${primaryGlyph}</div>
          <div class="trick-value">${entry.finalValue}</div>
          <div class="trick-detail">${describePlay(entry)}</div>
        </article>
      `;
    })
    .join("");
}

function renderScoreboard() {
  if (!state.players.length) {
    scoreboard.innerHTML = `<article class="score-card"><p class="score-meta">Start a match to populate the table.</p></article>`;
    return;
  }

  scoreboard.innerHTML = state.players
    .map((player) => `
      <article class="score-card ${player.isHuman ? "active-player" : ""}">
        <div class="score-header">
          <h3>${player.name}</h3>
          <span class="pill ${player.isHuman ? "" : "subtle"}">${player.isHuman ? "Human" : `${difficultyLabel(player.aiDifficulty)} AI`}</span>
        </div>
        <strong class="score-points">${player.points} DP</strong>
        <p class="score-meta">${player.isHuman ? "Your standing at the table." : "Opponent score only. Memory matters."}</p>
      </article>
    `)
    .join("");
}

function renderChoiceGrid(container, cards, kind) {
  if (!cards.length) {
    container.innerHTML = `<article class="choice-card empty">No ${kind} cards left.</article>`;
    return;
  }

  container.innerHTML = cards
    .map((card) => {
      const selected = kind === "number" ? card.id === state.selectedNumberId : card.id === state.selectedActionId;
      const introClass = state.handIntro ? "deal-in" : "";
      return kind === "number"
        ? `
          <button class="choice-card ${selected ? "selected" : ""} ${introClass}" data-kind="number" data-id="${card.id}" type="button">
            <span class="card-art">${numberGlyph(card.value)}</span>
            <strong class="choice-value">${card.value}</strong>
          </button>
        `
        : `
          <button class="choice-card ${selected ? "selected" : ""} ${introClass}" data-kind="action" data-id="${card.id}" type="button">
            <span class="card-art">${actionGlyph(card.type)}</span>
            <strong class="choice-value">${card.label}</strong>
          </button>
        `;
    })
    .join("");
}

function renderTargetOptions() {
  const human = getHumanPlayer();
  const { action } = currentSelection();
  const needsTarget = actionNeedsTarget(action);
  targetCard.hidden = !needsTarget;
  if (!needsTarget || !human) {
    targetGrid.innerHTML = "";
    return;
  }

  targetHint.textContent = "Target Required";
  targetGrid.innerHTML = state.players
    .filter((player) => player.id !== human.id)
    .map((player) => `
      <button class="target-button ${player.id === state.selectedTargetId ? "selected" : ""}" data-target-id="${player.id}" type="button">
        <strong>${player.name}</strong>
        <span class="choice-subtitle">${player.points} DP</span>
      </button>
    `)
    .join("");
}

function renderSelectionSummary() {
  const human = getHumanPlayer();
  if (!human) {
    selectionTitle.textContent = "Start a match first";
    selectionText.textContent = "Your hand appears here once the table is ready.";
    return;
  }

  yourPoints.textContent = `${human.points} DP`;
  const { number, action } = currentSelection();
  if (!number && !action) {
    selectionTitle.textContent = "Nothing selected yet";
    selectionText.textContent = "Pick at least one card. If you play two cards, they must be one number and one action.";
    return;
  }

  selectionTitle.textContent = [number ? `Number ${number.value}` : null, action ? action.label : null]
    .filter(Boolean)
    .join(" + ");

  if (actionNeedsTarget(action)) {
    const target = state.players.find((player) => player.id === state.selectedTargetId);
    selectionText.textContent = target
      ? `Targeting ${target.name}. Tap Play Cards when you're ready.`
      : "This action needs a target before you can reveal.";
    return;
  }

  selectionText.textContent = "Legal play. Tap Play Cards to send your cards to the table.";
}

function renderLog() {
  if (!state.logs.length) {
    roundLog.innerHTML = `<article class="log-entry"><p class="score-meta">The table remembers winners, not every card. Watch closely.</p></article>`;
    return;
  }

  roundLog.innerHTML = state.logs
    .map((log) => `
      <article class="log-entry">
        <div class="score-header">
          <h3>${log.title}</h3>
          <span class="pill subtle">${log.outcome}</span>
        </div>
        <p class="score-meta">${log.notes[log.notes.length - 1] || "The table settles for the next round."}</p>
      </article>
    `)
    .join("");
}

function renderReview() {
  if (state.phase !== "finished") {
    reviewSummary.innerHTML = `
      <strong>Post-game review locked</strong>
      <p>The review opens after the match, like a proper analysis screen. Finish the game to see your best moves, misses, and blunders.</p>
    `;
    reviewSummary.className = "review-summary waiting-review";
    reviewList.innerHTML = "";
    return;
  }

  reviewSummary.className = "review-summary";

  if (!state.reviewEntries.length) {
    reviewSummary.innerHTML = `
      <strong>No review data found</strong>
      <p>This match ended without enough recorded decisions to score. Start another game and the review will build automatically.</p>
    `;
    reviewList.innerHTML = "";
    return;
  }

  const latest = state.reviewEntries[0];
  reviewSummary.innerHTML = `
    <strong>Round ${latest.round}: ${latest.classification.label}</strong>
    <p>You played <strong>${latest.actualLabel}</strong>. The top recommendation was <strong>${latest.bestLabel}${latest.bestTargetLabel}</strong>.</p>
    <p>${latest.seenSummary}</p>
  `;

  reviewList.innerHTML = state.reviewEntries
    .map((entry) => `
      <article class="review-item">
        <div class="review-item-header">
          <h4>Round ${entry.round}</h4>
          <span class="review-badge ${entry.classification.className}">${entry.classification.label}</span>
        </div>
        <p>Played: <strong>${entry.actualLabel}</strong></p>
        <p>Best line: <strong>${entry.bestLabel}${entry.bestTargetLabel}</strong></p>
        <p>Why best: ${entry.bestReasons.length ? entry.bestReasons[0] : "It preserved more value for the overall match state."}</p>
        <p>Seen cards: ${entry.seenSummary}</p>
        <p>Score loss: ${entry.loss.toFixed(2)} • ${entry.outcome}</p>
      </article>
    `)
    .join("");
}

function renderHands() {
  const human = getHumanPlayer();
  if (!human) {
    numberHand.innerHTML = `<article class="choice-card empty">Start a match to draw number cards.</article>`;
    actionHand.innerHTML = `<article class="choice-card empty">Start a match to draw action cards.</article>`;
    targetCard.hidden = true;
    yourPoints.textContent = "0 DP";
    return;
  }

  renderChoiceGrid(numberHand, human.numbers, "number");
  renderChoiceGrid(actionHand, human.actions, "action");
  renderTargetOptions();
  renderSelectionSummary();
}

function renderRating() {
  ratingValue.textContent = state.ratingActive ? String(state.rating) : "Dormant";
  ratingTier.textContent = state.ratingActive ? ratingTierLabel(state.rating) : "Inactive";
  if (state.lastRatingDelta !== 0) {
    const sign = state.lastRatingDelta > 0 ? "+" : "";
    ratingNote.textContent = `Last result: ${sign}${state.lastRatingDelta} rating.`;
  } else if (!state.ratingActive) {
    ratingNote.textContent = "Rating mode is currently inactive. Tell me when you want it turned on.";
  } else if (state.phase === "waiting") {
    ratingNote.textContent = "Win matches to climb your local ladder.";
  } else {
    ratingNote.textContent = "Current match will update your rating when it ends.";
  }
}

function render() {
  renderStatus();
  renderRating();
  renderOpponents();
  renderTrickArea();
  renderScoreboard();
  renderHands();
  renderLog();
  renderReview();
  playRoundButton.disabled = state.phase !== "playing";
  clearSelectionButton.disabled = state.phase !== "playing";
  clearNumberButton.disabled = state.phase !== "playing";
  clearActionButton.disabled = state.phase !== "playing";
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    playUiSound("click");
    setActiveTab(button.dataset.tab);
  });
});

startButton.addEventListener("click", startGame);
newMatchButton.addEventListener("click", resetToLobby);
playAgainButton.addEventListener("click", resetToLobby);
if (viewReviewButton) {
  viewReviewButton.addEventListener("click", () => {
    playUiSound("click");
    openPostGameReview();
  });
}
playRoundButton.addEventListener("click", playRound);

clearNumberButton.addEventListener("click", () => {
  state.selectedNumberId = null;
  render();
});

clearActionButton.addEventListener("click", () => {
  state.selectedActionId = null;
  state.selectedTargetId = null;
  render();
});

clearSelectionButton.addEventListener("click", () => {
  state.selectedNumberId = null;
  state.selectedActionId = null;
  state.selectedTargetId = null;
  render();
});

difficultySelect.addEventListener("change", renderStatus);
starTrailSetting.addEventListener("change", () => {
  settingsState.starTrail = starTrailSetting.checked;
  safeWriteSettings();
  applySettingsToDocument();
});
soundSetting.addEventListener("change", () => {
  settingsState.sound = soundSetting.checked;
  safeWriteSettings();
  applySettingsToDocument();
  playUiSound("click");
});
glowSetting.addEventListener("change", () => {
  settingsState.glow = glowSetting.checked;
  safeWriteSettings();
  applySettingsToDocument();
});
reducedMotionSetting.addEventListener("change", () => {
  settingsState.reducedMotion = reducedMotionSetting.checked;
  safeWriteSettings();
  applySettingsToDocument();
});

numberHand.addEventListener("click", (event) => {
  const button = event.target.closest("[data-kind='number']");
  if (!button || state.phase !== "playing") return;
  const id = button.dataset.id;
  state.selectedNumberId = state.selectedNumberId === id ? null : id;
  render();
});

actionHand.addEventListener("click", (event) => {
  const button = event.target.closest("[data-kind='action']");
  if (!button || state.phase !== "playing") return;
  const id = button.dataset.id;
  state.selectedActionId = state.selectedActionId === id ? null : id;
  state.selectedTargetId = null;
  render();
});

targetGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-target-id]");
  if (!button || state.phase !== "playing") return;
  const id = button.dataset.targetId;
  state.selectedTargetId = state.selectedTargetId === id ? null : id;
  render();
});

setPlayScreen("lobby");
state.rating = safeReadRating();
safeReadSettings();
applySettingsToDocument();
ensureComboDatabase();
render();

let sparkleTick = 0;
window.addEventListener("pointermove", (event) => {
  if (!settingsState.starTrail || settingsState.reducedMotion) return;
  sparkleTick += 1;
  if (sparkleTick % 2 !== 0) return;
  spawnSparkle(event.clientX, event.clientY);
});

window.addEventListener("pagehide", () => {
  applyAbortPenaltyIfNeeded();
});
