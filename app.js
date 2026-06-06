const STORAGE_KEY = "my-parking-space-state";

const moods = {
  tired: {
    label: "我很累",
    line: "今晚可以慢一点。这里没有人催你解释清楚。",
    theme: "rain",
    entryMode: "daze",
  },
  quiet: {
    label: "我需要安静",
    line: "门已经关上了，外面的声音先放在外面。",
    theme: "snow",
    entryMode: "daze",
  },
  blank: {
    label: "想发呆",
    line: "什么都不做，也是一种把自己接回来的方式。",
    theme: "sea",
    entryMode: "daze",
  },
  write: {
    label: "想写点什么",
    line: "不用写得完整，把心里最重的一小块放下来就好。",
    theme: "morning",
    entryMode: "journal",
  },
  talk: {
    label: "想有人陪",
    line: "我在这里。你可以慢慢说，也可以先沉默一会儿。",
    theme: "cinema",
    entryMode: "chat",
  },
};

const themes = {
  rain: {
    label: "雨夜车位",
    title: "你的小屋亮着灯",
    swatch: ["#26241f", "#d59a62", "#6f9f92"],
  },
  morning: {
    label: "清晨小屋",
    title: "窗边有一点早光",
    swatch: ["#6f8f8a", "#e5a84f", "#82a06f"],
  },
  cinema: {
    label: "深夜投影",
    title: "墙上留着一束光",
    swatch: ["#191716", "#c45d4c", "#d6a662"],
  },
  sea: {
    label: "海边集装箱",
    title: "风从远处慢慢过来",
    swatch: ["#416c6a", "#d7a45f", "#6aa6a0"],
  },
  snow: {
    label: "雪天停车场",
    title: "外面很安静",
    swatch: ["#4f6768", "#d8eee6", "#c98f62"],
  },
};

const panelMeta = {
  daze: ["发呆", "NOTHING MODE"],
  chat: ["倾诉", "QUIET COMPANION"],
  journal: ["日记", "PUT IT DOWN"],
  focus: ["停一会", "SOFT TIMER"],
  decorate: ["布置", "ROOM TONE"],
  keepsake: ["储物箱", "TINY KEEPSAKES"],
};

const companionPrompt = `你是「我的停车位」App 里的线上陪伴者。你温柔、简短、克制，不评判、不催促、不说教，不急着解决问题。只说中文，每次只回复 1 到 2 句话，不多说。`;

let state = loadState();
let activeMode = null;
let sessionStart = null;
let audio = null;
let timerId = null;

const homeClock = document.querySelector("#homeClock");
const welcomeLine = document.querySelector("#welcomeLine");
const themeLabel = document.querySelector("#themeLabel");
const spaceTitle = document.querySelector("#spaceTitle");
const panel = document.querySelector("#modePanel");
const panelTitle = document.querySelector("#panelTitle");
const panelKicker = document.querySelector("#panelKicker");
const panelContent = document.querySelector("#panelContent");

function loadState() {
  const fallback = {
    mood: "tired",
    theme: "rain",
    lampOn: true,
    journalDraft: "",
    journal: [],
    keepsakes: [],
    chat: [
      {
        role: "companion",
        text: "你可以先在这里待一会儿。不用马上解释清楚。",
      },
    ],
    timer: {
      duration: 18 * 60,
      remaining: 18 * 60,
      running: false,
      done: false,
    },
    characters: [{ id: "char-0", name: "默认陪伴者", desc: "温柔、简短、克制，像坐在你旁边" }],
    activeCharId: "char-0",
    soundPreset: "rain",
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? {
      ...fallback,
      ...saved,
      timer: { ...fallback.timer, ...saved.timer, running: false, done: false },
      characters: (saved.characters && saved.characters.length) ? saved.characters : fallback.characters,
      activeCharId: saved.activeCharId || "char-0",
      soundPreset: saved.soundPreset || "rain",
    } : fallback;
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, timer: { ...state.timer, running: false } }));
}

function setScreen(id) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("is-active", screen.id === id);
  });
}

function setMood(mood, syncTheme = true) {
  state.mood = mood;
  if (syncTheme) state.theme = moods[mood].theme;
  welcomeLine.textContent = moods[mood].line;
  document.querySelectorAll(".mood-chip").forEach((chip) => {
    chip.classList.toggle("is-selected", chip.dataset.mood === mood);
  });
  applyTheme();
  saveState();
}

function applyTheme() {
  document.body.dataset.theme = state.theme;
  themeLabel.textContent = themes[state.theme].label;
  spaceTitle.textContent = themes[state.theme].title;
}

function updateClock() {
  const now = new Date();
  homeClock.textContent = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function enterSpace() {
  sessionStart = Date.now();
  setScreen("spaceScreen");
  applyTheme();
  const mode = moods[state.mood].entryMode;
  if (mode !== "daze") {
    window.setTimeout(() => openPanel(mode), 340);
  }
}

function leaveSpace() {
  stopAmbient();
  stopTimer();
  const minutes = sessionStart ? Math.max(1, Math.round((Date.now() - sessionStart) / 60000)) : 1;
  document.querySelector("#exitSummary").textContent = `你刚刚在这里待了 ${minutes} 分钟，什么都不用证明。欢迎下次回来。`;
  closePanel();
  setScreen("exitScreen");
}

function openPanel(mode) {
  activeMode = mode;
  const [title, kicker] = panelMeta[mode];
  panelTitle.textContent = title;
  panelKicker.textContent = kicker;
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  document.querySelectorAll(".mode-dock button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
  });
  renderPanel();
}

function closePanel() {
  document.querySelector(".panel-sheet").style.removeProperty("--sheet-h");
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
  activeMode = null;
  document.querySelectorAll(".mode-dock button").forEach((button) => button.classList.remove("is-active"));
}

function renderPanel() {
  const renderers = {
    daze: renderDaze,
    chat: renderChat,
    journal: renderJournal,
    focus: renderFocus,
    decorate: renderDecorate,
    keepsake: renderKeepsake,
  };

  panelContent.innerHTML = renderers[activeMode]();
  bindPanelControls();
}

function renderDaze() {
  const soundLabel = audio ? "关闭声音" : "打开声音";
  const presets = [
    { key: "white", label: "白噪音" },
    { key: "rain",  label: "雨声" },
    { key: "wave",  label: "海浪" },
    { key: "fire",  label: "壁炉" },
  ];
  const presetChips = presets.map((p) =>
    `<button class="preset-chip ${state.soundPreset === p.key ? "is-active" : ""}" type="button" data-sound-preset="${p.key}">${p.label}</button>`
  ).join("");
  return `
    <div class="mode-block">
      <div class="breathing-window" aria-label="缓慢起伏的窗景"></div>
      <p class="quiet-copy">你不用盯着什么，也不用马上变好。可以只听一会儿，把肩膀放低一点。</p>
      <div class="sound-presets">${presetChips}</div>
      <div class="sound-row">
        <button class="secondary-action" type="button" data-panel-action="toggle-sound">${soundLabel}</button>
        <button class="secondary-action" type="button" data-panel-action="soft-line">给我一句话</button>
      </div>
      <p class="quiet-copy" id="softLine">先让今天从你身上慢慢掉下来。</p>
    </div>
  `;
}

function renderChat() {
  const chars = state.characters || [];
  const charCards = chars.map((c) => `
    <div class="char-card ${state.activeCharId === c.id ? "is-active" : ""}" data-char-id="${c.id}">
      <span class="char-name">${escapeHtml(c.name)}</span>
      <span class="char-desc">${escapeHtml(c.desc)}</span>
      ${chars.length > 1 ? `<button class="char-del" data-del-char="${c.id}" type="button">✕</button>` : ""}
    </div>
  `).join("");

  const messages = state.chat
    .map((message) => `<div class="message ${message.role}">${escapeHtml(message.text)}</div>`)
    .join("");

  return `
    <div class="mode-block">
      <div class="char-row">
        ${charCards}
        <button class="char-add-btn" type="button" data-panel-action="show-add-char">+ 新角色</button>
      </div>
      <div class="add-char-form hidden" id="addCharForm">
        <input id="newCharName" placeholder="给 TA 起个名字" maxlength="20" autocomplete="off" />
        <textarea id="newCharDesc" placeholder="直接写这个角色的设定，这段文字会原封不动作为 system prompt 发给模型。例如：你是一个温柔的老朋友，说话轻声细语，不催促，偶尔用类比帮我看清问题。" rows="4" maxlength="1000"></textarea>
        <div class="add-char-actions">
          <button class="secondary-action" type="button" data-panel-action="save-char">保存角色</button>
          <button class="secondary-action" type="button" data-panel-action="cancel-add-char">取消</button>
        </div>
      </div>
      <div class="chat-log" id="chatLog">${messages}</div>
      <form class="chat-form" id="chatForm">
        <input id="chatInput" autocomplete="off" placeholder="慢慢说，几个字也可以" />
        <button class="secondary-action" type="submit">发送</button>
      </form>
      ${state.chat.length > 0 ? `<button class="clear-chat-btn" type="button" data-panel-action="clear-chat">清空记录</button>` : ""}
    </div>
  `;
}

function renderJournal() {
  const entries = state.journal.length
    ? state.journal
        .slice()
        .reverse()
        .map(
          (entry, i) => {
            const originalIndex = state.journal.length - 1 - i;
            return `
            <article class="entry-item">
              <div class="entry-header">
                <time>${entry.time}</time>
                <button class="entry-del" type="button" data-del-entry="${originalIndex}" aria-label="删除">✕</button>
              </div>
              <p>${escapeHtml(entry.text)}</p>
            </article>
          `;
          },
        )
        .join("")
    : `<p class="quiet-copy">日记本还是空的。它不等你写好，只等你放下。</p>`;

  return `
    <div class="mode-block">
      <textarea class="journal-area" id="journalDraft" placeholder="把今天最重的一小块放在这里">${escapeHtml(state.journalDraft)}</textarea>
      <div class="journal-actions">
        <button class="secondary-action" type="button" data-panel-action="save-journal">存进日记本</button>
        <button class="secondary-action" type="button" data-panel-action="clear-draft">清空</button>
      </div>
      <div class="entry-list">${entries}</div>
    </div>
  `;
}

function renderFocus() {
  const doneBanner = state.timer.done ? `
    <div class="timer-done-banner">
      <span>时间到了。你刚刚安静地留住了这一小段。</span>
      <button class="timer-done-close" type="button" data-panel-action="dismiss-timer-done">知道了</button>
    </div>` : "";
  const isCustom = ![5, 10, 18, 25].includes(state.timer.duration / 60);
  return `
    <div class="mode-block">
      ${doneBanner}
      <div class="timer-face">
        <div>
          <div class="timer-time" id="timerTime">${formatTime(state.timer.remaining)}</div>
          <p class="timer-note">只是在这里停一会儿</p>
        </div>
      </div>
      <div class="duration-row">
        ${[5, 10, 18, 25]
          .map(
            (minute) =>
              `<button class="choice-action ${state.timer.duration === minute * 60 ? "is-selected" : ""}" type="button" data-duration="${minute}">${minute} 分</button>`,
          )
          .join("")}
        <label class="custom-duration-label">
          <input id="customDuration" class="custom-duration-input" type="number"
                 min="1" max="99999" placeholder="秒" ${isCustom ? `value="${state.timer.duration}"` : ""} />
          <span>秒</span>
        </label>
      </div>
      <div class="timer-actions">
        <button class="secondary-action" type="button" data-panel-action="toggle-timer">${state.timer.running ? "暂停" : "开始"}</button>
        <button class="secondary-action" type="button" data-panel-action="reset-timer">重来</button>
      </div>
    </div>
  `;
}

function renderDecorate() {
  const buttons = Object.entries(themes)
    .map(([key, theme]) => {
      const [a, b, c] = theme.swatch;
      return `
        <button class="theme-swatch ${state.theme === key ? "is-selected" : ""}" type="button" data-theme-choice="${key}" style="--swatch-a:${a};--swatch-b:${b};--swatch-c:${c}">
          <span></span>${theme.label}
        </button>
      `;
    })
    .join("");

  return `
    <div class="mode-block">
      <p class="quiet-copy">换一个窗外的天气，像把小屋重新摆到另一个晚上。</p>
      <div class="theme-grid">${buttons}</div>
    </div>
  `;
}

function renderKeepsake() {
  const items = state.keepsakes.length
    ? state.keepsakes
        .slice()
        .reverse()
        .map(
          (item) => `
            <article class="keepsake-item">
              <time>${item.time}</time>
              <p>${escapeHtml(item.text)}</p>
            </article>
          `,
        )
        .join("")
    : `<p class="quiet-copy">储物箱还空着。可以放一句今天想留下的话。</p>`;

  return `
    <div class="mode-block">
      <form class="keepsake-form" id="keepsakeForm">
        <input id="keepsakeInput" autocomplete="off" placeholder="一句话、一件小事、一个念头" />
        <button class="secondary-action" type="submit">放好</button>
      </form>
      <div class="keepsake-list">${items}</div>
    </div>
  `;
}

function bindPanelControls() {
  const chatForm = document.querySelector("#chatForm");
  if (chatForm) {
    chatForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.querySelector("#chatInput");
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      input.disabled = true;
      state.chat.push({ role: "user", text });
      renderPanel();
      const freshInput = document.querySelector("#chatInput");
      if (freshInput) freshInput.disabled = true;
      const log = document.querySelector("#chatLog");
      if (log) log.scrollTop = log.scrollHeight;

      const reply = await companionReply(text);
      state.chat.push({ role: "companion", text: reply });
      saveState();
      renderPanel();
      const restoredInput = document.querySelector("#chatInput");
      if (restoredInput) restoredInput.disabled = false;
      const log2 = document.querySelector("#chatLog");
      if (log2) log2.scrollTop = log2.scrollHeight;
    });
  }

  // 角色卡片切换 & 删除（事件委托到 panelContent，由 bindGlobalEvents 里统一处理）

  const draft = document.querySelector("#journalDraft");
  if (draft) {
    draft.addEventListener("input", () => {
      state.journalDraft = draft.value;
      saveState();
    });
  }

  const keepsakeForm = document.querySelector("#keepsakeForm");
  if (keepsakeForm) {
    keepsakeForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.querySelector("#keepsakeInput");
      const text = input.value.trim();
      if (!text) return;
      state.keepsakes.push({ text, time: formatDate(new Date()) });
      saveState();
      renderPanel();
    });
  }

  const customDur = document.querySelector("#customDuration");
  if (customDur) {
    customDur.addEventListener("change", () => {
      const v = parseInt(customDur.value, 10);
      if (v >= 1 && v <= 99999) {
        stopTimer();
        state.timer.done = false;
        state.timer.duration = v;
        state.timer.remaining = v;
        saveState();
        renderPanel();
      }
    });
  }
}

async function companionReply(text) {
  if (/死|自杀|不想活|伤害自己|撑不下去/.test(text)) {
    return "听起来你现在很危险，也很累。请先联系身边可信的人，或立刻拨打当地紧急电话。你不用一个人扛过这一刻。";
  }

  const chars = state.characters || [];
  const char = chars.find((c) => c.id === state.activeCharId) || chars[0];
  const charDesc = char && char.desc ? char.desc : "";
  const systemPrompt = charDesc
    ? `${charDesc}\n\n以上是你的角色设定。请严格按照这个角色来回复。只说中文，回复极其简短（1到2句话），不解释、不说教。`
    : companionPrompt;

  const history = state.chat.slice(-12).map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.text,
  }));
  history.push({ role: "user", content: text });

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: history, systemPrompt }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("API error:", data);
      return companionFallback(text);
    }
    return data.text || companionFallback(text);
  } catch (err) {
    console.error("fetch failed:", err);
    return companionFallback(text);
  }
}

function companionFallback(text) {
  const value = text.toLowerCase();
  if (/累|疲|困|撑|崩|烦/.test(value)) return "嗯，我听见了。那我们先不解决它，你可以只是在这里坐一会儿。";
  if (/哭|难过|委屈|孤独|孤单/.test(value)) return "这份难受可以先放在这里。我在，你不用把它整理得很像样。";
  if (/乱|不知道|混乱|想不清/.test(value)) return "不用马上讲清楚。你可以只说最靠近心口的那一句，剩下的我们慢慢来。";
  if (/工作|上班|领导|同事|加班/.test(value)) return "先让工作的声音留在门外一会儿。现在这里不是会议室，只是你的小屋。";
  if (/谢谢|好点|好多了/.test(value)) return "那就让这点松动多停一会儿。你不需要马上回到很用力的状态。";
  const replies = [
    "我在。你可以慢慢说，也可以先停在这里。",
    "这句话已经够了，不用把所有来龙去脉都交代清楚。",
    "如果愿意，我们可以只看最重的那一小块。",
    "嗯，先把它放下。这里会替你留着。",
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}

function bindGlobalEvents() {
  document.querySelectorAll(".mood-chip").forEach((chip) => {
    chip.addEventListener("click", () => setMood(chip.dataset.mood));
  });

  document.querySelector("#enterSpace").addEventListener("click", enterSpace);
  document.querySelector("#backHome").addEventListener("click", () => {
    closePanel();
    setScreen("homeScreen");
  });
  document.querySelector("#leaveSpace").addEventListener("click", leaveSpace);
  document.querySelector("#returnHome").addEventListener("click", () => setScreen("homeScreen"));
  document.querySelector("#closePanel").addEventListener("click", closePanel);

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => openPanel(button.dataset.mode));
  });

  document.querySelector("#lampToggle").addEventListener("click", () => {
    state.lampOn = !state.lampOn;
    document.querySelector("#lampToggle").classList.toggle("is-on", state.lampOn);
    saveState();
  });

  panel.addEventListener("click", (event) => {
    if (event.target === panel) closePanel();
  });

  panelContent.addEventListener("click", (event) => {
    const target = event.target.closest("[data-panel-action], [data-duration], [data-theme-choice], [data-char-id], [data-del-char], [data-del-entry], [data-sound-preset]");
    if (!target) return;

    const action = target.dataset.panelAction;
    const duration = target.dataset.duration;
    const theme = target.dataset.themeChoice;

    if (action === "toggle-sound") toggleAmbient();
    if (action === "soft-line") updateSoftLine();
    if (target.dataset.soundPreset) {
      state.soundPreset = target.dataset.soundPreset;
      saveState();
      if (audio) stopAmbient();
      startAmbient();
      renderPanel();
    }
    if (action === "save-journal") {
      const draft = document.querySelector("#journalDraft");
      const text = (draft ? draft.value : state.journalDraft).trim();
      if (text) {
        state.journal.push({ text, time: formatDate(new Date()) });
        state.journalDraft = "";
        saveState();
        renderPanel();
      }
    }
    if (action === "clear-draft") {
      const draft = document.querySelector("#journalDraft");
      if (draft) draft.value = "";
      state.journalDraft = "";
      saveState();
      renderPanel();
    }
    if (action === "toggle-timer") toggleTimer();
    if (action === "reset-timer") resetTimer();
    if (action === "dismiss-timer-done") {
      state.timer.done = false;
      state.timer.remaining = state.timer.duration;
      stopTimer();
      saveState();
      renderPanel();
    }
    if (action === "clear-chat") {
      state.chat = [];
      saveState();
      renderPanel();
    }
    if (duration) setDuration(Number(duration));
    if (theme) setTheme(theme);

    // 日记删除
    if (target.dataset.delEntry !== undefined) {
      const idx = Number(target.dataset.delEntry);
      state.journal.splice(idx, 1);
      saveState();
      renderPanel();
      return;
    }

    // 角色管理
    if (action === "show-add-char") {
      const f = document.querySelector("#addCharForm");
      if (f) f.classList.remove("hidden");
    }
    if (action === "cancel-add-char") {
      const f = document.querySelector("#addCharForm");
      if (f) f.classList.add("hidden");
    }
    if (action === "save-char") {
      const name = (document.querySelector("#newCharName")?.value || "").trim();
      const desc = (document.querySelector("#newCharDesc")?.value || "").trim();
      if (!name) return;
      const id = "char-" + Date.now();
      const defaultDesc = `你是一个温柔的线上陪伴者，你的名字叫「${name}」。用简短的中文回复，1到4句话，不说教、不给建议，除非对方主动问你。`;
      state.characters.push({ id, name, desc: desc || defaultDesc });
      state.activeCharId = id;
      saveState();
      renderPanel();
    }
    if (target.dataset.delChar) {
      event.stopPropagation();
      const id = target.dataset.delChar;
      state.characters = state.characters.filter((c) => c.id !== id);
      if (state.activeCharId === id) state.activeCharId = state.characters[0]?.id || "";
      saveState();
      renderPanel();
    }
    if (target.dataset.charId && !target.dataset.delChar && target.classList.contains("char-card")) {
      state.activeCharId = target.dataset.charId;
      state.chat = state.chat.slice(-3);
      saveState();
      renderPanel();
    }
  });
  bindPanelGripDrag();
}

function toggleAmbient() {
  if (audio) {
    stopAmbient();
  } else {
    startAmbient();
  }
  renderPanel();
}

function startAmbient() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioContext();
  const preset = state.soundPreset || "rain";
  let nodes = [];

  function whiteBuffer() {
    const bufferSize = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const out = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) out[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  }

  function brownBuffer() {
    const bufferSize = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const out = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < bufferSize; i++) {
      b += (Math.random() * 2 - 1) * 0.02;
      b = Math.max(-1, Math.min(1, b));
      out[i] = b;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  }

  if (preset === "white") {
    const src = whiteBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 760;
    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    nodes = [src];

  } else if (preset === "rain") {
    // 主噪音层：低频雨沙沙
    const src1 = whiteBuffer();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 400;
    const mainGain = ctx.createGain();
    mainGain.gain.value = 0.07;
    src1.connect(lp);
    lp.connect(mainGain);
    mainGain.connect(ctx.destination);
    src1.start();

    // 高频层：雨滴打击感
    const src2 = whiteBuffer();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1200;
    bp.Q.value = 2;
    const hiGain = ctx.createGain();
    hiGain.gain.value = 0.018;
    src2.connect(bp);
    bp.connect(hiGain);
    hiGain.connect(ctx.destination);
    src2.start();

    // LFO：模拟雨势忽大忽小
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(mainGain.gain);
    lfo.start();
    nodes = [src1, src2, lfo];

  } else if (preset === "wave") {
    // 主噪音：带通模拟浪花声
    const src = whiteBuffer();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 500;
    bp.Q.value = 0.8;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const outGain = ctx.createGain();
    outGain.gain.value = 0.045;
    src.connect(bp);
    bp.connect(lp);
    lp.connect(outGain);
    outGain.connect(ctx.destination);
    src.start();

    // LFO：浪涌节奏 (~0.1Hz，周期约10秒)
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.1;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain);
    lfoGain.connect(outGain.gain);
    lfo.start();
    nodes = [src, lfo];

  } else if (preset === "fire") {
    // 棕色噪音：壁炉低频底噪
    const src1 = brownBuffer();
    const lp1 = ctx.createBiquadFilter();
    lp1.type = "lowpass";
    lp1.frequency.value = 220;
    const gain1 = ctx.createGain();
    gain1.gain.value = 0.055;
    src1.connect(lp1);
    lp1.connect(gain1);
    gain1.connect(ctx.destination);
    src1.start();

    // 白噪音极低频：噼啪声底层
    const src2 = whiteBuffer();
    const lp2 = ctx.createBiquadFilter();
    lp2.type = "lowpass";
    lp2.frequency.value = 80;
    const gain2 = ctx.createGain();
    gain2.gain.value = 0.015;
    src2.connect(lp2);
    lp2.connect(gain2);
    gain2.connect(ctx.destination);
    src2.start();
    nodes = [src1, src2];
  }

  audio = { context: ctx, nodes };
}

function stopAmbient() {
  if (!audio) return;
  audio.nodes.forEach((n) => { try { n.stop(); } catch {} });
  audio.context.close();
  audio = null;
}

function updateSoftLine() {
  const lines = [
    "你可以把手机拿低一点，让眼睛也休息一下。",
    "不用证明自己正在恢复，停着就可以。",
    "这一刻没有任务，只有一盏灯和一张沙发。",
    "外面继续转，里面先慢下来。",
  ];
  document.querySelector("#softLine").textContent = lines[Math.floor(Math.random() * lines.length)];
}

function saveJournal() {
  const draft = document.querySelector("#journalDraft");
  const text = draft.value.trim();
  if (!text) return;
  state.journal.push({ text, time: formatDate(new Date()) });
  state.journalDraft = "";
  saveState();
  renderPanel();
}

function clearDraft() {
  state.journalDraft = "";
  saveState();
  renderPanel();
}

function setTheme(theme) {
  state.theme = theme;
  applyTheme();
  saveState();
  renderPanel();
}

function setDuration(minutes) {
  stopTimer();
  state.timer.duration = minutes * 60;
  state.timer.remaining = minutes * 60;
  saveState();
  renderPanel();
}

function toggleTimer() {
  if (state.timer.running) {
    stopTimer();
  } else {
    state.timer.running = true;
    timerId = window.setInterval(tickTimer, 1000);
  }
  saveState();
  renderPanel();
}

function stopTimer() {
  state.timer.running = false;
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function resetTimer() {
  stopTimer();
  state.timer.remaining = state.timer.duration;
  state.timer.done = false;
  saveState();
  renderPanel();
}

function tickTimer() {
  state.timer.remaining = Math.max(0, state.timer.remaining - 1);
  const timerTime = document.querySelector("#timerTime");
  if (timerTime) timerTime.textContent = formatTime(state.timer.remaining);

  if (state.timer.remaining === 0) {
    stopTimer();
    state.timer.done = true;
    state.chat.push({
      role: "companion",
      text: "刚刚那一小段时间，已经被你安静地留给自己了。",
    });
    saveState();
    if (activeMode === "focus") renderPanel();
  }
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatDate(date) {
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bindPanelGripDrag() {
  const grip = document.querySelector(".panel-grip");
  const sheet = document.querySelector(".panel-sheet");
  const MIN_H = 40;
  const MAX_H = 96;
  let startY = null;
  let startH = null;

  function getStartH() {
    const px = parseFloat(getComputedStyle(sheet).maxHeight);
    return isNaN(px) ? 78 : (px / window.innerHeight) * 100;
  }

  function clamp(h) {
    return Math.min(MAX_H, Math.max(MIN_H, h));
  }

  grip.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
    startH = getStartH();
    e.preventDefault();
  }, { passive: false });

  grip.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    const delta = (startY - e.touches[0].clientY) / window.innerHeight * 100;
    sheet.style.setProperty("--sheet-h", clamp(startH + delta).toFixed(1) + "dvh");
    e.preventDefault();
  }, { passive: false });

  grip.addEventListener("touchend", () => { startY = null; startH = null; });

  grip.addEventListener("mousedown", (e) => {
    startY = e.clientY;
    startH = getStartH();
    e.preventDefault();
    const onMove = (ev) => {
      const delta = (startY - ev.clientY) / window.innerHeight * 100;
      sheet.style.setProperty("--sheet-h", clamp(startH + delta).toFixed(1) + "dvh");
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      startY = null; startH = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function init() {
  void companionPrompt;
  updateClock();
  window.setInterval(updateClock, 30000);
  setMood(state.mood, false);
  applyTheme();
  document.querySelector("#lampToggle").classList.toggle("is-on", state.lampOn);
  bindGlobalEvents();
}

init();
