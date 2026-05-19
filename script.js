const priorityCopy = {
  shield: {
    title: "Shields activate first",
    body:
      "Protection is established before any lowering or swapping effects can touch a card.",
  },
  drain: {
    title: "Drains hit before movement",
    body:
      "Lower target numbers by 3 first, down to a minimum of 0, unless the target is protected by Shield.",
  },
  swap: {
    title: "Swaps happen after reductions",
    body:
      "Once Drains are finished, eligible players can exchange revealed numbers before any power-up effects apply.",
  },
  power: {
    title: "Doubling and Boosts finish the math",
    body:
      "Apply Double Down and Boost after shields, drains, and swaps. Boost adds 3, and Double Down cannot raise a final value above 18.",
  },
  score: {
    title: "Then compare final totals",
    body:
      "The highest final number wins 1 Destiny Point. If first place is tied, only the players outside that tie lose 1 point if they have one.",
  },
  steal: {
    title: "Steal Point always resolves last",
    body:
      "If you played Steal Point and still did not win the round, you may take 1 Destiny Point from the winner after scoring is complete, but only if the winner has at least 2 points.",
  },
};

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
  totalRounds: 15,
  currentRound: 0,
  players: [],
  phase: "waiting",
  difficulty: "medium",
  selectedNumberId: null,
  selectedActionId: null,
  selectedTargetId: null,
  logs: [],
  lastRound: null,
  winnerText: "",
};

let cardId = 0;

const tabButtons = document.querySelectorAll(".nav-tab");
const tabJumpButtons = document.querySelectorAll("[data-tab-jump]");
const panels = {
  play: document.querySelector("#tab-play"),
  rules: document.querySelector("#tab-rules"),
};
const priorityButtons = document.querySelectorAll(".priority-item");
const priorityDetail = document.querySelector("#priority-detail");

const playerCountSelect = document.querySelector("#player-count");
const difficultySelect = document.querySelector("#ai-difficulty");
const startButton = document.querySelector("#start-game");
const roundLabel = document.querySelector("#round-label");
const phasePill = document.querySelector("#phase-pill");
const difficultyPill = document.querySelector("#difficulty-pill");
const statusMessage = document.querySelector("#status-message");
const scoreboard = document.querySelector("#scoreboard");
const numberHand = document.querySelector("#number-hand");
const actionHand = document.querySelector("#action-hand");
const targetCard = document.querySelector("#target-card");
const targetGrid = document.querySelector("#target-grid");
const targetHint = document.querySelector("#target-hint");
const selectionTitle = document.querySelector("#selection-title");
const selectionText = document.querySelector("#selection-text");
const clearNumberButton = document.querySelector("#clear-number");
const clearActionButton = document.querySelector("#clear-action");
const clearSelectionButton = document.querySelector("#clear-selection");
const playRoundButton = document.querySelector("#play-round");
const roundLog = document.querySelector("#round-log");

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
      deck.push({
        id: nextCardId(),
        kind: "action",
        type,
        label: actionMeta[type].name,
      });
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
  Object.entries(panels).forEach(([key, panel]) => {
    panel.classList.toggle("active", key === tab);
  });
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
  if (!parts.length) return "No cards";
  return parts.join(" + ");
}

function botTargetFor(player, actionType, otherPlayers) {
  if (!otherPlayers.length) return null;
  const sortedByPoints = [...otherPlayers].sort((a, b) => b.points - a.points);
  if (actionType === "drain" || actionType === "swap") {
    return sortedByPoints[0].id;
  }
  return otherPlayers[0].id;
}

function difficultyLabel(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function displayedDifficulty() {
  if (state.phase === "waiting") {
    return difficultySelect.value;
  }
  return state.difficulty;
}

function pickRandom(items) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function getNumberBands(numbers) {
  const sorted = [...numbers].sort((a, b) => a.value - b.value);
  const sliceSize = Math.max(1, Math.ceil(sorted.length / 3));
  const low = sorted.slice(0, sliceSize);
  const high = sorted.slice(Math.max(0, sorted.length - sliceSize));
  const midStart = sliceSize;
  const midEnd = Math.max(midStart + 1, sorted.length - sliceSize);
  const mid = sorted.slice(midStart, midEnd);

  return {
    sorted,
    low,
    mid: mid.length ? mid : sorted,
    high,
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

function chooseBotPlay(player) {
  const selected = {
    numberCard: null,
    actionCard: null,
    targetId: null,
  };

  const otherPlayers = state.players.filter((candidate) => candidate.id !== player.id);
  const difficulty = player.aiDifficulty || state.difficulty;
  const { sorted, low, mid, high } = getNumberBands(player.numbers);

  if (difficulty === "easy") {
    const pool = [...low, ...mid];
    selected.numberCard = pickRandom(pool.length ? pool : sorted);
  }

  if (difficulty === "medium") {
    const pool = player.points > 0 ? [...mid, ...high] : [...low, ...mid, ...high];
    selected.numberCard = pickRandom(pool.length ? pool : sorted);
  }

  if (difficulty === "hard") {
    const leadingScore = Math.max(...state.players.map((entry) => entry.points));
    const behindLeader = player.points < leadingScore;
    if (behindLeader) {
      selected.numberCard = pickRandom(high.length ? high : sorted);
    } else if (state.currentRound < 5) {
      selected.numberCard = pickRandom(mid.length ? mid : sorted);
    } else {
      const pool = [...mid, ...high];
      selected.numberCard = pickRandom(pool.length ? pool : sorted);
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
    const numberValue = selected.numberCard ? selected.numberCard.value : 0;
    const actionPool = sortActionsForDifficulty(player.actions, numberValue, difficulty);
    selected.actionCard = actionPool[0];
    if (difficulty === "easy" && player.actions.length > 1 && Math.random() > 0.45) {
      selected.actionCard = pickRandom(player.actions);
    }
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
  const human = getHumanPlayer();
  if (!human) return null;

  const { number, action } = currentSelection();
  if (!number && !action) {
    return { error: "Choose at least one card before revealing." };
  }
  if (number && number.kind !== "number") {
    return { error: "Only number cards can be played in the number slot." };
  }
  if (action && action.kind !== "action") {
    return { error: "Only action cards can be played in the action slot." };
  }
  if (actionNeedsTarget(action) && !state.selectedTargetId) {
    return { error: "This action needs a target before you can reveal." };
  }

  return {
    playerId: human.id,
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
  const shielded = Boolean(play.actionCard && play.actionCard.type === "shield");
  return {
    playerId: player.id,
    playerName: player.name,
    numberCard: play.numberCard || null,
    actionCard: play.actionCard || null,
    targetId: play.targetId || null,
    baseValue: play.numberCard ? play.numberCard.value : 0,
    finalValue: play.numberCard ? play.numberCard.value : 0,
    shielded,
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
    if (entry.actionCard && entry.actionCard.type === "shield") {
      notes.push(`${entry.playerName} activates Shield.`);
    }
  });

  entries.forEach((entry) => {
    if (entry.actionCard && entry.actionCard.type === "drain" && entry.targetId) {
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
    if (entry.actionCard && entry.actionCard.type === "swap" && entry.targetId) {
      const target = byId[entry.targetId];
      if (!target) return;
      if (entry.shielded || target.shielded) {
        notes.push(`${entry.playerName}'s Swap fails because a Shield protects the exchange.`);
        return;
      }
      const current = entry.finalValue;
      entry.finalValue = target.finalValue;
      target.finalValue = current;
      notes.push(
        `${entry.playerName} swaps values with ${target.playerName}: ${entry.finalValue} and ${target.finalValue}.`
      );
    }
  });

  entries.forEach((entry) => {
    if (!entry.actionCard) return;
    if (entry.actionCard.type === "double") {
      entry.finalValue = Math.min(entry.finalValue * 2, 18);
      notes.push(`${entry.playerName} doubles to ${entry.finalValue}.`);
    }
    if (entry.actionCard.type === "boost") {
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
    const winnerPlayer = state.players.find((player) => player.id === uniqueWinner.playerId);
    if (winnerPlayer) winnerPlayer.points += 1;
    notes.push(`${uniqueWinner.playerName} wins the round and gains 1 Destiny Point.`);
  } else {
    const leaderNames = leaders.map((entry) => entry.playerName).join(", ");
    entries.forEach((entry) => {
      if (leaders.some((leader) => leader.playerId === entry.playerId)) return;
      const player = state.players.find((candidate) => candidate.id === entry.playerId);
      if (player && player.points > 0) {
        player.points -= 1;
      }
    });
    notes.push(`Tie for first between ${leaderNames}. Everyone else loses 1 point if possible.`);
  }

  entries.forEach((entry) => {
    if (!entry.actionCard || entry.actionCard.type !== "steal") return;
    if (entry.wonRound || !uniqueWinner) return;
    if (uniqueWinner.shielded) {
      notes.push(`${entry.playerName}'s Steal Point is blocked by ${uniqueWinner.playerName}'s Shield.`);
      return;
    }
    const winnerPlayer = state.players.find((player) => player.id === uniqueWinner.playerId);
    const thiefPlayer = state.players.find((player) => player.id === entry.playerId);
    if (!winnerPlayer || !thiefPlayer || winnerPlayer.points < 2) return;
    winnerPlayer.points -= 1;
    thiefPlayer.points += 1;
    entry.stolePoint = true;
    notes.push(`${entry.playerName} steals 1 Destiny Point from ${uniqueWinner.playerName}.`);
  });

  state.players.forEach((player) => {
    const entry = byId[player.id];
    player.lastPlayed = entry;
  });

  return {
    highest,
    leaders: leaders.map((entry) => entry.playerName),
    uniqueWinnerName: uniqueWinner ? uniqueWinner.playerName : null,
    notes,
    entries,
  };
}

function createLogMessage(summary) {
  const title = `Round ${state.currentRound}`;
  let outcome = "";

  if (summary.uniqueWinnerName) {
    outcome = `${summary.uniqueWinnerName} won with ${summary.highest}.`;
  } else {
    outcome = `Tie for first at ${summary.highest} between ${summary.leaders.join(", ")}.`;
  }

  return {
    title,
    outcome,
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
    state.winnerText = `Match over. Shared victory: ${tied.map((player) => player.name).join(", ")}.`;
  } else {
    state.winnerText = `Match over. ${best.name} wins with ${best.points} Destiny Points.`;
  }
  return true;
}

function playRound() {
  if (state.phase === "waiting" || state.phase === "finished") return;

  const humanPlay = buildHumanPlay();
  if (!humanPlay || humanPlay.error) {
    statusMessage.textContent = humanPlay ? humanPlay.error : "Unable to build your play.";
    return;
  }

  const plays = [humanPlay];
  state.players.forEach((player) => {
    if (player.isHuman) return;
    plays.push({
      playerId: player.id,
      ...chooseBotPlay(player),
    });
  });

  state.players.forEach((player) => {
    const play = plays.find((entry) => entry.playerId === player.id);
    if (!play) return;
    removeCardFromHand(player, play.numberCard, "numbers");
    removeCardFromHand(player, play.actionCard, "actions");
  });

  state.currentRound += 1;
  const summary = resolveRound(plays);
  state.lastRound = summary;
  state.logs.unshift(createLogMessage(summary));
  state.logs = state.logs.slice(0, 8);

  state.selectedNumberId = null;
  state.selectedActionId = null;
  state.selectedTargetId = null;

  const ended = evaluateGameEnd();
  if (!ended) {
    state.phase = "playing";
    statusMessage.textContent = summary.uniqueWinnerName
      ? `${summary.uniqueWinnerName} took round ${state.currentRound}. Choose your next play.`
      : `Round ${state.currentRound} ended in a tie for first. Choose your next play.`;
  } else {
    statusMessage.textContent = state.winnerText;
  }

  render();
}

function startGame() {
  const count = Number(playerCountSelect.value);
  state.difficulty = difficultySelect.value;
  state.players = dealCards(count).map((player) => ({
    ...player,
    aiDifficulty: player.isHuman ? null : state.difficulty,
  }));
  state.currentRound = 0;
  state.phase = "playing";
  state.selectedNumberId = null;
  state.selectedActionId = null;
  state.selectedTargetId = null;
  state.logs = [];
  state.lastRound = null;
  state.winnerText = "";
  statusMessage.textContent = `Hands dealt. ${difficultyLabel(state.difficulty)} AI is ready. Choose your opening play.`;
  setActiveTab("play");
  render();
}

function renderScoreboard() {
  if (!state.players.length) {
    scoreboard.innerHTML = `
      <article class="score-card">
        <h3>No players yet</h3>
        <p class="score-meta">Start a game to see the table, points, and round reveals.</p>
      </article>
    `;
    return;
  }

  scoreboard.innerHTML = state.players
    .map((player) => {
      const reveal = player.lastPlayed
        ? `
          <div class="score-reveal">
            <strong>Last reveal</strong>
            <span class="score-meta">${describePlay(player.lastPlayed)}</span>
            <span class="score-meta">Final value: ${player.lastPlayed.finalValue}</span>
          </div>
        `
        : `
          <div class="score-reveal">
            <strong>Last reveal</strong>
            <span class="score-meta">No rounds resolved yet.</span>
          </div>
        `;

      return `
        <article class="score-card ${player.isHuman ? "active-player" : ""}">
          <div class="score-header">
            <h3>${player.name}</h3>
            <span class="pill ${player.isHuman ? "" : "subtle"}">${
              player.isHuman ? "Human" : `${difficultyLabel(player.aiDifficulty)} AI`
            }</span>
          </div>
          <strong class="score-points">${player.points} DP</strong>
          <p class="score-meta">${player.numbers.length} number cards left • ${player.actions.length} action cards left</p>
          ${reveal}
        </article>
      `;
    })
    .join("");
}

function renderChoiceGrid(container, cards, kind) {
  if (!cards.length) {
    container.innerHTML = `<article class="choice-card empty">No ${kind} cards left.</article>`;
    return;
  }

  container.innerHTML = cards
    .map((card) => {
      const selected =
        kind === "number"
          ? card.id === state.selectedNumberId
          : card.id === state.selectedActionId;

      if (kind === "number") {
        return `
          <button class="choice-card ${selected ? "selected" : ""}" data-kind="number" data-id="${card.id}" type="button">
            <span class="choice-type">Number Card</span>
            <strong class="choice-value">${card.value}</strong>
            <span class="choice-subtitle">One-use round value</span>
          </button>
        `;
      }

      return `
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

  targetHint.textContent = action ? "Required" : "Optional";
  const opponents = state.players.filter((player) => player.id !== human.id);
  targetGrid.innerHTML = opponents
    .map(
      (player) => `
        <button class="target-button ${player.id === state.selectedTargetId ? "selected" : ""}" data-target-id="${player.id}" type="button">
          <strong>${player.name}</strong>
          <span class="choice-subtitle">${player.points} DP • ${player.numbers.length} numbers left</span>
        </button>
      `
    )
    .join("");
}

function renderSelectionSummary() {
  const human = getHumanPlayer();
  if (!human) {
    selectionTitle.textContent = "Start a game first";
    selectionText.textContent = "A hand will appear here once cards are dealt.";
    return;
  }

  const { number, action } = currentSelection();
  if (!number && !action) {
    selectionTitle.textContent = "Nothing selected yet";
    selectionText.textContent =
      "Pick at least one card. If you play two cards, they must be one number and one action.";
    return;
  }

  const parts = [];
  if (number) parts.push(`Number ${number.value}`);
  if (action) parts.push(action.label);
  selectionTitle.textContent = parts.join(" + ");

  if (actionNeedsTarget(action)) {
    const target = state.players.find((player) => player.id === state.selectedTargetId);
    selectionText.textContent = target
      ? `Targeting ${target.name}. Reveal when you're ready.`
      : "This action needs a target before you can reveal.";
    return;
  }

  selectionText.textContent = "Legal play. Reveal when you're ready.";
}

function renderStatus() {
  difficultyPill.textContent = `Difficulty: ${difficultyLabel(displayedDifficulty())}`;

  if (state.phase === "waiting") {
    roundLabel.textContent = "No game running";
    phasePill.textContent = "Waiting";
    return;
  }

  if (state.phase === "finished") {
    roundLabel.textContent = `Round ${state.totalRounds} of ${state.totalRounds}`;
    phasePill.textContent = "Finished";
    return;
  }

  roundLabel.textContent = `Round ${state.currentRound + 1} of ${state.totalRounds}`;
  phasePill.textContent = "In Play";
}

function renderLog() {
  if (!state.logs.length) {
    roundLog.innerHTML = `
      <article class="log-entry">
        <h3>Waiting for the first reveal</h3>
        <p>The round log will show card choices, final values, and rule interactions after each turn.</p>
      </article>
    `;
    return;
  }

  roundLog.innerHTML = state.logs
    .map((log) => {
      const playerRows = log.entries
        .map(
          (entry) =>
            `<li><strong>${entry.name}</strong>: ${entry.play} → ${entry.finalValue}${entry.note ? ` (${entry.note})` : ""}</li>`
        )
        .join("");

      const notes = log.notes.map((note) => `<li>${note}</li>`).join("");
      return `
        <article class="log-entry">
          <div class="log-header">
            <h3>${log.title}</h3>
            <span class="pill subtle">${log.outcome}</span>
          </div>
          <ul>${playerRows}</ul>
          <ul>${notes}</ul>
        </article>
      `;
    })
    .join("");
}

function renderHands() {
  const human = getHumanPlayer();
  if (!human) {
    numberHand.innerHTML = `<article class="choice-card empty">Start a game to draw number cards.</article>`;
    actionHand.innerHTML = `<article class="choice-card empty">Start a game to draw action cards.</article>`;
    targetCard.hidden = true;
    return;
  }

  renderChoiceGrid(numberHand, human.numbers, "number");
  renderChoiceGrid(actionHand, human.actions, "action");
  renderTargetOptions();
  renderSelectionSummary();
}

function render() {
  renderStatus();
  renderScoreboard();
  renderHands();
  renderLog();
  playRoundButton.disabled = state.phase !== "playing";
  clearSelectionButton.disabled = state.phase === "waiting";
  clearNumberButton.disabled = state.phase === "waiting";
  clearActionButton.disabled = state.phase === "waiting";
}

if (priorityButtons.length && priorityDetail) {
  priorityButtons.forEach((button) => {
    button.addEventListener("click", () => {
      priorityButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");

      const key = button.dataset.priority;
      const copy = priorityCopy[key];
      if (!copy) return;

      priorityDetail.innerHTML = `
        <h3>${copy.title}</h3>
        <p>${copy.body}</p>
      `;
    });
  });
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

tabJumpButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tabJump));
});

startButton.addEventListener("click", startGame);
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

difficultySelect.addEventListener("change", () => {
  renderStatus();
});

targetGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-target-id]");
  if (!button || state.phase !== "playing") return;
  const id = button.dataset.targetId;
  state.selectedTargetId = state.selectedTargetId === id ? null : id;
  render();
});

const revealItems = document.querySelectorAll(".reveal-on-scroll");

if (revealItems.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  revealItems.forEach((item) => observer.observe(item));
}

render();
