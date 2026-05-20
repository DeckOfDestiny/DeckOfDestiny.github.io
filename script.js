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
};

let cardId = 0;
let revealTimer = null;
let dealTimer = null;

const tabButtons = document.querySelectorAll(".nav-tab");
const playPanel = document.querySelector("#tab-play");
const rulesPanel = document.querySelector("#tab-rules");
const lobbyScreen = document.querySelector("#lobby-screen");
const tableScreen = document.querySelector("#table-screen");
const deckStack = document.querySelector("#deck-stack");

const playerCountSelect = document.querySelector("#player-count");
const difficultySelect = document.querySelector("#ai-difficulty");
const startButton = document.querySelector("#start-game");
const newMatchButton = document.querySelector("#new-match");
const playAgainButton = document.querySelector("#play-again");
const roundLabel = document.querySelector("#round-label");
const phasePill = document.querySelector("#phase-pill");
const difficultyPill = document.querySelector("#difficulty-pill");
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

function displayedDifficulty() {
  return state.phase === "waiting" ? difficultySelect.value : state.difficulty;
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

function dealCards(playerCount) {
  const numberDeck = createNumberDeck();
  const actionDeck = createActionDeck();
  const players = [];

  for (let index = 0; index < playerCount; index += 1) {
    const isHuman = index === 0;
    players.push({
      id: `player-${index + 1}`,
      name: isHuman ? "You" : `Bot ${index}`,
      isHuman,
      aiDifficulty: isHuman ? null : state.difficulty,
      points: 0,
      numbers: numberDeck.splice(0, 15).sort((a, b) => a.value - b.value),
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
}

function setPlayScreen(mode) {
  const showTable = mode === "table";
  lobbyScreen.hidden = showTable;
  tableScreen.hidden = !showTable;
}

function clearTimers() {
  if (revealTimer) window.clearTimeout(revealTimer);
  if (dealTimer) window.clearTimeout(dealTimer);
  revealTimer = null;
  dealTimer = null;
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

function pickRandom(items) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
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

function chooseBotPlay(player) {
  const selected = { numberCard: null, actionCard: null, targetId: null };
  const otherPlayers = state.players.filter((candidate) => candidate.id !== player.id);
  const difficulty = player.aiDifficulty || state.difficulty;
  const { sorted, low, mid, high } = getNumberBands(player.numbers);

  if (difficulty === "easy") {
    selected.numberCard = pickRandom([...low, ...mid].length ? [...low, ...mid] : sorted);
  } else if (difficulty === "medium") {
    const pool = player.points > 0 ? [...mid, ...high] : [...low, ...mid, ...high];
    selected.numberCard = pickRandom(pool.length ? pool : sorted);
  } else {
    const leadingScore = Math.max(...state.players.map((entry) => entry.points));
    if (player.points < leadingScore) {
      selected.numberCard = pickRandom(high.length ? high : sorted);
    } else if (state.currentRound < 5) {
      selected.numberCard = pickRandom(mid.length ? mid : sorted);
    } else {
      selected.numberCard = pickRandom([...mid, ...high].length ? [...mid, ...high] : sorted);
    }
  }

  const wantsAction =
    player.actions.length > 0 &&
    (
      selected.numberCard === null ||
      (difficulty === "easy" && Math.random() > 0.25) ||
      (difficulty === "medium" && Math.random() > 0.45) ||
      (difficulty === "hard" &&
        (
          selected.numberCard.value <= 5 ||
          selected.numberCard.value >= 9 ||
          state.currentRound >= 10 ||
          Math.random() > 0.62
        ))
    );

  if (wantsAction) {
    const actionPool = sortActionsForDifficulty(player.actions, selected.numberCard ? selected.numberCard.value : 0, difficulty);
    selected.actionCard =
      difficulty === "easy" && player.actions.length > 1 && Math.random() > 0.45
        ? pickRandom(player.actions)
        : actionPool[0];

    if (actionNeedsTarget(selected.actionCard)) {
      selected.targetId = botTargetFor(player, selected.actionCard.type, otherPlayers);
    }
  }

  if (!selected.numberCard && !selected.actionCard && player.actions.length > 0) {
    selected.actionCard = sortActionsForDifficulty(player.actions, 0, difficulty)[0];
    if (actionNeedsTarget(selected.actionCard)) {
      selected.targetId = botTargetFor(player, selected.actionCard.type, otherPlayers);
    }
  }

  return selected;
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
    state.winnerText = `Shared victory: ${tied.map((player) => player.name).join(", ")}.`;
    winTitle.textContent = "Shared Victory";
  } else if (best.isHuman) {
    state.winnerText = `You won with ${best.points} Destiny Points.`;
    winTitle.textContent = "You Win";
  } else {
    state.winnerText = `${best.name} wins with ${best.points} Destiny Points.`;
    winTitle.textContent = "Match Over";
  }
  winText.textContent = state.winnerText;
  return true;
}

function startGame() {
  clearTimers();
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
  deckStack.classList.add("dealing");
  winOverlay.hidden = true;
  setPlayScreen("table");
  setActiveTab("play");
  statusMessage.textContent = "Dealing cards to the table...";
  render();

  dealTimer = window.setTimeout(() => {
    state.phase = "playing";
    deckStack.classList.remove("dealing");
    statusMessage.textContent = `Hands dealt. ${difficultyLabel(state.difficulty)} AI is ready. Choose your opening play.`;
    render();
  }, 1200);
}

function resetToLobby() {
  clearTimers();
  state.phase = "waiting";
  state.players = [];
  state.logs = [];
  state.winnerText = "";
  state.selectedNumberId = null;
  state.selectedActionId = null;
  state.selectedTargetId = null;
  state.revealEntries = [];
  state.revealMode = "idle";
  deckStack.classList.remove("dealing");
  winOverlay.hidden = true;
  setPlayScreen("lobby");
  render();
}

function finishReveal(summary) {
  state.revealEntries = summary.entries;
  state.revealMode = "faceup";
  state.logs.unshift(createLogMessage(summary));
  state.logs = state.logs.slice(0, 8);
  state.selectedNumberId = null;
  state.selectedActionId = null;
  state.selectedTargetId = null;

  if (evaluateGameEnd()) {
    statusMessage.textContent = state.winnerText;
    winOverlay.hidden = false;
  } else {
    state.phase = "playing";
    statusMessage.textContent = summary.uniqueWinnerName
      ? `${summary.uniqueWinnerName} took round ${state.currentRound}. Choose your next play.`
      : `Round ${state.currentRound} ended in a tie for first. Choose your next play.`;
  }

  render();
}

function playRound() {
  if (state.phase !== "playing") return;
  const humanPlay = buildHumanPlay();
  if (humanPlay.error) {
    statusMessage.textContent = humanPlay.error;
    return;
  }

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
  revealTimer = window.setTimeout(() => finishReveal(summary), 950);
}

function renderStatus() {
  difficultyPill.textContent = `Difficulty: ${difficultyLabel(displayedDifficulty())}`;
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
      const backCount = Math.min(player.numbers.length + player.actions.length, 6);
      const backs = Array.from({ length: backCount }, () => `<span class="card-back"></span>`).join("");
      return `
        <article class="opponent-seat">
          <div class="seat-topline">
            <h3>${player.name}</h3>
            <span class="pill subtle">${difficultyLabel(player.aiDifficulty)} AI</span>
          </div>
          <div class="opponent-meta">${player.points} DP • ${player.numbers.length} numbers • ${player.actions.length} actions</div>
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
            <div class="trick-detail">Face-down play</div>
          </article>
        `;
      }

      return `
        <article class="trick-card faceup" style="animation-delay:${index * 80}ms">
          <div class="trick-player">${entry.playerName}</div>
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
        <p class="score-meta">${player.numbers.length} numbers left • ${player.actions.length} actions left</p>
        <div class="score-reveal">
          <strong>Last reveal</strong>
          <span class="score-meta">${player.lastPlayed ? describePlay(player.lastPlayed) : "No rounds resolved yet."}</span>
          ${player.lastPlayed ? `<span class="score-meta">Final value: ${player.lastPlayed.finalValue}</span>` : ""}
        </div>
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
      return kind === "number"
        ? `
          <button class="choice-card ${selected ? "selected" : ""}" data-kind="number" data-id="${card.id}" type="button">
            <span class="choice-type">Number Card</span>
            <strong class="choice-value">${card.value}</strong>
            <span class="choice-subtitle">Play for this round</span>
          </button>
        `
        : `
          <button class="choice-card ${selected ? "selected" : ""}" data-kind="action" data-id="${card.id}" type="button">
            <span class="choice-type">Action Card</span>
            <strong class="choice-value">${card.label}</strong>
            <span class="choice-subtitle">${actionMeta[card.type].needsTarget ? "Needs target" : "No target needed"}</span>
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
        <span class="choice-subtitle">${player.points} DP • ${player.numbers.length} numbers left</span>
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
    roundLog.innerHTML = `<article class="log-entry"><p class="score-meta">The round log will fill in after the first reveal.</p></article>`;
    return;
  }

  roundLog.innerHTML = state.logs
    .map((log) => `
      <article class="log-entry">
        <div class="score-header">
          <h3>${log.title}</h3>
          <span class="pill subtle">${log.outcome}</span>
        </div>
        <ul>
          ${log.entries.map((entry) => `<li><strong>${entry.name}</strong>: ${entry.play} → ${entry.finalValue}${entry.note ? ` (${entry.note})` : ""}</li>`).join("")}
        </ul>
        <ul>
          ${log.notes.map((note) => `<li>${note}</li>`).join("")}
        </ul>
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

function render() {
  renderStatus();
  renderOpponents();
  renderTrickArea();
  renderScoreboard();
  renderHands();
  renderLog();
  playRoundButton.disabled = state.phase !== "playing";
  clearSelectionButton.disabled = state.phase !== "playing";
  clearNumberButton.disabled = state.phase !== "playing";
  clearActionButton.disabled = state.phase !== "playing";
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

startButton.addEventListener("click", startGame);
newMatchButton.addEventListener("click", resetToLobby);
playAgainButton.addEventListener("click", resetToLobby);
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
render();
