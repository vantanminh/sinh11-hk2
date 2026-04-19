"use strict";

const STORAGE_KEY = "tin11_hk2_mcq_v1";
const DISPLAY_KEYS = ["A", "B", "C", "D", "E", "F"];
const PYTHON_KEYWORDS = new Set([
  "and",
  "as",
  "break",
  "class",
  "continue",
  "def",
  "elif",
  "else",
  "except",
  "False",
  "finally",
  "for",
  "from",
  "if",
  "import",
  "in",
  "is",
  "None",
  "not",
  "or",
  "pass",
  "return",
  "True",
  "try",
  "while",
  "with"
]);
const PYTHON_BUILTINS = new Set([
  "dict",
  "enumerate",
  "float",
  "input",
  "int",
  "len",
  "list",
  "max",
  "min",
  "open",
  "perf_counter",
  "print",
  "range",
  "set",
  "str",
  "sum",
  "tuple"
]);
const INLINE_CODE_PATTERNS = [
  /\b[A-Za-z_]\w*(?:\.\w+)+\([^()\n]{0,120}\)/g,
  /\b(?:print|len|range|input|open|int|float|str|sum|max|min|list|dict|set|tuple|enumerate)\([^()\n]{0,120}\)/g,
  /\b[A-Za-z_]\w*\[[^\]\n]{1,60}\]/g,
  /\b[A-Za-z_]\w*\s*=\s*\[[^\n]{1,120}\]/g,
  /\b[A-Za-z_]\w*\s*=\s*\([^\n]{1,120}?\)\s*(?:\/\/|[+\-*/%])\s*[-\w.]+/g
];

const els = {
  examTitle: document.getElementById("examTitle"),
  examSection: document.getElementById("examSection"),
  summary: document.getElementById("summary"),
  revealModeSelect: document.getElementById("revealModeSelect"),
  submitBtn: document.getElementById("submitBtn"),
  shuffleQuestionsToggle: document.getElementById("shuffleQuestionsToggle"),
  shuffleOptionsToggle: document.getElementById("shuffleOptionsToggle"),
  resetBtn: document.getElementById("resetBtn"),
  openPaletteBtn: document.getElementById("openPaletteBtn"),
  closePaletteBtn: document.getElementById("closePaletteBtn"),
  paletteDesktop: document.getElementById("paletteDesktop"),
  paletteMobile: document.getElementById("paletteMobile"),
  overlay: document.getElementById("overlay"),
  qPosition: document.getElementById("qPosition"),
  qNumber: document.getElementById("qNumber"),
  answerChip: document.getElementById("answerChip"),
  questionText: document.getElementById("questionText"),
  options: document.getElementById("options"),
  prevBtn: document.getElementById("prevBtn"),
  clearBtn: document.getElementById("clearBtn"),
  nextBtn: document.getElementById("nextBtn"),
  explainBtn: document.getElementById("explainBtn"),
  explainBox: document.getElementById("explainBox")
};

let data = null;
let explainData = {};
let sourceQuestions = [];
let questions = [];
let questionIndexByNumber = new Map();
let showExplain = false;

const state = {
  current: 0,
  answers: {},
  revealMode: "submit",
  submitted: false,
  shuffleQuestions: false,
  shuffleOptions: false,
  questionOrder: [],
  optionOrders: {}
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);

    if (typeof saved.current === "number") state.current = saved.current;
    if (saved.answers && typeof saved.answers === "object") {
      state.answers = { ...saved.answers };
    }
    if (saved.revealMode === "submit" || saved.revealMode === "instant") {
      state.revealMode = saved.revealMode;
    }
    if (typeof saved.submitted === "boolean") {
      state.submitted = saved.submitted;
    } else if (typeof saved.showAnswers === "boolean") {
      state.submitted = saved.showAnswers;
    }
    if (typeof saved.shuffleQuestions === "boolean") {
      state.shuffleQuestions = saved.shuffleQuestions;
    }
    if (typeof saved.shuffleOptions === "boolean") {
      state.shuffleOptions = saved.shuffleOptions;
    }
    if (Array.isArray(saved.questionOrder)) {
      state.questionOrder = [...saved.questionOrder];
    }
    if (saved.optionOrders && typeof saved.optionOrders === "object") {
      state.optionOrders = { ...saved.optionOrders };
    }
  } catch (_) {}
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {}
}

function optionKey(optionRaw) {
  const match = String(optionRaw || "").trim().match(/^[A-D]/i);
  return match ? match[0].toUpperCase() : "";
}

function optionText(optionRaw) {
  return String(optionRaw || "")
    .trim()
    .replace(/^[A-D](?:\s*[.)])?\s*/i, "")
    .trim();
}

function parseQuestion(rawQuestion) {
  const options = Array.isArray(rawQuestion?.options) ? rawQuestion.options : [];

  return {
    number: Number(rawQuestion?.number),
    question: String(rawQuestion?.question || ""),
    code: String(rawQuestion?.code || ""),
    options: options.map((option, index) => ({
      key: optionKey(option) || DISPLAY_KEYS[index] || String(index + 1),
      text: optionText(option) || String(option || "")
    })),
    answer: String(rawQuestion?.answer || "").trim().toUpperCase()
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlightCode(code) {
  const source = String(code || "");
  const tokenPattern = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(#.*$)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b/gm;
  let html = "";
  let lastIndex = 0;

  source.replace(tokenPattern, (match, stringToken, commentToken, numberToken, wordToken, offset) => {
    html += escapeHtml(source.slice(lastIndex, offset));

    if (stringToken) {
      html += `<span class="code-token string">${escapeHtml(stringToken)}</span>`;
    } else if (commentToken) {
      html += `<span class="code-token comment">${escapeHtml(commentToken)}</span>`;
    } else if (numberToken) {
      html += `<span class="code-token number">${numberToken}</span>`;
    } else if (wordToken) {
      if (PYTHON_KEYWORDS.has(wordToken)) {
        html += `<span class="code-token keyword">${wordToken}</span>`;
      } else if (PYTHON_BUILTINS.has(wordToken)) {
        html += `<span class="code-token builtin">${wordToken}</span>`;
      } else {
        html += escapeHtml(wordToken);
      }
    } else {
      html += escapeHtml(match);
    }

    lastIndex = offset + match.length;
    return match;
  });

  html += escapeHtml(source.slice(lastIndex));
  return html;
}

function collectInlineCodeRanges(text) {
  const source = String(text || "");
  const ranges = [];

  INLINE_CODE_PATTERNS.forEach((pattern) => {
    pattern.lastIndex = 0;

    let match = pattern.exec(source);
    while (match) {
      let end = match.index + match[0].length;

      while (end > match.index && /[.,;:!?]/.test(source[end - 1])) {
        end -= 1;
      }

      if (end > match.index) {
        ranges.push({ start: match.index, end });
      }

      match = pattern.exec(source);
    }
  });

  ranges.sort((left, right) => left.start - right.start || right.end - left.end);

  return ranges.reduce((merged, range) => {
    const previous = merged[merged.length - 1];

    if (!previous || range.start > previous.end) {
      merged.push({ ...range });
      return merged;
    }

    previous.end = Math.max(previous.end, range.end);
    return merged;
  }, []);
}

function formatInlineCode(text) {
  const source = String(text || "");
  const ranges = collectInlineCodeRanges(source);

  if (!ranges.length) return escapeHtml(source);

  let html = "";
  let cursor = 0;

  ranges.forEach((range) => {
    html += escapeHtml(source.slice(cursor, range.start));
    html += `<code class="inline-code">${escapeHtml(source.slice(range.start, range.end))}</code>`;
    cursor = range.end;
  });

  html += escapeHtml(source.slice(cursor));
  return html;
}

function looksLikeCodeLine(line) {
  const trimmed = String(line || "").trim();

  if (!trimmed) return false;

  return (
    /^(?:#|from\b|import\b|def\b|class\b|for\b|while\b|if\b|elif\b|else\b|return\b|print\b|input\b|open\b|del\b|break\b|continue\b|pass\b)/.test(trimmed) ||
    /^[A-Za-z_]\w*\s*=\s*/.test(trimmed) ||
    /^[A-Za-z_]\w*\.\w+\([^)]*\)\s*$/.test(trimmed) ||
    /^[A-Za-z_]\w*(?:\[[^\]]+\])?\s*=\s*.+/.test(trimmed) ||
    (/:[\s]*$/.test(trimmed) && /\b(?:for|while|if|elif|else|def|class)\b/.test(trimmed))
  );
}

function looksLikeDataLine(line) {
  const trimmed = String(line || "").trim();

  if (!trimmed) return false;

  return (
    /^[A-Za-z0-9_.-]+\.txt$/i.test(trimmed) ||
    (/^[\p{L}\d_.-]+(?:\s+[\p{L}\d_.-]+)+$/u.test(trimmed) && /\d/.test(trimmed))
  );
}

function trimBlockContent(text) {
  return String(text || "").replace(/^\n+|\n+$/g, "");
}

function splitQuestionBlocks(text) {
  const source = String(text || "");
  if (!source.trim()) return [];

  const lines = source.split(/\r?\n/);
  const blocks = [];
  let textBuffer = [];
  let codeBuffer = [];
  let insideCode = false;

  const flushText = () => {
    const content = trimBlockContent(textBuffer.join("\n"));
    if (content) blocks.push({ type: "text", content });
    textBuffer = [];
  };

  const flushCode = () => {
    const content = trimBlockContent(codeBuffer.join("\n"));
    if (content) blocks.push({ type: "code", content });
    codeBuffer = [];
    insideCode = false;
  };

  lines.forEach((line) => {
    const codeLike = looksLikeCodeLine(line);
    const dataLike = looksLikeDataLine(line);
    const keepWithCode = insideCode && (line.trim() === "" || line.startsWith(" ") || dataLike);

    if (codeLike || keepWithCode) {
      if (!insideCode) flushText();
      codeBuffer.push(line);
      insideCode = true;
      return;
    }

    if (insideCode) flushCode();
    textBuffer.push(line);
  });

  if (insideCode) {
    flushCode();
  } else {
    flushText();
  }

  return blocks;
}

function createQuestionTextBlock(text) {
  const block = document.createElement("div");
  block.className = "question-stem";
  block.innerHTML = formatInlineCode(text);
  return block;
}

function createQuestionCodeBlock(code) {
  const pre = document.createElement("pre");
  const codeElement = document.createElement("code");

  pre.className = "question-code";
  codeElement.innerHTML = highlightCode(code);
  pre.appendChild(codeElement);

  return pre;
}

function shuffled(items) {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }

  return next;
}

function isPermutation(order, expectedValues) {
  if (!Array.isArray(order) || order.length !== expectedValues.length) return false;

  const normalizedOrder = order.map((value) => String(value));
  const normalizedExpected = expectedValues.map((value) => String(value));

  if (new Set(normalizedOrder).size !== normalizedExpected.length) return false;

  return normalizedExpected.every((value) => normalizedOrder.includes(value));
}

function buildQuestionOrder() {
  return shuffled(sourceQuestions.map((question) => question.number));
}

function buildOptionOrder(question) {
  return shuffled(question.options.map((option) => option.key));
}

function rebuildQuestions(preserveNumber = null) {
  const order = state.shuffleQuestions
    ? state.questionOrder
    : sourceQuestions.map((question) => question.number);
  const sourceByNumber = new Map(sourceQuestions.map((question) => [question.number, question]));

  questions = order
    .map((number) => sourceByNumber.get(Number(number)))
    .filter(Boolean)
    .map((question) => {
      const optionOrder = state.shuffleOptions
        ? state.optionOrders[question.number]
        : question.options.map((option) => option.key);
      const optionByKey = new Map(question.options.map((option) => [option.key, option]));
      const orderedOptions = optionOrder
        .map((key) => optionByKey.get(String(key).toUpperCase()))
        .filter(Boolean);

      return {
        ...question,
        options: orderedOptions.length === question.options.length ? orderedOptions : [...question.options]
      };
    });

  questionIndexByNumber = new Map(
    questions.map((question, index) => [question.number, index])
  );

  if (preserveNumber !== null && questionIndexByNumber.has(preserveNumber)) {
    state.current = questionIndexByNumber.get(preserveNumber);
    return;
  }

  if (state.current < 0) state.current = 0;
  if (state.current > questions.length - 1) {
    state.current = Math.max(questions.length - 1, 0);
  }
}

function normalizeState() {
  const questionByNumber = new Map(
    sourceQuestions.map((question) => [String(question.number), question])
  );

  Object.keys(state.answers).forEach((key) => {
    const question = questionByNumber.get(String(key));
    const selectedKey = String(state.answers[key] || "").trim().toUpperCase();

    if (!question) {
      delete state.answers[key];
      return;
    }

    const validKeys = new Set(question.options.map((option) => option.key));
    if (!validKeys.has(selectedKey)) {
      delete state.answers[key];
      return;
    }

    state.answers[key] = selectedKey;
  });

  if (state.revealMode !== "submit" && state.revealMode !== "instant") {
    state.revealMode = "submit";
  }

  if (typeof state.submitted !== "boolean") state.submitted = false;
  if (typeof state.shuffleQuestions !== "boolean") state.shuffleQuestions = false;
  if (typeof state.shuffleOptions !== "boolean") state.shuffleOptions = false;

  if (state.shuffleQuestions) {
    const expectedNumbers = sourceQuestions.map((question) => question.number);
    state.questionOrder = isPermutation(state.questionOrder, expectedNumbers)
      ? state.questionOrder.map((value) => Number(value))
      : buildQuestionOrder();
  } else {
    state.questionOrder = sourceQuestions.map((question) => question.number);
  }

  if (state.shuffleOptions) {
    const nextOptionOrders = {};

    sourceQuestions.forEach((question) => {
      const expectedKeys = question.options.map((option) => option.key);
      const savedOrder = state.optionOrders?.[question.number];

      nextOptionOrders[question.number] = isPermutation(savedOrder, expectedKeys)
        ? savedOrder.map((value) => String(value).toUpperCase())
        : buildOptionOrder(question);
    });

    state.optionOrders = nextOptionOrders;
  } else {
    state.optionOrders = {};
  }

  rebuildQuestions();
}

function selectedOf(question) {
  return state.answers[question.number] || "";
}

function getCounts() {
  const answered = sourceQuestions.filter((question) => !!selectedOf(question)).length;
  const correct = sourceQuestions.filter(
    (question) => selectedOf(question) === question.answer
  ).length;

  return { answered, correct };
}

function isQuestionRevealed(question) {
  if (state.revealMode === "instant") {
    return !!selectedOf(question);
  }

  return state.submitted;
}

function answerDisplayKey(question) {
  const answerIndex = question.options.findIndex((option) => option.key === question.answer);
  return DISPLAY_KEYS[answerIndex] || question.answer;
}

function renderHeader() {
  els.examTitle.textContent =
    data?.meta?.subtitleRaw || data?.meta?.titleRaw || "Ôn tập";
  els.examSection.textContent = data?.meta?.sectionRaw || "";

  const { answered, correct } = getCounts();
  const total = sourceQuestions.length;
  const showScore = state.revealMode === "instant" || state.submitted;

  els.openPaletteBtn.textContent = total > 0 ? `1–${total}` : "0";

  els.summary.textContent = showScore
    ? `${answered}/${total} · ${correct} đúng`
    : `${answered}/${total}`;

  els.revealModeSelect.value = state.revealMode;
  els.shuffleQuestionsToggle.checked = state.shuffleQuestions;
  els.shuffleOptionsToggle.checked = state.shuffleOptions;

  els.submitBtn.hidden = state.revealMode !== "submit";
  els.submitBtn.disabled = total === 0;
  els.submitBtn.textContent = state.submitted ? "Đã nộp" : "Nộp bài";
  els.submitBtn.classList.toggle("active", state.submitted);
  els.submitBtn.setAttribute("aria-pressed", String(state.submitted));
  els.submitBtn.title = state.submitted
    ? "Đáp án đang hiển thị cho toàn bộ bài."
    : "Hiện đáp án cho toàn bộ bài khi nộp.";
}

function classForPaletteButton(question) {
  const selected = selectedOf(question);
  const classes = ["q-btn"];

  if (selected) {
    if (isQuestionRevealed(question)) {
      classes.push(selected === question.answer ? "correct" : "wrong");
    } else {
      classes.push("answered");
    }
  }

  if (questions[state.current]?.number === question.number) {
    classes.push("current");
  }

  return classes.join(" ");
}

function renderPaletteInto(container) {
  container.innerHTML = questions
    .map(
      (question) =>
        `<button type="button" class="${classForPaletteButton(question)}" data-number="${question.number}" aria-label="Câu ${question.number}">${question.number}</button>`
    )
    .join("");
}

function renderPalette() {
  renderPaletteInto(els.paletteDesktop);
  renderPaletteInto(els.paletteMobile);
}

function selectOption(question, optionKeyValue) {
  if (!question.options.some((option) => option.key === optionKeyValue)) return;

  state.answers[question.number] = optionKeyValue;
  saveState();
  render();
}

function renderQuestion() {
  const question = questions[state.current];
  if (!question) return;

  const selected = selectedOf(question);
  const revealed = isQuestionRevealed(question);

  els.qPosition.textContent = `${state.current + 1}/${questions.length}`;
  els.qNumber.textContent = `Câu ${question.number}`;
  els.answerChip.hidden = !revealed;
  els.answerChip.textContent = `Đáp án: ${answerDisplayKey(question)}`;
  els.questionText.innerHTML = "";
  const questionBlocks = splitQuestionBlocks(question.question);

  questionBlocks.forEach((block) => {
    const element = block.type === "code"
      ? createQuestionCodeBlock(block.content)
      : createQuestionTextBlock(block.content);

    els.questionText.appendChild(element);
  });

  if (question.code) {
    els.questionText.appendChild(createQuestionCodeBlock(question.code));
  }

  els.questionText.scrollTop = 0;

  const fragment = document.createDocumentFragment();

  question.options.forEach((option, index) => {
    const btn = document.createElement("button");
    const label = document.createElement("span");
    const copy = document.createElement("span");

    btn.type = "button";
    btn.className = "option-btn";
    btn.dataset.key = option.key;
    btn.dataset.displayKey = DISPLAY_KEYS[index] || String(index + 1);

    label.className = "option-label";
    label.textContent = DISPLAY_KEYS[index] || String(index + 1);

    copy.className = "option-copy";
    copy.innerHTML = formatInlineCode(option.text);

    btn.append(label, copy);

    if (selected === option.key) {
      btn.classList.add("selected");
    }

    if (revealed) {
      if (option.key === question.answer) btn.classList.add("correct");
      if (selected === option.key && option.key !== question.answer) {
        btn.classList.add("wrong");
      }
    }

    btn.addEventListener("click", () => {
      selectOption(question, option.key);
    });

    fragment.appendChild(btn);
  });

  els.options.innerHTML = "";
  els.options.appendChild(fragment);

  els.prevBtn.disabled = state.current === 0;
  els.nextBtn.disabled = state.current === questions.length - 1;
  els.clearBtn.disabled = !selected;
}

function renderExplainBox() {
  const question = questions[state.current];
  els.explainBtn.classList.toggle("active", showExplain);

  if (!showExplain || !question) {
    els.explainBox.hidden = true;
    return;
  }

  const text = explainData[String(question.number)];
  if (!text) {
    els.explainBox.hidden = true;
    return;
  }

  els.explainBox.hidden = false;
  els.explainBox.innerHTML =
    `<div class="explain-label">Giải thích</div><div>${escapeHtml(text)}</div>`;
}

function toggleExplain() {
  showExplain = !showExplain;
  renderExplainBox();
}

function render() {
  renderHeader();
  renderPalette();
  renderQuestion();
  renderExplainBox();
}

function goTo(index) {
  state.current = Math.max(0, Math.min(index, questions.length - 1));
  saveState();
  render();
}

function clearCurrent() {
  const question = questions[state.current];
  if (!question) return;

  delete state.answers[question.number];
  saveState();
  render();
}

function submitAll() {
  const total = sourceQuestions.length;
  const { answered } = getCounts();

  if (!total) return;

  if (answered < total) {
    const shouldSubmit = confirm(
      `Bạn mới làm ${answered}/${total} câu. Vẫn nộp bài?`
    );
    if (!shouldSubmit) return;
  }

  state.submitted = true;
  saveState();
  render();
}

function setRevealMode(mode) {
  state.revealMode = mode === "instant" ? "instant" : "submit";
  saveState();
  render();
}

function setShuffleQuestions(enabled) {
  const preserveNumber = questions[state.current]?.number ?? null;

  state.shuffleQuestions = enabled;
  state.questionOrder = enabled
    ? buildQuestionOrder()
    : sourceQuestions.map((question) => question.number);

  rebuildQuestions(preserveNumber);
  saveState();
  render();
}

function setShuffleOptions(enabled) {
  const preserveNumber = questions[state.current]?.number ?? null;

  state.shuffleOptions = enabled;

  if (enabled) {
    const nextOrders = {};
    sourceQuestions.forEach((question) => {
      nextOrders[question.number] = buildOptionOrder(question);
    });
    state.optionOrders = nextOrders;
  } else {
    state.optionOrders = {};
  }

  rebuildQuestions(preserveNumber);
  saveState();
  render();
}

function openOverlay() {
  els.overlay.hidden = false;
}

function closeOverlay() {
  els.overlay.hidden = true;
}

function selectDisplayedOption(question, displayKey) {
  const displayIndex = DISPLAY_KEYS.indexOf(displayKey);
  if (displayIndex < 0) return;

  const option = question.options[displayIndex];
  if (!option) return;

  selectOption(question, option.key);
}

function bindEvents() {
  els.revealModeSelect.addEventListener("change", (event) => {
    setRevealMode(event.target.value);
  });
  els.submitBtn.addEventListener("click", submitAll);
  els.shuffleQuestionsToggle.addEventListener("change", (event) => {
    setShuffleQuestions(event.target.checked);
  });
  els.shuffleOptionsToggle.addEventListener("change", (event) => {
    setShuffleOptions(event.target.checked);
  });
  els.resetBtn.addEventListener("click", resetAll);

  els.prevBtn.addEventListener("click", () => goTo(state.current - 1));
  els.nextBtn.addEventListener("click", () => goTo(state.current + 1));
  els.clearBtn.addEventListener("click", clearCurrent);

  els.openPaletteBtn.addEventListener("click", openOverlay);
  els.closePaletteBtn.addEventListener("click", closeOverlay);
  els.explainBtn.addEventListener("click", toggleExplain);

  [els.paletteDesktop, els.paletteMobile].forEach((container) => {
    container.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-number]");
      if (!btn) return;

      const index = questionIndexByNumber.get(Number(btn.dataset.number));
      if (typeof index === "number") goTo(index);
      closeOverlay();
    });
  });

  els.overlay.addEventListener("click", (event) => {
    if (event.target === els.overlay) closeOverlay();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeOverlay();
  });

  document.addEventListener("keydown", (event) => {
    if (!els.overlay.hidden && event.key === "Escape") {
      closeOverlay();
      return;
    }

    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(state.current - 1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(state.current + 1);
      return;
    }

    const map = {
      "1": "A",
      "2": "B",
      "3": "C",
      "4": "D",
      a: "A",
      b: "B",
      c: "C",
      d: "D",
      A: "A",
      B: "B",
      C: "C",
      D: "D"
    };

    const displayKey = map[event.key];
    if (!displayKey) return;

    const question = questions[state.current];
    if (!question) return;

    selectDisplayedOption(question, displayKey);
  });
}

function resetAll() {
  if (!confirm("Xóa toàn bộ lựa chọn và trạng thái nộp bài?")) return;

  state.answers = {};
  state.current = 0;
  state.submitted = false;
  saveState();
  render();
}

async function init() {
  try {
    const [questionRes, explainRes] = await Promise.all([
      fetch("question.json", { cache: "no-store" }),
      fetch("explain.json", { cache: "no-store" }).catch(() => null)
    ]);

    if (!questionRes.ok) throw new Error("Không tải được question.json");

    data = await questionRes.json();
    sourceQuestions = Array.isArray(data.questions)
      ? data.questions.map(parseQuestion)
      : [];

    if (explainRes && explainRes.ok) {
      const explainJson = await explainRes.json();
      explainData = explainJson.explanations || {};
    }

    loadState();
    normalizeState();
    bindEvents();
    render();
  } catch (error) {
    console.error(error);
    els.examTitle.textContent = "Không tải được dữ liệu";
    els.examSection.textContent = "Hãy mở bằng localhost / Live Server.";
    els.summary.textContent = "Lỗi";
    els.questionText.textContent = "Không tải được question.json";
    els.options.innerHTML = "";
  }
}

init();