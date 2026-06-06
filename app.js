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
    swatch: ["#0d1117", "#d59a62", "#4a8a7e"],
  },
  morning: {
    label: "清晨小屋",
    title: "窗边有一点早光",
    swatch: ["#5ab0b8", "#fce060", "#82c06f"],
  },
  cinema: {
    label: "深夜投影",
    title: "墙上留着一束光",
    swatch: ["#0e0b0a", "#d03020", "#e09040"],
  },
  sea: {
    label: "傍晚集装箱",
    title: "暮色把天空染红了",
    swatch: ["#3d2246", "#d4507a", "#f09050"],
  },
  snow: {
    label: "雪天停车场",
    title: "雪把什么都盖住了",
    swatch: ["#8aaec4", "#e8f4ff", "#a0c8e0"],
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

const decoTypes = {
  cactus: { label: "仙人掌", cls: "deco-cactus" },
  fern:   { label: "绿植",   cls: "deco-fern"   },
  cat:    { label: "小猫",   cls: "deco-cat"    },
  fish:   { label: "金鱼缸", cls: "deco-fish"   },
  candle: { label: "蜡烛",   cls: "deco-candle" },
  book:   { label: "书",     cls: "deco-book"   },
  mug:    { label: "马克杯", cls: "deco-mug"    },
  lamp:   { label: "台灯",   cls: "deco-floor-lamp" },
};

const lightingOptions = [
  { key: "warm",   label: "暖灯" },
  { key: "cool",   label: "冷灯" },
  { key: "off",    label: "关灯" },
  { key: "candle", label: "烛光" },
];

const companionPrompt = `你是「我的停车位」App 里的线上陪伴者。你温柔、简短、克制，不评判、不催促、不说教，不急着解决问题。默认回复 1 到 4 句话，像坐在用户旁边。`;

let state = loadState();
let activeMode = null;
let sessionStart = null;
let audio = null;
let timerId = null;
let decoCounter = 0;
let swipeTouchStartX = null;
let inStreetView = false;

const homeClock = document.querySelector("#homeClock");
const welcomeLine = document.querySelector("#welcomeLine");
const themeLabel = document.querySelector("#themeLabel");
const spaceTitle = document.querySelector("#spaceTitle");
const panel = document.querySelector("#modePanel");
const panelTitle = document.querySelector("#panelTitle");
const panelKicker = document.querySelector("#panelKicker");
const panelContent = document.querySelector("#panelContent");
const roomScene = document.querySelector("#roomScene");
const streetView = document.querySelector("#streetView");

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
    },
    roomLayout: {},
    decoItems: [],
    lighting: "warm",
    characters: [{ id: "char-0", name: "默认陪伴者", desc: "温柔、简短、克制，像坐在你旁边" }],
    activeCharId: "char-0",
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved
      ? {
          ...fallback,
          ...saved,
          timer: { ...fallback.timer, ...saved.timer },
          roomLayout: saved.roomLayout || {},
          decoItems: saved.decoItems || [],
          lighting: saved.lighting || "warm",
          characters: saved.characters && saved.characters.length ? saved.characters : fallback.characters,
          activeCharId: saved.activeCharId || "char-0",
        }
      : fallback;
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...state, timer: { ...state.timer, running: false } })
  );
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
  applyLighting(state.lighting);
}

function applyLighting(key) {
  document.body.dataset.lighting = key;
}

function setLighting(key) {
  state.lighting = key;
  applyLighting(key);
  saveState();
  renderPanel();
}

function updateClock() {
  const now = new Date();
  homeClock.textContent = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function enterSpace() {
  sessionStart = Date.now();
  setScreen("spaceScreen");
  applyTheme();
  applyRoomLayout();
  renderDecoItems();
  const mode = moods[state.mood].entryMode;
  if (mode !== "daze") {
    window.setTimeout(() => openPanel(mode), 340);
  }
  // 短暂显示滑动提示
  window.setTimeout(() => {
    const hint = document.querySelector(".swipe-hint");
    if (hint) hint.style.opacity = "0.7";
  }, 1800);
}

function leaveSpace() {
  stopAmbient();
  stopTimer();
  exitDecorateMode();
  exitStreetView(false);
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

  // 同步两个 dock 的激活态
  document.querySelectorAll("[data-mode]").forEach((button) => {
    if (button.closest(".mode-dock") || button.closest(".street-dock")) {
      button.classList.toggle("is-active", button.dataset.mode === mode);
    }
  });

  if (mode === "decorate") {
    enterDecorateMode();
  }

  renderPanel();
}

function closePanel() {
  const sheet = document.querySelector(".panel-sheet");
  if (sheet) sheet.style.removeProperty("--sheet-h");

  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");

  if (activeMode === "decorate") {
    exitDecorateMode();
  }

  activeMode = null;
  document.querySelectorAll(".mode-dock button, .street-dock button").forEach((button) => {
    button.classList.remove("is-active");
  });
}

// ── 布置模式：进入 / 退出 ──────────────────────────────────────

function enterDecorateMode() {
  roomScene.classList.add("is-decorating");
  document.querySelectorAll(".room-object").forEach((el) => {
    makeDraggable(el, "room");
  });
  document.querySelectorAll(".deco-item").forEach((el) => {
    makeDraggable(el, "deco");
    bindDecoLongPress(el);
    bindDecoScale(el, el.dataset.decoId);
  });
}

function exitDecorateMode() {
  roomScene.classList.remove("is-decorating");
  document.querySelectorAll(".room-object, .deco-item").forEach((el) => {
    el.removeEventListener("pointerdown", el._dragHandler);
    delete el._dragHandler;
  });
  document.querySelectorAll(".deco-item").forEach((el) => {
    el.classList.remove("show-remove");
    if (el._scaleHandler) {
      el.removeEventListener("touchstart", el._scaleHandler.onTouchStart);
      el.removeEventListener("touchmove", el._scaleHandler.onTouchMove);
      el.removeEventListener("touchend", el._scaleHandler.onTouchEnd);
      delete el._scaleHandler;
    }
  });
}

// ── 拖动逻辑 ──────────────────────────────────────────────────

function makeDraggable(el, type) {
  if (el._dragHandler) return;

  const handler = (e) => {
    if (e.target.classList.contains("deco-remove")) return;
    e.preventDefault();
    e.stopPropagation();

    const container = roomScene;
    const rect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offsetX = e.clientX - elRect.left;
    const offsetY = e.clientY - elRect.top;

    el.setPointerCapture(e.pointerId);

    function onMove(ev) {
      const x = ev.clientX - rect.left - offsetX;
      const y = ev.clientY - rect.top - offsetY;
      const maxX = rect.width - elRect.width;
      const maxY = rect.height - elRect.height;
      const clampedX = Math.max(0, Math.min(x, maxX));
      const clampedY = Math.max(0, Math.min(y, maxY));
      el.style.left = (clampedX / rect.width * 100).toFixed(2) + "%";
      el.style.top = (clampedY / rect.height * 100).toFixed(2) + "%";
      // 清除 CSS class 定位，改为内联样式
      if (type === "room") {
        el.style.position = "absolute";
      }
    }

    function onUp() {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      // 持久化位置
      if (type === "room") {
        const id = el.dataset.objectId;
        if (id) {
          state.roomLayout[id] = { left: el.style.left, top: el.style.top };
          saveState();
        }
      } else if (type === "deco") {
        const id = el.dataset.decoId;
        if (id) {
          const item = state.decoItems.find((d) => d.id === id);
          if (item) {
            item.left = el.style.left;
            item.top = el.style.top;
            saveState();
          }
        }
      }
    }

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  el._dragHandler = handler;
  el.addEventListener("pointerdown", handler);
}

// ── 装饰元素 ─────────────────────────────────────────────────

function addDecoItem(type) {
  const id = `deco-${decoCounter++}`;
  const left = (10 + Math.random() * 60).toFixed(1) + "%";
  const top = (20 + Math.random() * 40).toFixed(1) + "%";
  state.decoItems.push({ id, type, left, top, scale: 1.0 });
  saveState();
  createDecoEl({ id, type, left, top, scale: 1.0 });
}

function createDecoEl(item) {
  const el = document.createElement("div");
  el.className = "deco-item";
  el.dataset.decoId = item.id;
  el.style.left = item.left;
  el.style.top = item.top;
  const scale = item.scale || 1.0;
  el.style.transform = `scale(${scale})`;
  el.dataset.scale = scale;

  // CSS 绘制的物件本体
  const body = document.createElement("div");
  body.className = decoTypes[item.type] ? decoTypes[item.type].cls : "deco-cactus";
  el.appendChild(body);

  // 删除按钮
  const removeBtn = document.createElement("button");
  removeBtn.className = "deco-remove";
  removeBtn.textContent = "✕";
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    state.decoItems = state.decoItems.filter((d) => d.id !== item.id);
    saveState();
    el.remove();
  });
  el.appendChild(removeBtn);

  // 缩放按钮（布置模式时显示）
  const scaleWrap = document.createElement("div");
  scaleWrap.className = "deco-scale-wrap";
  const btnMinus = document.createElement("button");
  btnMinus.className = "deco-scale-btn";
  btnMinus.textContent = "－";
  const btnPlus = document.createElement("button");
  btnPlus.className = "deco-scale-btn";
  btnPlus.textContent = "＋";
  btnMinus.addEventListener("click", (e) => { e.stopPropagation(); changeDecoScale(el, item.id, -0.2); });
  btnPlus.addEventListener("click",  (e) => { e.stopPropagation(); changeDecoScale(el, item.id,  0.2); });
  scaleWrap.appendChild(btnMinus);
  scaleWrap.appendChild(btnPlus);
  el.appendChild(scaleWrap);

  roomScene.appendChild(el);

  if (roomScene.classList.contains("is-decorating")) {
    makeDraggable(el, "deco");
    bindDecoLongPress(el);
    bindDecoScale(el, item.id);
  }
}

function renderDecoItems() {
  document.querySelectorAll(".deco-item").forEach((el) => el.remove());
  decoCounter = state.decoItems.length;
  state.decoItems.forEach((item) => createDecoEl(item));
}

function bindDecoLongPress(el) {
  let pressTimer = null;
  el.addEventListener("pointerdown", () => {
    pressTimer = window.setTimeout(() => {
      el.classList.add("show-remove");
    }, 700);
  });
  el.addEventListener("pointerup", () => {
    clearTimeout(pressTimer);
  });
  el.addEventListener("pointercancel", () => {
    clearTimeout(pressTimer);
  });
}

function changeDecoScale(el, id, delta) {
  const current = parseFloat(el.dataset.scale) || 1.0;
  const next = Math.min(3.0, Math.max(0.4, current + delta));
  el.dataset.scale = next;
  el.style.transform = `scale(${next})`;
  const item = state.decoItems.find((d) => d.id === id);
  if (item) { item.scale = next; saveState(); }
}

function bindDecoScale(el, id) {
  if (el._scaleHandler) return;
  let initDist = null;
  let initScale = 1.0;

  function getDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      initDist = getDist(e.touches);
      initScale = parseFloat(el.dataset.scale) || 1.0;
      e.preventDefault();
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 2 && initDist) {
      const ratio = getDist(e.touches) / initDist;
      const next = Math.min(3.0, Math.max(0.4, initScale * ratio));
      el.dataset.scale = next.toFixed(3);
      el.style.transform = `scale(${next.toFixed(3)})`;
      e.preventDefault();
    }
  }

  function onTouchEnd(e) {
    if (initDist && e.touches.length < 2) {
      const scale = parseFloat(el.dataset.scale) || 1.0;
      const item = state.decoItems.find((d) => d.id === id);
      if (item) { item.scale = scale; saveState(); }
      initDist = null;
    }
  }

  el._scaleHandler = { onTouchStart, onTouchMove, onTouchEnd };
  el.addEventListener("touchstart", onTouchStart, { passive: false });
  el.addEventListener("touchmove", onTouchMove, { passive: false });
  el.addEventListener("touchend", onTouchEnd);
}

// ── 恢复房间布局 ─────────────────────────────────────────────

function applyRoomLayout() {
  const layout = state.roomLayout || {};
  document.querySelectorAll(".room-object[data-object-id]").forEach((el) => {
    const id = el.dataset.objectId;
    if (layout[id]) {
      el.style.left = layout[id].left;
      el.style.top = layout[id].top;
      el.style.position = "absolute";
    } else {
      el.style.left = "";
      el.style.top = "";
      el.style.position = "";
    }
  });
}

// ── 街景视图 ─────────────────────────────────────────────────

function enterStreetView() {
  inStreetView = true;
  streetView.classList.add("is-visible");
  streetView.setAttribute("aria-hidden", "false");
}

function exitStreetView(animate = true) {
  if (!inStreetView && animate) return;
  inStreetView = false;
  streetView.classList.remove("is-visible");
  streetView.setAttribute("aria-hidden", "true");
}

// ── 滑动手势 ─────────────────────────────────────────────────

function bindSwipeGesture() {
  const spaceScreen = document.querySelector("#spaceScreen");

  spaceScreen.addEventListener("touchstart", (e) => {
    if (panel.classList.contains("is-open")) return;
    swipeTouchStartX = e.touches[0].clientX;
  }, { passive: true });

  spaceScreen.addEventListener("touchend", (e) => {
    if (swipeTouchStartX === null) return;
    if (panel.classList.contains("is-open")) {
      swipeTouchStartX = null;
      return;
    }
    const deltaX = e.changedTouches[0].clientX - swipeTouchStartX;
    swipeTouchStartX = null;
    if (deltaX < -60 && !inStreetView) {
      enterStreetView();
    } else if (deltaX > 60 && inStreetView) {
      exitStreetView();
    }
  }, { passive: true });
}

// ── Panel 拖拽展开 ────────────────────────────────────────────

function bindPanelGripDrag() {
  const grip = document.querySelector(".panel-grip");
  const sheet = document.querySelector(".panel-sheet");
  const MIN_H = 40;
  const MAX_H = 96;
  let startY = null;
  let startH = null;

  function getStartH() {
    const computed = getComputedStyle(sheet).maxHeight;
    return (parseFloat(computed) / window.innerHeight) * 100;
  }

  function applyH(newH) {
    const clamped = Math.min(MAX_H, Math.max(MIN_H, newH));
    sheet.style.setProperty("--sheet-h", clamped.toFixed(1) + "dvh");
  }

  // Touch
  grip.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
    startH = getStartH();
    e.preventDefault();
  }, { passive: false });

  grip.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    const deltaY = startY - e.touches[0].clientY;
    applyH(startH + (deltaY / window.innerHeight) * 100);
    e.preventDefault();
  }, { passive: false });

  grip.addEventListener("touchend", () => { startY = null; startH = null; });

  // Mouse
  grip.addEventListener("mousedown", (e) => {
    startY = e.clientY;
    startH = getStartH();
    e.preventDefault();

    function onMouseMove(ev) {
      const deltaY = startY - ev.clientY;
      applyH(startH + (deltaY / window.innerHeight) * 100);
    }
    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      startY = null;
      startH = null;
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
}

// ── Panel 渲染 ────────────────────────────────────────────────

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
  const soundLabel = audio ? "停下白噪音" : "打开白噪音";
  return `
    <div class="mode-block">
      <div class="breathing-window" aria-label="缓慢起伏的窗景"></div>
      <p class="quiet-copy">你不用盯着什么，也不用马上变好。可以只听一会儿，把肩膀放低一点。</p>
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
  const charCards = chars
    .map(
      (c) => `
      <div class="char-card ${state.activeCharId === c.id ? "is-active" : ""}" data-char-id="${c.id}" role="button" tabindex="0">
        <span class="char-name">${escapeHtml(c.name)}</span>
        <span class="char-desc">${escapeHtml(c.desc)}</span>
        ${chars.length > 1 ? `<button class="char-del" data-del-char="${c.id}" type="button" aria-label="删除角色">✕</button>` : ""}
      </div>
    `,
    )
    .join("");

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
        <textarea id="newCharDesc" placeholder="性格、说话风格、和你的关系…" rows="2" maxlength="200"></textarea>
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
    </div>
  `;
}

function renderJournal() {
  const entries = state.journal.length
    ? state.journal
        .slice()
        .reverse()
        .map(
          (entry) => `
            <article class="entry-item">
              <time>${entry.time}</time>
              <p>${escapeHtml(entry.text)}</p>
            </article>
          `,
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
  return `
    <div class="mode-block">
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
      </div>
      <div class="timer-actions">
        <button class="secondary-action" type="button" data-panel-action="toggle-timer">${state.timer.running ? "暂停" : "开始"}</button>
        <button class="secondary-action" type="button" data-panel-action="reset-timer">重来</button>
      </div>
    </div>
  `;
}

function renderDecorate() {
  // 灯光行
  const lightingBtns = lightingOptions
    .map(
      (opt) =>
        `<button class="lighting-btn ${state.lighting === opt.key ? "is-selected" : ""}" type="button" data-lighting-choice="${opt.key}">${opt.label}</button>`,
    )
    .join("");

  // 主题色块
  const themeButtons = Object.entries(themes)
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
      <p class="quiet-copy">拖动小屋里的物件，换一个顺手的摆法。</p>

      <p class="overline" style="margin:0 0 6px">灯光氛围</p>
      <div class="lighting-row">${lightingBtns}</div>

      <p class="overline" style="margin:12px 0 6px">窗外的天气</p>
      <div class="theme-grid">${themeButtons}</div>
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

// ── Panel 控件绑定 ────────────────────────────────────────────

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
      const log = document.querySelector("#chatLog");
      if (log) log.scrollTop = log.scrollHeight;

      const reply = await companionReply(text);
      input.disabled = false;
      input.focus();
      state.chat.push({ role: "companion", text: reply });
      saveState();
      renderPanel();
      const log2 = document.querySelector("#chatLog");
      if (log2) log2.scrollTop = log2.scrollHeight;
    });
  }

  // 角色卡片点击
  const chatLog = document.querySelector("#chatLog");
  const charRow = document.querySelector(".char-row");
  if (charRow) {
    charRow.addEventListener("click", (e) => {
      const card = e.target.closest(".char-card");
      const delBtn = e.target.closest("[data-del-char]");
      if (delBtn) {
        e.stopPropagation();
        const id = delBtn.dataset.delChar;
        state.characters = state.characters.filter((c) => c.id !== id);
        if (state.activeCharId === id) {
          state.activeCharId = state.characters[0]?.id || "";
        }
        saveState();
        renderPanel();
        return;
      }
      if (card && card.dataset.charId) {
        state.activeCharId = card.dataset.charId;
        saveState();
        renderPanel();
      }
    });
  }

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
}

// ── 全局事件绑定 ─────────────────────────────────────────────

function bindGlobalEvents() {
  document.querySelectorAll(".mood-chip").forEach((chip) => {
    chip.addEventListener("click", () => setMood(chip.dataset.mood));
  });

  document.querySelector("#enterSpace").addEventListener("click", enterSpace);
  document.querySelector("#backHome").addEventListener("click", () => {
    closePanel();
    exitStreetView(false);
    setScreen("homeScreen");
  });
  document.querySelector("#leaveSpace").addEventListener("click", leaveSpace);
  document.querySelector("#returnHome").addEventListener("click", () => setScreen("homeScreen"));
  document.querySelector("#closePanel").addEventListener("click", closePanel);
  document.querySelector("#streetBack").addEventListener("click", () => exitStreetView());

  // 室内 dock
  document.querySelectorAll(".mode-dock [data-mode]").forEach((button) => {
    button.addEventListener("click", () => openPanel(button.dataset.mode));
  });

  // 街景 dock（复用同一个 modePanel）
  document.querySelectorAll(".street-dock [data-mode]").forEach((button) => {
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

  // 房间对象点击（布置模式时不触发功能，只拖动）
  document.querySelectorAll(".room-object[data-mode]").forEach((button) => {
    button.addEventListener("click", (e) => {
      if (roomScene.classList.contains("is-decorating")) return;
      openPanel(button.dataset.mode);
    });
  });

  // panel 内容事件委托
  panelContent.addEventListener("click", (event) => {
    const target = event.target.closest(
      "[data-panel-action], [data-duration], [data-theme-choice], [data-lighting-choice]"
    );
    if (!target) return;

    const action = target.dataset.panelAction;
    const duration = target.dataset.duration;
    const theme = target.dataset.themeChoice;
    const lighting = target.dataset.lightingChoice;

    if (action === "toggle-sound") toggleAmbient();
    if (action === "soft-line") updateSoftLine();
    if (action === "save-journal") saveJournal();
    if (action === "clear-draft") clearDraft();
    if (action === "toggle-timer") toggleTimer();
    if (action === "reset-timer") resetTimer();
    if (duration) setDuration(Number(duration));
    if (theme) setTheme(theme);
    if (lighting) setLighting(lighting);

    if (action === "show-add-char") {
      const form = document.querySelector("#addCharForm");
      if (form) form.classList.remove("hidden");
    }
    if (action === "cancel-add-char") {
      const form = document.querySelector("#addCharForm");
      if (form) form.classList.add("hidden");
    }
    if (action === "save-char") {
      const nameInput = document.querySelector("#newCharName");
      const descInput = document.querySelector("#newCharDesc");
      const name = nameInput ? nameInput.value.trim() : "";
      const desc = descInput ? descInput.value.trim() : "";
      if (!name) return;
      const id = `char-${Date.now()}`;
      state.characters = state.characters || [];
      state.characters.push({ id, name, desc: desc || "温柔地陪着你" });
      state.activeCharId = id;
      saveState();
      renderPanel();
    }
  });

  bindSwipeGesture();
  bindPanelGripDrag();
}

// ── 音效 ─────────────────────────────────────────────────────

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
  const context = new AudioContext();
  const bufferSize = context.sampleRate * 2;
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const output = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i += 1) {
    output[i] = (Math.random() * 2 - 1) * 0.55;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = buffer;
  source.loop = true;
  filter.type = "lowpass";
  filter.frequency.value = 760;
  gain.gain.value = 0.035;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start();

  audio = { context, source };
}

function stopAmbient() {
  if (!audio) return;
  audio.source.stop();
  audio.context.close();
  audio = null;
}

// ── 发呆短句 ─────────────────────────────────────────────────

function updateSoftLine() {
  const lines = [
    "你可以把手机拿低一点，让眼睛也休息一下。",
    "不用证明自己正在恢复，停着就可以。",
    "这一刻没有任务，只有一盏灯和一张沙发。",
    "外面继续转，里面先慢下来。",
  ];
  document.querySelector("#softLine").textContent = lines[Math.floor(Math.random() * lines.length)];
}

// ── 日记 ─────────────────────────────────────────────────────

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

// ── 主题 & 灯光 ───────────────────────────────────────────────

function setTheme(theme) {
  state.theme = theme;
  applyTheme();
  saveState();
  renderPanel();
}

// ── 计时器 ───────────────────────────────────────────────────

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
  saveState();
  renderPanel();
}

function tickTimer() {
  state.timer.remaining = Math.max(0, state.timer.remaining - 1);
  const timerTime = document.querySelector("#timerTime");
  if (timerTime) timerTime.textContent = formatTime(state.timer.remaining);

  if (state.timer.remaining === 0) {
    stopTimer();
    state.chat.push({
      role: "companion",
      text: "刚刚那一小段时间，已经被你安静地留给自己了。",
    });
    saveState();
    if (activeMode === "focus") renderPanel();
  }
}

// ── 陪伴者回复 ───────────────────────────────────────────────

async function companionReply(text) {
  if (/死|自杀|不想活|伤害自己|撑不下去/.test(text)) {
    return "听起来你现在很危险，也很累。请先联系身边可信的人，或立刻拨打当地紧急电话。你不用一个人扛过这一刻。";
  }

  const chars = state.characters || [];
  const char = chars.find((c) => c.id === state.activeCharId) || chars[0];
  const systemPrompt = char
    ? `你叫「${char.name}」，是「我的停车位」App 里用户的线上陪伴者。${char.desc}。你只说中文，回复简短（1–4 句），不说教、不给建议，除非对方主动问你。`
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
    if (!res.ok) throw new Error("api_error");
    const data = await res.json();
    return data.text || companionFallback(text);
  } catch {
    return companionFallback(text);
  }
}

function companionFallback(text) {
  const value = text.toLowerCase();
  if (/累|疲|困|撑|崩|烦/.test(value)) {
    return "嗯，我听见了。那我们先不解决它，你可以只是在这里坐一会儿。";
  }
  if (/哭|难过|委屈|孤独|孤单/.test(value)) {
    return "这份难受可以先放在这里。我在，你不用把它整理得很像样。";
  }
  if (/乱|不知道|混乱|想不清/.test(value)) {
    return "不用马上讲清楚。你可以只说最靠近心口的那一句，剩下的我们慢慢来。";
  }
  if (/工作|上班|领导|同事|加班/.test(value)) {
    return "先让工作的声音留在门外一会儿。现在这里不是会议室，只是你的小屋。";
  }
  if (/谢谢|好点|好多了/.test(value)) {
    return "那就让这点松动多停一会儿。你不需要马上回到很用力的状态。";
  }
  const replies = [
    "我在。你可以慢慢说，也可以先停在这里。",
    "这句话已经够了，不用把所有来龙去脉都交代清楚。",
    "如果愿意，我们可以只看最重的那一小块。",
    "嗯，先把它放下。这里会替你留着。",
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}

// ── 工具函数 ─────────────────────────────────────────────────

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

// ── 初始化 ───────────────────────────────────────────────────

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
