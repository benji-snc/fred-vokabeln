(() => {
  const STORAGE_PROGRESS_PREFIX = "fred_vocab_progress_v1_";
  const STORAGE_META_PREFIX = "fred_vocab_meta_v1_";
  const STORAGE_PROFILES = "fred_vocab_profiles_v1";
  const STORAGE_ACTIVE_PROFILE = "fred_vocab_active_profile_v1";
  const STORAGE_CUSTOM = "fred_vocab_custom_v1";
  const DAILY_GOAL = 15;

  let profiles = loadJson(STORAGE_PROFILES, ["Fred", "Benny"]);
  if (!Array.isArray(profiles) || profiles.length === 0) profiles = ["Fred", "Benny"];
  let activeProfile = localStorage.getItem(STORAGE_ACTIVE_PROFILE) || profiles[0];
  if (!profiles.includes(activeProfile)) activeProfile = profiles[0];

  // Migrate legacy single-user progress if present
  const legacyRaw = localStorage.getItem("fred_vocab_progress_v1");
  if (legacyRaw && !localStorage.getItem(STORAGE_PROGRESS_PREFIX + "Fred")) {
    localStorage.setItem(STORAGE_PROGRESS_PREFIX + "Fred", legacyRaw);
  }

  let customVocab = loadJson(STORAGE_CUSTOM, []);
  let progress = loadJson(STORAGE_PROGRESS_PREFIX + activeProfile, {});
  let userMeta = loadUserMeta(activeProfile);
  let allVocab = [...(window.VOCAB_DATA || []), ...customVocab];

  let currentMode = "flashcard";
  let reverseDir = true; // Standard: Deutsch -> Englisch
  let hardOnly = false;
  let streak = 0;

  let currentPool = [];
  let currentCard = null;
  let cardFlipped = false;
  let mcLocked = false;
  let typeHintLen = 0;
  let typeAnswered = false;

  // Elements
  const profileSelect = document.getElementById("profileSelect");
  const addProfileBtn = document.getElementById("addProfileBtn");
  const levelBadge = document.getElementById("levelBadge");
  const filterToggleBtn = document.getElementById("filterToggleBtn");
  const filterDrawer = document.getElementById("filterDrawer");
  const filterSummaryText = document.getElementById("filterSummaryText");
  const unitSelect = document.getElementById("unitSelect");
  const sectionSelect = document.getElementById("sectionSelect");
  const dirToggle = document.getElementById("dirToggle");
  const dirLabel = document.getElementById("dirLabel");
  const hardOnlyToggle = document.getElementById("hardOnlyToggle");

  const statDailyStreak = document.getElementById("statDailyStreak");
  const statMastered = document.getElementById("statMastered");
  const statStreak = document.getElementById("statStreak");
  const dailyGoalLabel = document.getElementById("dailyGoalLabel");
  const dailyGoalBar = document.getElementById("dailyGoalBar");
  const toastEl = document.getElementById("toast");

  const modeTabs = document.querySelectorAll(".mode-tab");
  const views = {
    flashcard: document.getElementById("view-flashcard"),
    mc: document.getElementById("view-mc"),
    type: document.getElementById("view-type"),
    list: document.getElementById("view-list"),
  };

  // Flashcard elements
  const flashcardEl = document.getElementById("flashcard");
  const fcMeta = document.getElementById("fcMeta");
  const fcStars = document.getElementById("fcStars");
  const fcSpeak = document.getElementById("fcSpeak");
  const fcPrompt = document.getElementById("fcPrompt");
  const fcIpa = document.getElementById("fcIpa");
  const fcAnswerWrap = document.getElementById("fcAnswerWrap");
  const fcAnswer = document.getElementById("fcAnswer");
  const fcExample = document.getElementById("fcExample");
  const fcHint = document.getElementById("fcHint");
  const fcRetryBtn = document.getElementById("fcRetryBtn");
  const fcGoodBtn = document.getElementById("fcGoodBtn");

  // MC elements
  const mcBox = document.getElementById("mcBox");
  const mcMeta = document.getElementById("mcMeta");
  const mcSpeak = document.getElementById("mcSpeak");
  const mcPrompt = document.getElementById("mcPrompt");
  const mcIpa = document.getElementById("mcIpa");
  const mcOptions = document.getElementById("mcOptions");
  const mcFeedback = document.getElementById("mcFeedback");

  // Type elements
  const typeBox = document.getElementById("typeBox");
  const typeMeta = document.getElementById("typeMeta");
  const typeSpeak = document.getElementById("typeSpeak");
  const typePrompt = document.getElementById("typePrompt");
  const typeSubHint = document.getElementById("typeSubHint");
  const typeForm = document.getElementById("typeForm");
  const typeInput = document.getElementById("typeInput");
  const typeHintBtn = document.getElementById("typeHintBtn");
  const typeCheckBtn = document.getElementById("typeCheckBtn");
  const typeFeedback = document.getElementById("typeFeedback");
  const typeNextBtn = document.getElementById("typeNextBtn");

  // List elements
  const listSearchInput = document.getElementById("listSearchInput");
  const vocabList = document.getElementById("vocabList");

  // Modal elements
  const openImportBtn = document.getElementById("openImportBtn");
  const importModal = document.getElementById("importModal");
  const closeImportBtn = document.getElementById("closeImportBtn");
  const saveImportBtn = document.getElementById("saveImportBtn");
  const importTextarea = document.getElementById("importTextarea");
  const resetProgressBtn = document.getElementById("resetProgressBtn");

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function yesterdayStr() {
    const d = new Date(Date.now() - 86400000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function loadUserMeta(profile) {
    const meta = loadJson(STORAGE_META_PREFIX + profile, {
      dailyStreak: 0,
      lastPracticeDate: "",
      todayDate: todayStr(),
      todayCount: 0,
      xp: 0,
    });
    const today = todayStr();
    if (meta.todayDate !== today) {
      meta.todayDate = today;
      meta.todayCount = 0;
    }
    if (meta.lastPracticeDate && meta.lastPracticeDate !== today && meta.lastPracticeDate !== yesterdayStr()) {
      meta.dailyStreak = 0;
    }
    return meta;
  }

  function saveUserMeta() {
    localStorage.setItem(STORAGE_META_PREFIX + activeProfile, JSON.stringify(userMeta));
  }

  function recordPractice(isCorrect) {
    const today = todayStr();
    if (userMeta.todayDate !== today) {
      userMeta.todayDate = today;
      userMeta.todayCount = 0;
    }
    if (userMeta.lastPracticeDate !== today) {
      userMeta.dailyStreak =
        userMeta.lastPracticeDate === yesterdayStr() ? userMeta.dailyStreak + 1 : 1;
      userMeta.lastPracticeDate = today;
    }
    const prevCount = userMeta.todayCount;
    userMeta.todayCount += 1;
    userMeta.xp += isCorrect ? 10 : 2;
    saveUserMeta();

    if (prevCount < DAILY_GOAL && userMeta.todayCount >= DAILY_GOAL) {
      showToast("🎉 Tagesziel geschafft! Stark!");
    } else if (isCorrect && streak > 0 && streak % 5 === 0) {
      showToast(`🔥 ${streak}er Serie! Weiter so!`);
    }
  }

  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2500);
  }

  function animateEl(el, cls) {
    el.classList.remove("anim-pop", "anim-shake");
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function saveProgress() {
    localStorage.setItem(STORAGE_PROGRESS_PREFIX + activeProfile, JSON.stringify(progress));
  }

  function populateProfiles() {
    profileSelect.innerHTML = profiles
      .map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)
      .join("");
    profileSelect.value = activeProfile;
  }

  function switchProfile(name) {
    activeProfile = name;
    localStorage.setItem(STORAGE_ACTIVE_PROFILE, activeProfile);
    progress = loadJson(STORAGE_PROGRESS_PREFIX + activeProfile, {});
    userMeta = loadUserMeta(activeProfile);
    streak = 0;
    pickNextCard();
    renderCurrentMode();
  }

  function getStars(id) {
    return progress[id] || 0;
  }

  function setStars(id, val) {
    progress[id] = Math.max(0, Math.min(3, val));
    saveProgress();
  }

  function renderStars(n) {
    return "★".repeat(n) + "☆".repeat(3 - n);
  }

  function speakEnglish(text) {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/\([^)]*\)/g, "").replace(/\.\.\./g, "").trim();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = "en-GB";
    utter.rate = 0.92;
    window.speechSynthesis.speak(utter);
  }

  function populateFilters() {
    const units = ["Alle", ...new Set(allVocab.map((v) => v.unit))];
    const prevUnit = unitSelect.value || "Alle";
    unitSelect.innerHTML = units
      .map((u) => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`)
      .join("");
    unitSelect.value = units.includes(prevUnit) ? prevUnit : "Alle";
    populateSections();
  }

  function populateSections() {
    const selectedUnit = unitSelect.value;
    const base =
      selectedUnit === "Alle"
        ? allVocab
        : allVocab.filter((v) => v.unit === selectedUnit);
    const sections = ["Alle", ...new Set(base.map((v) => v.section))];
    const prevSec = sectionSelect.value || "Alle";
    sectionSelect.innerHTML = sections
      .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
      .join("");
    sectionSelect.value = sections.includes(prevSec) ? prevSec : "Alle";
  }

  function updateFilterSummary() {
    const u = unitSelect.value === "Alle" ? "Alle Units" : unitSelect.value;
    const s = sectionSelect.value === "Alle" ? "" : ` · ${sectionSelect.value}`;
    const d = reverseDir ? "DE → EN" : "EN → DE";
    const h = hardOnly ? " · ★<3" : "";
    filterSummaryText.textContent = `${u}${s} · ${d}${h}`;
  }

  function getFilteredVocab() {
    const u = unitSelect.value;
    const s = sectionSelect.value;
    return allVocab.filter((v) => {
      if (u !== "Alle" && v.unit !== u) return false;
      if (s !== "Alle" && v.section !== s) return false;
      if (hardOnly && getStars(v.id) >= 3) return false;
      return true;
    });
  }

  function getLevelTitle(xp) {
    const lvl = Math.floor(xp / 100) + 1;
    const titles = ["Starter", "Entdecker", "Wort-Fuchs", "Champion", "Vokabel-Profi", "Englisch-Ass"];
    const title = titles[Math.min(titles.length - 1, lvl - 1)];
    return `Level ${lvl} · ${title} (${xp} XP)`;
  }

  function updateStats() {
    const totalScope = allVocab.filter((v) => {
      if (unitSelect.value !== "Alle" && v.unit !== unitSelect.value) return false;
      if (sectionSelect.value !== "Alle" && v.section !== sectionSelect.value) return false;
      return true;
    });
    const mastered = totalScope.filter((v) => getStars(v.id) >= 3).length;
    statDailyStreak.textContent = userMeta.dailyStreak;
    statMastered.textContent = `${mastered}/${totalScope.length}`;
    statStreak.textContent = streak;

    const pct = Math.min(100, Math.round((userMeta.todayCount / DAILY_GOAL) * 100));
    dailyGoalLabel.textContent =
      userMeta.todayCount >= DAILY_GOAL
        ? `${userMeta.todayCount} / ${DAILY_GOAL} ✅`
        : `${userMeta.todayCount} / ${DAILY_GOAL}`;
    dailyGoalBar.style.width = `${pct}%`;
    levelBadge.textContent = getLevelTitle(userMeta.xp);
    updateFilterSummary();
  }

  function pickNextCard() {
    currentPool = getFilteredVocab();
    updateStats();
    if (currentPool.length === 0) {
      currentCard = null;
      return null;
    }
    const weighted = [];
    for (const item of currentPool) {
      const weight = 4 - getStars(item.id);
      for (let i = 0; i < weight; i++) weighted.push(item);
    }
    let next = weighted[Math.floor(Math.random() * weighted.length)];
    if (currentPool.length > 1 && currentCard && next.id === currentCard.id) {
      const alt = currentPool.filter((v) => v.id !== currentCard.id);
      next = alt[Math.floor(Math.random() * alt.length)];
    }
    currentCard = next;
    return currentCard;
  }

  function promptText(item) {
    return reverseDir ? item.de : item.en;
  }

  function answerText(item) {
    return reverseDir ? item.en : item.de;
  }

  function renderCurrentMode() {
    updateStats();
    if (currentMode === "list") {
      renderList();
      return;
    }
    if (!currentCard) pickNextCard();
    if (!currentCard) {
      renderEmptyState();
      return;
    }
    if (currentMode === "flashcard") renderFlashcard();
    else if (currentMode === "mc") renderMc();
    else if (currentMode === "type") renderType();
  }

  function renderEmptyState() {
    fcMeta.textContent = "Fertig!";
    fcPrompt.textContent = "Keine offenen Vokabeln in dieser Auswahl 🎉";
    fcIpa.textContent = "Öffne oben Filter und wähle eine andere Unit oder deaktiviere 'Nur schwierige'.";
    fcAnswerWrap.classList.add("hidden");
    mcPrompt.textContent = "Alle Vokabeln gemeistert 🎉";
    mcOptions.innerHTML = "";
    typePrompt.textContent = "Alle Vokabeln gemeistert 🎉";
  }

  function renderFlashcard() {
    cardFlipped = false;
    fcMeta.textContent = `${currentCard.unit} · ${currentCard.section}`;
    fcStars.textContent = renderStars(getStars(currentCard.id));
    fcPrompt.textContent = promptText(currentCard);
    fcIpa.textContent = !reverseDir && currentCard.ipa ? currentCard.ipa : "";
    fcAnswer.textContent = answerText(currentCard);
    fcExample.textContent = currentCard.example || "";
    fcAnswerWrap.classList.add("hidden");
    fcHint.classList.remove("hidden");
    fcSpeak.classList.toggle("hidden", reverseDir);
  }

  function flipFlashcard() {
    if (!currentCard) return;
    cardFlipped = !cardFlipped;
    fcAnswerWrap.classList.toggle("hidden", !cardFlipped);
    fcHint.classList.toggle("hidden", cardFlipped);
    if (cardFlipped && reverseDir) {
      fcSpeak.classList.remove("hidden");
    }
  }

  function renderMc() {
    mcLocked = false;
    mcFeedback.classList.add("hidden");
    mcMeta.textContent = `${currentCard.unit} · ${currentCard.section}`;
    mcPrompt.textContent = promptText(currentCard);
    mcIpa.textContent = !reverseDir && currentCard.ipa ? currentCard.ipa : "";
    mcSpeak.classList.toggle("hidden", reverseDir);

    const distractors = shuffle(
      allVocab.filter((v) => v.id !== currentCard.id && answerText(v) !== answerText(currentCard))
    ).slice(0, 3);
    const choices = shuffle([currentCard, ...distractors]);

    mcOptions.innerHTML = "";
    choices.forEach((choice) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mc-btn";
      btn.textContent = answerText(choice);
      btn.addEventListener("click", () => handleMcPick(btn, choice.id === currentCard.id));
      mcOptions.appendChild(btn);
    });
  }

  function handleMcPick(btn, isCorrect) {
    if (mcLocked) return;
    mcLocked = true;
    const buttons = mcOptions.querySelectorAll(".mc-btn");
    buttons.forEach((b) => {
      if (b.textContent === answerText(currentCard)) b.classList.add("correct");
    });

    if (isCorrect) {
      btn.classList.add("correct");
      streak++;
      setStars(currentCard.id, getStars(currentCard.id) + 1);
      recordPractice(true);
      animateEl(mcBox, "anim-pop");
      mcFeedback.textContent = "✅ Richtig! (+10 XP)";
      mcFeedback.className = "feedback ok";
    } else {
      btn.classList.add("wrong");
      streak = 0;
      setStars(currentCard.id, getStars(currentCard.id) - 1);
      recordPractice(false);
      animateEl(mcBox, "anim-shake");
      mcFeedback.textContent = `❌ Richtig wäre: ${answerText(currentCard)}`;
      mcFeedback.className = "feedback bad";
    }
    mcFeedback.classList.remove("hidden");
    updateStats();

    setTimeout(() => {
      pickNextCard();
      renderCurrentMode();
    }, 1150);
  }

  function renderType() {
    typeAnswered = false;
    typeHintLen = 0;
    typeInput.value = "";
    typeInput.disabled = false;
    typeInput.placeholder = reverseDir
      ? "Englische Antwort eintippen..."
      : "Deutsche Antwort eintippen...";
    typeFeedback.classList.add("hidden");
    typeNextBtn.classList.add("hidden");
    typeCheckBtn.classList.remove("hidden");
    typeHintBtn.classList.remove("hidden");

    typeMeta.textContent = `${currentCard.unit} · ${currentCard.section}`;
    typePrompt.textContent = promptText(currentCard);
    typeSubHint.textContent = !reverseDir && currentCard.ipa ? currentCard.ipa : "";
    typeSpeak.classList.toggle("hidden", reverseDir);
    setTimeout(() => typeInput.focus(), 50);
  }

  function normalizeText(str) {
    return str
      .toLowerCase()
      .replace(/\([^)]*\)/g, "")
      .replace(/[.!?…,:;'"„“‚‘]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isTypeCorrect(input, targetRaw) {
    const normInput = normalizeText(input);
    if (!normInput) return false;
    const variants = targetRaw.split(/[;/]/).map((s) => normalizeText(s)).filter(Boolean);
    return variants.some((v) => v === normInput) || normalizeText(targetRaw) === normInput;
  }

  function renderList() {
    const q = (listSearchInput.value || "").toLowerCase().trim();
    const items = getFilteredVocab().filter(
      (v) =>
        !q ||
        v.en.toLowerCase().includes(q) ||
        v.de.toLowerCase().includes(q) ||
        v.section.toLowerCase().includes(q)
    );
    vocabList.innerHTML = items
      .map(
        (v) => `
      <div class="vocab-item">
        <div>
          <div class="vocab-item-en">${escapeHtml(v.en)}</div>
          <div class="vocab-item-de">${escapeHtml(v.de)}</div>
          <div class="vocab-item-meta">${escapeHtml(v.unit)} · ${escapeHtml(v.section)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="stars">${renderStars(getStars(v.id))}</span>
          <button class="speak-btn" data-speak="${escapeHtml(v.en)}" type="button">🔊</button>
        </div>
      </div>`
      )
      .join("");

    vocabList.querySelectorAll("[data-speak]").forEach((btn) => {
      btn.addEventListener("click", () => speakEnglish(btn.getAttribute("data-speak")));
    });
  }

  function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Event Listeners
  profileSelect.addEventListener("change", () => {
    switchProfile(profileSelect.value);
  });

  addProfileBtn.addEventListener("click", () => {
    const name = prompt("Name für den neuen Benutzer (z. B. Mama, Papa, Max):");
    const clean = name ? name.trim() : "";
    if (!clean) return;
    if (!profiles.includes(clean)) {
      profiles.push(clean);
      localStorage.setItem(STORAGE_PROFILES, JSON.stringify(profiles));
    }
    populateProfiles();
    switchProfile(clean);
  });

  filterToggleBtn.addEventListener("click", () => {
    filterDrawer.classList.toggle("hidden");
  });

  unitSelect.addEventListener("change", () => {
    populateSections();
    pickNextCard();
    renderCurrentMode();
  });

  sectionSelect.addEventListener("change", () => {
    pickNextCard();
    renderCurrentMode();
  });

  dirToggle.addEventListener("change", () => {
    reverseDir = dirToggle.checked;
    dirLabel.textContent = reverseDir ? "Deutsch → Englisch" : "Englisch → Deutsch";
    renderCurrentMode();
  });

  hardOnlyToggle.addEventListener("change", () => {
    hardOnly = hardOnlyToggle.checked;
    pickNextCard();
    renderCurrentMode();
  });

  modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      currentMode = tab.dataset.mode;
      modeTabs.forEach((t) => t.classList.toggle("active", t === tab));
      Object.entries(views).forEach(([k, el]) => {
        el.classList.toggle("hidden", k !== currentMode);
      });
      renderCurrentMode();
    });
  });

  flashcardEl.addEventListener("click", (e) => {
    if (e.target.closest("#fcSpeak")) return;
    flipFlashcard();
  });

  fcSpeak.addEventListener("click", (e) => {
    e.stopPropagation();
    if (currentCard) speakEnglish(currentCard.en);
  });

  mcSpeak.addEventListener("click", () => {
    if (currentCard) speakEnglish(currentCard.en);
  });

  typeSpeak.addEventListener("click", () => {
    if (currentCard) speakEnglish(currentCard.en);
  });

  fcGoodBtn.addEventListener("click", () => {
    if (!currentCard) return;
    streak++;
    setStars(currentCard.id, getStars(currentCard.id) + 1);
    recordPractice(true);
    animateEl(flashcardEl, "anim-pop");
    pickNextCard();
    renderCurrentMode();
  });

  fcRetryBtn.addEventListener("click", () => {
    if (!currentCard) return;
    streak = 0;
    setStars(currentCard.id, getStars(currentCard.id) - 1);
    recordPractice(false);
    animateEl(flashcardEl, "anim-shake");
    pickNextCard();
    renderCurrentMode();
  });

  typeHintBtn.addEventListener("click", () => {
    if (!currentCard || typeAnswered) return;
    const target = answerText(currentCard).split(/[;/]/)[0].trim();
    typeHintLen = Math.min(target.length, typeHintLen + 2);
    typeInput.value = target.slice(0, typeHintLen);
    typeInput.focus();
  });

  typeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!currentCard || typeAnswered) return;
    typeAnswered = true;
    typeInput.disabled = true;
    const ok = isTypeCorrect(typeInput.value, answerText(currentCard));
    if (ok) {
      streak++;
      setStars(currentCard.id, getStars(currentCard.id) + 1);
      recordPractice(true);
      animateEl(typeBox, "anim-pop");
      typeFeedback.textContent = `✅ Super! (+10 XP) — ${answerText(currentCard)}`;
      typeFeedback.className = "feedback ok";
    } else {
      streak = 0;
      setStars(currentCard.id, getStars(currentCard.id) - 1);
      recordPractice(false);
      animateEl(typeBox, "anim-shake");
      typeFeedback.textContent = `❌ Richtig ist: ${answerText(currentCard)}`;
      typeFeedback.className = "feedback bad";
    }
    typeFeedback.classList.remove("hidden");
    typeNextBtn.classList.remove("hidden");
    typeCheckBtn.classList.add("hidden");
    typeHintBtn.classList.add("hidden");
    updateStats();
  });

  typeNextBtn.addEventListener("click", () => {
    pickNextCard();
    renderCurrentMode();
  });

  listSearchInput.addEventListener("input", renderList);

  // Import Modal
  openImportBtn.addEventListener("click", () => importModal.classList.remove("hidden"));
  closeImportBtn.addEventListener("click", () => importModal.classList.add("hidden"));

  saveImportBtn.addEventListener("click", () => {
    const lines = importTextarea.value
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    const added = [];
    lines.forEach((line, idx) => {
      const parts = line.split(";").map((p) => p.trim());
      if (parts.length >= 2 && parts[0] && parts[1]) {
        added.push({
          id: `custom-${Date.now()}-${idx}`,
          en: parts[0],
          de: parts[1],
          unit: parts[2] || "Eigene",
          section: parts[3] || "Importiert",
          ipa: "",
          example: parts[4] || "",
        });
      }
    });
    if (added.length) {
      customVocab = [...customVocab, ...added];
      localStorage.setItem(STORAGE_CUSTOM, JSON.stringify(customVocab));
      allVocab = [...(window.VOCAB_DATA || []), ...customVocab];
      populateFilters();
      pickNextCard();
      renderCurrentMode();
      importTextarea.value = "";
      importModal.classList.add("hidden");
      showToast(`✅ ${added.length} Vokabeln importiert`);
    }
  });

  resetProgressBtn.addEventListener("click", () => {
    if (confirm(`Wirklich alle Sterne, XP und Streaks für "${activeProfile}" zurücksetzen?`)) {
      progress = {};
      streak = 0;
      userMeta = {
        dailyStreak: 0,
        lastPracticeDate: "",
        todayDate: todayStr(),
        todayCount: 0,
        xp: 0,
      };
      saveProgress();
      saveUserMeta();
      pickNextCard();
      renderCurrentMode();
      importModal.classList.add("hidden");
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  // Init
  populateProfiles();
  populateFilters();
  pickNextCard();
  renderCurrentMode();
})();
