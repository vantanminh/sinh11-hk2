"use strict";

const LESSON_DATA_ROOT = "21/data/";
const AVAILABLE_LESSONS = [
  { id: "20", file: "bai20.json", label: "Bài 20" },
  { id: "21", file: "bai21.json", label: "Bài 21" },
  { id: "23", file: "bai23.json", label: "Bài 23" },
  { id: "24", file: "bai24.json", label: "Bài 24" },
  { id: "26", file: "bai26.json", label: "Bài 26" }
];
const ACTIVE_LESSON_STORAGE_KEY = "sinh11_active_lesson_v1";
const LEGACY_STORAGE_KEYS = {
  20: "sinh11_bai20_quiz_v1"
};

function normalizeLessonId(value) {
  const match = String(value || "").trim().match(/\d+/);
  return match ? String(Number(match[0])) : "";
}

function findLessonById(value) {
  const normalizedId = normalizeLessonId(value);
  return AVAILABLE_LESSONS.find((lesson) => lesson.id === normalizedId) || null;
}

function readStoredActiveLessonId() {
  try {
    return localStorage.getItem(ACTIVE_LESSON_STORAGE_KEY) || "";
  } catch (_) {
    return "";
  }
}

function persistActiveLessonSelection(lessonId) {
  const normalizedId = normalizeLessonId(lessonId);
  if (!normalizedId) return;

  try {
    localStorage.setItem(ACTIVE_LESSON_STORAGE_KEY, normalizedId);
  } catch (_) {}
}

function resolveInitialLesson() {
  const params = new URLSearchParams(window.location.search);
  const requestedLessonId = normalizeLessonId(params.get("lesson") || params.get("bai"));

  return (
    findLessonById(requestedLessonId) ||
    findLessonById(readStoredActiveLessonId()) ||
    AVAILABLE_LESSONS[0]
  );
}

const activeLesson = resolveInitialLesson();
const DATA_URL = `${LESSON_DATA_ROOT}${activeLesson.file}`;
const DATA_BASE_PATH = (() => {
  const normalized = DATA_URL.replace(/\\/g, "/");
  const lastSlashIndex = normalized.lastIndexOf("/");
  return lastSlashIndex >= 0 ? normalized.slice(0, lastSlashIndex + 1) : "";
})();
const STORAGE_KEY = `sinh11_bai${activeLesson.id}_quiz_v2`;
const DISPLAY_KEYS = ["A", "B", "C", "D", "E", "F"];
const STATEMENT_KEYS = ["a", "b", "c", "d", "e", "f"];
const TRUE_FALSE_CHOICES = [
  { value: "true", label: "Đúng" },
  { value: "false", label: "Sai" }
];
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
  mobileExamTitle: document.getElementById("mobileExamTitle"),
  examSection: document.getElementById("examSection"),
  summary: document.getElementById("summary"),
  lessonSelect: document.getElementById("lessonSelect"),
  revealModeSelect: document.getElementById("revealModeSelect"),
  submitBtn: document.getElementById("submitBtn"),
  shuffleQuestionsToggle: document.getElementById("shuffleQuestionsToggle"),
  shuffleOptionsToggle: document.getElementById("shuffleOptionsToggle"),
  resetBtn: document.getElementById("resetBtn"),
  openToolsBtn: document.getElementById("openToolsBtn"),
  closeToolsBtn: document.getElementById("closeToolsBtn"),
  mobilePaletteBtn: document.getElementById("mobilePaletteBtn"),
  openPaletteBtn: document.getElementById("openPaletteBtn"),
  closePaletteBtn: document.getElementById("closePaletteBtn"),
  paletteSummary: document.getElementById("paletteSummary"),
  paletteDesktop: document.getElementById("paletteDesktop"),
  paletteMobile: document.getElementById("paletteMobile"),
  toolsBackdrop: document.getElementById("toolsBackdrop"),
  toolsDesktopMount: document.getElementById("toolsDesktopMount"),
  toolsSheetShell: document.getElementById("toolsSheetShell"),
  toolsPanel: document.getElementById("toolsPanel"),
  overlay: document.getElementById("overlay"),
  imageLightbox: document.getElementById("imageLightbox"),
  imageLightboxPanel: document.getElementById("imageLightboxPanel"),
  imageLightboxMeta: document.getElementById("imageLightboxMeta"),
  imageLightboxViewport: document.getElementById("imageLightboxViewport"),
  imageLightboxImage: document.getElementById("imageLightboxImage"),
  imageLightboxCaption: document.getElementById("imageLightboxCaption"),
  imageLightboxHint: document.getElementById("imageLightboxHint"),
  closeImageLightboxBtn: document.getElementById("closeImageLightboxBtn"),
  prevImageLightboxBtn: document.getElementById("prevImageLightboxBtn"),
  nextImageLightboxBtn: document.getElementById("nextImageLightboxBtn"),
  qPosition: document.getElementById("qPosition"),
  qNumber: document.getElementById("qNumber"),
  qTypeBadge: document.getElementById("qTypeBadge"),
  answerChip: document.getElementById("answerChip"),
  questionText: document.getElementById("questionText"),
  questionMedia: document.getElementById("questionMedia"),
  options: document.getElementById("options"),
  prevBtn: document.getElementById("prevBtn"),
  clearBtn: document.getElementById("clearBtn"),
  nextBtn: document.getElementById("nextBtn")
};

let data = null;
let sourceQuestions = [];
let questions = [];
let questionIndexByNumber = new Map();
const imageViewerState = {
  images: [],
  index: 0,
  opener: null
};

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

persistActiveLessonSelection(activeLesson.id);

function applySavedState(saved) {
  if (!saved || typeof saved !== "object") return;

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
}

function loadState() {
  const storageKeys = [STORAGE_KEY];
  const legacyStorageKey = LEGACY_STORAGE_KEYS[activeLesson.id];

  if (legacyStorageKey && legacyStorageKey !== STORAGE_KEY) {
    storageKeys.push(legacyStorageKey);
  }

  for (const storageKey of storageKeys) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;

      applySavedState(JSON.parse(raw));

      if (storageKey !== STORAGE_KEY) {
        saveState();
      }
      return;
    } catch (_) {}
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {}
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
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

function resolveAssetUrl(assetPath) {
  const source = String(assetPath || "").trim();
  if (!source) return "";

  if (/^(?:https?:|data:|blob:|\/)/i.test(source)) {
    return source;
  }

  return `${DATA_BASE_PATH}${source}`.replace(/\\/g, "/");
}

function normalizeQuestionImages(rawImages, questionNumber) {
  const images = Array.isArray(rawImages) ? rawImages : [];
  const fallbackAlt = `Hình minh họa câu ${questionNumber}`;

  return images
    .map((image, index) => {
      if (typeof image === "string") {
        const src = resolveAssetUrl(image);
        if (!src) return null;

        return {
          src,
          alt: `${fallbackAlt} (${index + 1})`,
          caption: ""
        };
      }

      const src = resolveAssetUrl(image?.src || "");
      if (!src) return null;

      return {
        src,
        alt: String(image?.alt || `${fallbackAlt} (${index + 1})`).trim(),
        caption: String(image?.caption || "").trim()
      };
    })
    .filter(Boolean);
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

function optionKey(optionRaw) {
  if (optionRaw && typeof optionRaw === "object" && !Array.isArray(optionRaw)) {
    const explicitKey = String(optionRaw.key || "").trim().toUpperCase();
    if (/^[A-F]$/.test(explicitKey)) return explicitKey;

    const textKey = String(optionRaw.text || optionRaw.label || "")
      .trim()
      .match(/^[A-F]/i);
    return textKey ? textKey[0].toUpperCase() : "";
  }

  const match = String(optionRaw || "").trim().match(/^[A-F]/i);
  return match ? match[0].toUpperCase() : "";
}

function optionText(optionRaw) {
  if (optionRaw && typeof optionRaw === "object" && !Array.isArray(optionRaw)) {
    const rawText = optionRaw.text ?? optionRaw.label ?? "";
    return String(rawText).trim();
  }

  return String(optionRaw || "")
    .trim()
    .replace(/^[A-F](?:\s*[.)])?\s*/i, "")
    .trim();
}

function normalizeTrueFalseValue(value) {
  if (typeof value === "boolean") return value ? "true" : "false";

  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (["true", "t", "đúng", "dung", "d", "yes", "1"].includes(normalized)) {
    return "true";
  }
  if (["false", "f", "sai", "s", "no", "0"].includes(normalized)) {
    return "false";
  }

  return "";
}

function statementKey(statementRaw, index) {
  if (statementRaw && typeof statementRaw === "object" && !Array.isArray(statementRaw)) {
    const explicitKey = String(statementRaw.key || statementRaw.label || "")
      .trim()
      .toLowerCase();
    if (/^[a-z]$/.test(explicitKey)) return explicitKey;
  }

  return STATEMENT_KEYS[index] || String(index + 1);
}

function statementText(statementRaw) {
  if (statementRaw && typeof statementRaw === "object" && !Array.isArray(statementRaw)) {
    return String(statementRaw.text || statementRaw.label || "").trim();
  }

  return String(statementRaw || "").trim();
}

function parseMultipleChoiceQuestion(rawQuestion, index) {
  const number = Number(rawQuestion?.number) || index + 1;
  const options = Array.isArray(rawQuestion?.options) ? rawQuestion.options : [];
  const normalizedOptions = options.map((option, optionIndex) => ({
    key: optionKey(option) || DISPLAY_KEYS[optionIndex] || String(optionIndex + 1),
    text: optionText(option) || String(option || "")
  }));
  const normalizedAnswer = String(rawQuestion?.answer || "")
    .trim()
    .toUpperCase();
  const answer = normalizedOptions.some((option) => option.key === normalizedAnswer)
    ? normalizedAnswer
    : normalizedOptions[0]?.key || "";

  return {
    number,
    type: "mcq",
    question: String(rawQuestion?.question || ""),
    code: String(rawQuestion?.code || ""),
    images: normalizeQuestionImages(rawQuestion?.images, number),
    options: normalizedOptions,
    answer
  };
}

function parseTrueFalseQuestion(rawQuestion, index) {
  const number = Number(rawQuestion?.number) || index + 1;
  const statements = Array.isArray(rawQuestion?.statements) ? rawQuestion.statements : [];
  const normalizedStatements = statements
    .map((statement, statementIndex) => {
      const answer = normalizeTrueFalseValue(
        statement && typeof statement === "object" ? statement.answer : ""
      );
      const text = statementText(statement);

      if (!text || !answer) return null;

      return {
        key: statementKey(statement, statementIndex),
        text,
        answer
      };
    })
    .filter(Boolean);

  return {
    number,
    type: "true_false",
    question: String(rawQuestion?.question || ""),
    code: String(rawQuestion?.code || ""),
    images: normalizeQuestionImages(rawQuestion?.images, number),
    statements: normalizedStatements
  };
}

function parseQuestion(rawQuestion, index) {
  const type = String(rawQuestion?.type || "").trim().toLowerCase();

  if (type === "true_false" || Array.isArray(rawQuestion?.statements)) {
    return parseTrueFalseQuestion(rawQuestion, index);
  }

  return parseMultipleChoiceQuestion(rawQuestion, index);
}

function questionTypeLabel(question) {
  return question.type === "true_false" ? "Đúng / Sai" : "Trắc nghiệm";
}

function questionChoiceCount(question) {
  return question.type === "true_false" ? question.statements.length : 1;
}

function selectedOptionKey(question) {
  if (question.type !== "mcq") return "";
  return String(state.answers[question.number] || "")
    .trim()
    .toUpperCase();
}

function selectedStatements(question) {
  if (question.type !== "true_false") return {};

  const raw = state.answers[question.number];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const validKeys = new Set(question.statements.map((statement) => statement.key));
  const next = {};

  Object.entries(raw).forEach(([key, value]) => {
    const normalizedKey = String(key || "")
      .trim()
      .toLowerCase();
    const normalizedValue = normalizeTrueFalseValue(value);

    if (validKeys.has(normalizedKey) && normalizedValue) {
      next[normalizedKey] = normalizedValue;
    }
  });

  return next;
}

function getQuestionProgress(question) {
  if (question.type === "mcq") {
    const selected = selectedOptionKey(question);
    const answeredUnits = selected ? 1 : 0;
    const correctUnits = selected && selected === question.answer ? 1 : 0;

    return {
      started: answeredUnits > 0,
      complete: answeredUnits === 1,
      answeredUnits,
      totalUnits: 1,
      correctUnits,
      fullyCorrect: correctUnits === 1
    };
  }

  const selections = selectedStatements(question);
  const answeredUnits = question.statements.filter((statement) => selections[statement.key]).length;
  const correctUnits = question.statements.filter(
    (statement) => selections[statement.key] === statement.answer
  ).length;
  const totalUnits = question.statements.length;
  const complete = totalUnits > 0 && answeredUnits === totalUnits;

  return {
    started: answeredUnits > 0,
    complete,
    answeredUnits,
    totalUnits,
    correctUnits,
    fullyCorrect: complete && correctUnits === totalUnits
  };
}

function getCounts() {
  return sourceQuestions.reduce(
    (counts, question) => {
      const progress = getQuestionProgress(question);

      counts.totalQuestions += 1;
      counts.totalUnits += progress.totalUnits;
      counts.answeredUnits += progress.answeredUnits;
      counts.correctUnits += progress.correctUnits;

      if (progress.started) counts.startedQuestions += 1;
      if (progress.complete) counts.completeQuestions += 1;
      if (progress.fullyCorrect) counts.correctQuestions += 1;

      return counts;
    },
    {
      totalQuestions: 0,
      totalUnits: 0,
      answeredUnits: 0,
      correctUnits: 0,
      startedQuestions: 0,
      completeQuestions: 0,
      correctQuestions: 0
    }
  );
}

function buildTypeBreakdown() {
  const mcqCount = sourceQuestions.filter((question) => question.type === "mcq").length;
  const trueFalseCount = sourceQuestions.filter((question) => question.type === "true_false").length;
  const parts = [];

  if (mcqCount) parts.push(`${mcqCount} trắc nghiệm`);
  if (trueFalseCount) parts.push(`${trueFalseCount} đúng/sai`);

  return parts.join(" · ");
}

function buildShortExamTitle() {
  return activeLesson.label || data?.meta?.titleRaw || data?.meta?.subtitleRaw || "Ôn tập";
}

function renderLessonSelector() {
  if (!els.lessonSelect) return;

  if (!els.lessonSelect.options.length) {
    AVAILABLE_LESSONS.forEach((lesson) => {
      const option = document.createElement("option");
      option.value = lesson.id;
      option.textContent = lesson.label;
      els.lessonSelect.appendChild(option);
    });
  }

  els.lessonSelect.value = activeLesson.id;
}

function buildLessonUrl(lessonId) {
  const params = new URLSearchParams(window.location.search);

  params.set("lesson", lessonId);
  params.delete("bai");

  const queryString = params.toString();
  return `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
}

function changeLesson(lessonId) {
  const nextLesson = findLessonById(lessonId);

  if (!nextLesson) {
    renderLessonSelector();
    return;
  }

  if (nextLesson.id === activeLesson.id) return;

  persistActiveLessonSelection(nextLesson.id);
  window.location.assign(buildLessonUrl(nextLesson.id));
}

function summaryTextForCounts(counts, showScore) {
  return showScore
    ? `${counts.completeQuestions}/${counts.totalQuestions} câu · ${counts.correctUnits}/${counts.totalUnits} ý đúng`
    : `${counts.completeQuestions}/${counts.totalQuestions} câu · ${counts.answeredUnits}/${counts.totalUnits} ý đã chọn`;
}

function summaryTitleForCounts(counts, showScore) {
  return showScore
    ? `${counts.correctQuestions}/${counts.totalQuestions} câu làm đúng hoàn toàn`
    : `${counts.startedQuestions}/${counts.totalQuestions} câu đã bắt đầu làm`;
}

function isMobileViewport() {
  return window.innerWidth <= 900;
}

function syncToolsMount() {
  const target = isMobileViewport() ? els.toolsSheetShell : els.toolsDesktopMount;
  if (!target || !els.toolsPanel) return;
  if (els.toolsPanel.parentElement === target) return;
  target.appendChild(els.toolsPanel);
}

function buildQuestionOrder() {
  return shuffled(sourceQuestions.map((question) => question.number));
}

function buildOptionOrder(question) {
  if (question.type !== "mcq") return [];
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
      if (question.type !== "mcq") return { ...question };

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

  questionIndexByNumber = new Map(questions.map((question, index) => [question.number, index]));

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
  const questionByNumber = new Map(sourceQuestions.map((question) => [String(question.number), question]));

  Object.keys(state.answers).forEach((key) => {
    const question = questionByNumber.get(String(key));

    if (!question) {
      delete state.answers[key];
      return;
    }

    if (question.type === "mcq") {
      const selectedKey = String(state.answers[key] || "")
        .trim()
        .toUpperCase();
      const validKeys = new Set(question.options.map((option) => option.key));

      if (!validKeys.has(selectedKey)) {
        delete state.answers[key];
        return;
      }

      state.answers[key] = selectedKey;
      return;
    }

    const normalizedSelections = selectedStatements(question);

    if (!Object.keys(normalizedSelections).length) {
      delete state.answers[key];
      return;
    }

    state.answers[key] = normalizedSelections;
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
      if (question.type !== "mcq") return;

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

function questionIsFullyEvaluated(question) {
  const progress = getQuestionProgress(question);
  if (state.submitted) return true;
  if (state.revealMode !== "instant") return false;
  return progress.complete;
}

function isStatementRevealed(question, statementKeyValue) {
  if (state.submitted) return true;
  if (state.revealMode !== "instant") return false;

  if (question.type === "mcq") {
    return getQuestionProgress(question).complete;
  }

  return Boolean(selectedStatements(question)[statementKeyValue]);
}

function answerChipVisible(question) {
  if (!question) return false;
  if (state.submitted) return true;
  if (state.revealMode !== "instant") return false;
  return getQuestionProgress(question).complete;
}

function answerDisplayKey(question) {
  if (question.type === "true_false") {
    return question.statements
      .map((statement) => `${statement.key}. ${statement.answer === "true" ? "Đúng" : "Sai"}`)
      .join(" · ");
  }

  const answerIndex = question.options.findIndex((option) => option.key === question.answer);
  return DISPLAY_KEYS[answerIndex] || question.answer;
}

function renderHeaderLegacy() {
  const title = data?.meta?.titleRaw || data?.meta?.subtitleRaw || "Ôn tập";
  const subtitle = data?.meta?.subtitleRaw || "";
  const section = data?.meta?.sectionRaw || "";
  const breakdown = buildTypeBreakdown();
  const sectionParts = [subtitle, section, breakdown].filter(Boolean);
  const counts = getCounts();
  const total = counts.totalQuestions;
  const showScore = state.revealMode === "instant" || state.submitted;

  els.examTitle.textContent = title;
  els.examSection.textContent = sectionParts.join(" · ");
  document.title = subtitle ? `${title} | ${subtitle}` : title;

  els.openPaletteBtn.textContent = total > 0 ? `1-${total}` : "0";

  els.summary.textContent = showScore
    ? `${counts.completeQuestions}/${total} câu · ${counts.correctUnits}/${counts.totalUnits} ý đúng`
    : `${counts.completeQuestions}/${total} câu · ${counts.answeredUnits}/${counts.totalUnits} ý đã chọn`;
  els.summary.title = showScore
    ? `${counts.correctQuestions}/${total} câu làm đúng hoàn toàn`
    : `${counts.startedQuestions}/${total} câu đã bắt đầu làm`;

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

function renderHeader() {
  const title = data?.meta?.titleRaw || data?.meta?.subtitleRaw || "Ôn tập";
  const subtitle = data?.meta?.subtitleRaw || "";
  const section = data?.meta?.sectionRaw || "";
  const breakdown = buildTypeBreakdown();
  const sectionParts = [subtitle, section, breakdown].filter(Boolean);
  const counts = getCounts();
  const total = counts.totalQuestions;
  const showScore = state.revealMode === "instant" || state.submitted;
  const summaryText = summaryTextForCounts(counts, showScore);
  const summaryTitle = summaryTitleForCounts(counts, showScore);
  const currentQuestion = questions[state.current];
  const paletteLabel = total > 0 && currentQuestion ? `Câu ${currentQuestion.number}` : "Câu";
  const paletteTitle = total > 0 && currentQuestion
    ? `${paletteLabel} · ${summaryTitle}`
    : "Chưa có dữ liệu câu hỏi.";

  els.examTitle.textContent = title;
  els.mobileExamTitle.textContent = buildShortExamTitle();
  els.examSection.textContent = sectionParts.join(" · ");
  document.title = subtitle ? `${title} | ${subtitle}` : title;

  els.openPaletteBtn.textContent = paletteLabel;
  els.openPaletteBtn.title = paletteTitle;
  els.openPaletteBtn.disabled = total === 0;
  els.openPaletteBtn.setAttribute("aria-expanded", String(els.overlay.classList.contains("open")));

  els.mobilePaletteBtn.textContent = paletteLabel;
  els.mobilePaletteBtn.title = paletteTitle;
  els.mobilePaletteBtn.disabled = total === 0;
  els.mobilePaletteBtn.setAttribute("aria-expanded", String(els.overlay.classList.contains("open")));

  els.paletteSummary.textContent = total > 0 ? `${summaryText} · ${summaryTitle}` : "Chưa có dữ liệu câu hỏi.";

  els.summary.textContent = summaryText;
  els.summary.title = summaryTitle;

  if (els.lessonSelect) {
    els.lessonSelect.value = activeLesson.id;
  }
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
  syncMenuButtons();
}

function classForPaletteButton(question) {
  const progress = getQuestionProgress(question);
  const classes = ["q-btn"];

  if (progress.started && !progress.complete) {
    classes.push("partial");
  } else if (progress.complete) {
    if (questionIsFullyEvaluated(question)) {
      classes.push(progress.fullyCorrect ? "correct" : "wrong");
    } else {
      classes.push("answered");
    }
  }

  if (questions[state.current]?.number === question.number) {
    classes.push("current");
  }

  return classes.join(" ");
}

function paletteButtonTitle(question) {
  const progress = getQuestionProgress(question);
  const parts = [`Câu ${question.number}`, questionTypeLabel(question)];

  if (question.type === "true_false") {
    parts.push(`${progress.answeredUnits}/${progress.totalUnits} ý đã chọn`);
  } else if (progress.complete) {
    parts.push("Đã chọn đáp án");
  }

  if (questionIsFullyEvaluated(question)) {
    parts.push(progress.fullyCorrect ? "Đúng hoàn toàn" : "Còn sai");
  } else if (progress.started && !progress.complete) {
    parts.push("Đang làm dở");
  }

  return parts.join(" · ");
}

function paletteMeta(question) {
  const progress = getQuestionProgress(question);

  if (question.type === "true_false") {
    return `${progress.answeredUnits}/${progress.totalUnits}`;
  }

  return progress.complete ? "xong" : "TN";
}

function renderPaletteInto(container) {
  container.innerHTML = questions
    .map(
      (question) =>
        `<button type="button" class="${classForPaletteButton(question)}" data-number="${question.number}" aria-label="Câu ${question.number}" title="${escapeHtml(paletteButtonTitle(question))}"><span class="q-btn-number">${question.number}</span><span class="q-btn-meta">${escapeHtml(paletteMeta(question))}</span></button>`
    )
    .join("");
}

function renderPalette() {
  renderPaletteInto(els.paletteDesktop);
  renderPaletteInto(els.paletteMobile);
}

function setMcqSelection(question, optionKeyValue) {
  if (question.type !== "mcq") return;
  if (!question.options.some((option) => option.key === optionKeyValue)) return;

  const current = selectedOptionKey(question);
  if (current === optionKeyValue) {
    delete state.answers[question.number];
  } else {
    state.answers[question.number] = optionKeyValue;
  }

  saveState();
  render();
}

function setTrueFalseSelection(question, statementKeyValue, answerValue) {
  if (question.type !== "true_false") return;

  const normalizedValue = normalizeTrueFalseValue(answerValue);
  if (!normalizedValue) return;
  if (!question.statements.some((statement) => statement.key === statementKeyValue)) return;

  const selections = selectedStatements(question);

  if (selections[statementKeyValue] === normalizedValue) {
    delete selections[statementKeyValue];
  } else {
    selections[statementKeyValue] = normalizedValue;
  }

  if (Object.keys(selections).length) {
    state.answers[question.number] = selections;
  } else {
    delete state.answers[question.number];
  }

  saveState();
  render();
}

function renderQuestionStem(question) {
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

  if (!questionBlocks.length && !question.code) {
    els.questionText.appendChild(createQuestionTextBlock("Câu hỏi trống."));
  }

  els.questionText.scrollTop = 0;
}

function imageLightboxOpen() {
  return els.imageLightbox.classList.contains("open");
}

function imageLightboxCaptionText(image) {
  const caption = String(image?.caption || "").trim();
  const alt = String(image?.alt || "").trim();

  if (caption && alt && alt !== caption) {
    return `${caption}\n${alt}`;
  }

  return caption || alt;
}

function syncImageLightbox() {
  const totalImages = imageViewerState.images.length;
  const image = imageViewerState.images[imageViewerState.index];

  if (!image || !totalImages) {
    closeImageLightbox({ restoreFocus: false });
    return;
  }

  const captionText = imageLightboxCaptionText(image);
  const canGoPrev = imageViewerState.index > 0;
  const canGoNext = imageViewerState.index < totalImages - 1;
  const hasMultipleImages = totalImages > 1;

  els.imageLightboxMeta.textContent = hasMultipleImages
    ? `Ảnh ${imageViewerState.index + 1}/${totalImages}`
    : "Ảnh minh họa";
  els.imageLightboxHint.textContent = hasMultipleImages
    ? "Vuốt ngang hoặc dùng ← → để chuyển ảnh. Nhấn Esc để đóng."
    : "Bấm ra ngoài ảnh hoặc nhấn Esc để đóng.";
  els.imageLightboxCaption.textContent = captionText;
  els.imageLightboxCaption.hidden = !captionText;

  els.prevImageLightboxBtn.hidden = !hasMultipleImages;
  els.nextImageLightboxBtn.hidden = !hasMultipleImages;
  els.prevImageLightboxBtn.disabled = !canGoPrev;
  els.nextImageLightboxBtn.disabled = !canGoNext;

  els.imageLightboxViewport.classList.add("loading");
  els.imageLightboxImage.alt = image.alt || "Hình minh họa";
  els.imageLightboxImage.onload = () => {
    els.imageLightboxViewport.classList.remove("loading");
  };
  els.imageLightboxImage.onerror = () => {
    els.imageLightboxViewport.classList.remove("loading");
  };
  els.imageLightboxImage.src = image.src;

  if (els.imageLightboxImage.complete) {
    els.imageLightboxViewport.classList.remove("loading");
  }
}

function openImageLightbox(images, startIndex = 0, opener = null) {
  const validImages = Array.isArray(images) ? images.filter((image) => image?.src) : [];
  if (!validImages.length) return;

  imageViewerState.images = validImages;
  imageViewerState.index = Math.max(0, Math.min(startIndex, validImages.length - 1));
  imageViewerState.opener = opener || null;

  closeOverlay();
  closeToolsMenu();
  syncImageLightbox();
  document.body.classList.add("image-view-open");
  els.imageLightbox.classList.add("open");
  els.imageLightbox.setAttribute("aria-hidden", "false");
  els.closeImageLightboxBtn.focus({ preventScroll: true });
}

function closeImageLightbox({ restoreFocus = true } = {}) {
  if (!imageLightboxOpen()) return;

  const opener = imageViewerState.opener;

  els.imageLightbox.classList.remove("open");
  els.imageLightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("image-view-open");
  els.imageLightboxViewport.classList.remove("loading");
  els.imageLightboxImage.onload = null;
  els.imageLightboxImage.onerror = null;

  imageViewerState.images = [];
  imageViewerState.index = 0;
  imageViewerState.opener = null;

  if (restoreFocus && opener?.isConnected) {
    opener.focus({ preventScroll: true });
  }
}

function stepImageLightbox(direction) {
  const nextIndex = imageViewerState.index + direction;

  if (nextIndex < 0 || nextIndex >= imageViewerState.images.length) return;

  imageViewerState.index = nextIndex;
  syncImageLightbox();
}

function renderQuestionMedia(question) {
  els.questionMedia.innerHTML = "";

  const images = Array.isArray(question?.images) ? question.images : [];
  if (!images.length) {
    els.questionMedia.hidden = true;
    return;
  }

  images.forEach((image, index) => {
    const figure = document.createElement("figure");
    const trigger = document.createElement("button");
    const img = document.createElement("img");
    const hint = document.createElement("span");

    figure.className = "question-figure";
    trigger.type = "button";
    trigger.className = "question-image-trigger";
    trigger.setAttribute(
      "aria-label",
      image.caption
        ? `Phóng lớn ảnh: ${image.caption}`
        : `Phóng lớn hình minh họa câu ${question.number} (${index + 1})`
    );

    img.className = "question-image";
    img.src = image.src;
    img.alt = image.alt || `Hình minh họa câu ${question.number} (${index + 1})`;
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
      figure.remove();
      if (!els.questionMedia.children.length) {
        els.questionMedia.hidden = true;
      }
    });

    hint.className = "question-image-hint";
    hint.textContent = images.length > 1 ? `Xem lớn ${index + 1}/${images.length}` : "Bấm để phóng lớn";

    trigger.addEventListener("click", () => {
      openImageLightbox(images, index, trigger);
    });

    trigger.appendChild(img);
    trigger.appendChild(hint);
    figure.appendChild(trigger);

    if (image.caption) {
      const figcaption = document.createElement("figcaption");
      figcaption.className = "question-caption";
      figcaption.textContent = image.caption;
      figure.appendChild(figcaption);
    }

    els.questionMedia.appendChild(figure);
  });

  els.questionMedia.hidden = !els.questionMedia.children.length;
}

function renderMcqOptions(question) {
  const selected = selectedOptionKey(question);
  const revealed = questionIsFullyEvaluated(question);
  const fragment = document.createDocumentFragment();

  question.options.forEach((option, index) => {
    const btn = document.createElement("button");
    const label = document.createElement("span");
    const copy = document.createElement("span");

    btn.type = "button";
    btn.className = "option-btn";
    btn.dataset.key = option.key;
    btn.dataset.displayKey = DISPLAY_KEYS[index] || String(index + 1);
    btn.setAttribute("aria-pressed", String(selected === option.key));

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
      setMcqSelection(question, option.key);
    });

    fragment.appendChild(btn);
  });

  els.options.innerHTML = "";
  els.options.appendChild(fragment);
}

function renderTrueFalseOptions(question) {
  const selections = selectedStatements(question);
  const progress = getQuestionProgress(question);
  const fragment = document.createDocumentFragment();
  const intro = document.createElement("div");

  intro.className = "tf-intro";
  intro.innerHTML =
    `<span class="tf-intro-badge">${progress.answeredUnits}/${progress.totalUnits} ý</span><span>Chọn Đúng hoặc Sai cho từng ý.</span>`;
  fragment.appendChild(intro);

  question.statements.forEach((statement) => {
    const card = document.createElement("article");
    const marker = document.createElement("div");
    const body = document.createElement("div");
    const text = document.createElement("div");
    const controls = document.createElement("div");
    const selection = selections[statement.key] || "";
    const revealed = isStatementRevealed(question, statement.key);

    card.className = "tf-card";
    if (selection) card.classList.add("answered");
    if (revealed && selection === statement.answer) {
      card.classList.add("correct");
    } else if (revealed && selection && selection !== statement.answer) {
      card.classList.add("wrong");
    }

    marker.className = "tf-marker";
    marker.textContent = statement.key;

    body.className = "tf-body";

    text.className = "tf-text";
    text.innerHTML = formatInlineCode(statement.text);

    controls.className = "tf-choice-row";

    TRUE_FALSE_CHOICES.forEach((choice) => {
      const choiceBtn = document.createElement("button");

      choiceBtn.type = "button";
      choiceBtn.className = "tf-choice-btn";
      choiceBtn.textContent = choice.label;
      choiceBtn.dataset.value = choice.value;
      choiceBtn.setAttribute("aria-pressed", String(selection === choice.value));

      if (selection === choice.value) {
        choiceBtn.classList.add("selected");
      }

      if (revealed) {
        if (choice.value === statement.answer) {
          choiceBtn.classList.add("correct");
        }
        if (selection === choice.value && choice.value !== statement.answer) {
          choiceBtn.classList.add("wrong");
        }
      }

      choiceBtn.addEventListener("click", () => {
        setTrueFalseSelection(question, statement.key, choice.value);
      });

      controls.appendChild(choiceBtn);
    });

    body.append(text, controls);

    if (revealed) {
      const feedback = document.createElement("div");
      feedback.className = "tf-feedback";

      if (selection === statement.answer) {
        feedback.textContent = "Chính xác.";
        feedback.classList.add("correct");
      } else if (selection) {
        feedback.textContent = `Đáp án đúng: ${statement.answer === "true" ? "Đúng" : "Sai"}.`;
        feedback.classList.add("wrong");
      } else {
        feedback.textContent = `Bạn chưa chọn ý này. Đáp án đúng: ${statement.answer === "true" ? "Đúng" : "Sai"}.`;
      }

      body.appendChild(feedback);
    }

    card.append(marker, body);
    fragment.appendChild(card);
  });

  els.options.innerHTML = "";
  els.options.appendChild(fragment);
}

function renderQuestion() {
  const question = questions[state.current];

  if (!question) {
    els.qPosition.textContent = "0/0";
    els.qNumber.textContent = "Chưa có câu hỏi";
    els.qTypeBadge.hidden = true;
    els.answerChip.hidden = true;
    els.questionText.textContent = "Không có dữ liệu để hiển thị.";
    els.questionMedia.innerHTML = "";
    els.questionMedia.hidden = true;
    els.options.innerHTML = "";
    els.prevBtn.disabled = true;
    els.nextBtn.disabled = true;
    els.clearBtn.disabled = true;
    return;
  }

  const progress = getQuestionProgress(question);

  els.qPosition.textContent = `${state.current + 1}/${questions.length}`;
  els.qNumber.textContent = `Câu ${question.number}`;
  els.qTypeBadge.hidden = false;
  els.qTypeBadge.textContent = questionTypeLabel(question);
  els.qTypeBadge.dataset.type = question.type;
  els.answerChip.hidden = !answerChipVisible(question);
  els.answerChip.classList.toggle("wide", question.type === "true_false");
  els.answerChip.textContent = `Đáp án: ${answerDisplayKey(question)}`;
  els.options.dataset.type = question.type;

  renderQuestionStem(question);
  renderQuestionMedia(question);

  if (question.type === "true_false") {
    renderTrueFalseOptions(question);
  } else {
    renderMcqOptions(question);
  }

  els.prevBtn.disabled = state.current === 0;
  els.nextBtn.disabled = state.current === questions.length - 1;
  els.clearBtn.disabled = !progress.started;
}

function render() {
  renderHeader();
  renderPalette();
  renderQuestion();
}

function goTo(index) {
  const nextIndex = Math.max(0, Math.min(index, questions.length - 1));
  if (nextIndex === state.current) return;

  state.current = nextIndex;
  saveState();

  const body = document.querySelector(".viewer-body");
  if (body) {
    body.classList.remove("transitioning");
    void body.offsetWidth;
    body.classList.add("transitioning");
    body.addEventListener("animationend", () => {
      body.classList.remove("transitioning");
    }, { once: true });
  }

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
  const counts = getCounts();

  if (!counts.totalQuestions) return;

  if (counts.completeQuestions < counts.totalQuestions) {
    const shouldSubmit = confirm(
      `Bạn mới hoàn tất ${counts.completeQuestions}/${counts.totalQuestions} câu (${counts.answeredUnits}/${counts.totalUnits} ý đã chọn). Vẫn nộp bài?`
    );
    if (!shouldSubmit) return;
  }

  state.submitted = true;
  saveState();
  render();
}

function setRevealMode(mode) {
  state.revealMode = mode === "instant" ? "instant" : "submit";

  if (state.revealMode === "instant") {
    state.submitted = false;
  }

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
      if (question.type !== "mcq") return;
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

function toolsMenuOpen() {
  return els.toolsBackdrop.classList.contains("open");
}

function syncMenuButtons() {
  const overlayOpen = els.overlay.classList.contains("open");
  const toolsOpen = toolsMenuOpen();

  els.openToolsBtn.classList.toggle("active", toolsOpen);
  els.openToolsBtn.setAttribute("aria-expanded", String(toolsOpen));
  els.openPaletteBtn.setAttribute("aria-expanded", String(overlayOpen));
  els.mobilePaletteBtn.setAttribute("aria-expanded", String(overlayOpen));
}

function openToolsMenu() {
  if (!isMobileViewport()) return;
  closeOverlay();
  syncToolsMount();
  els.toolsBackdrop.classList.add("open");
  syncMenuButtons();
}

function closeToolsMenu() {
  els.toolsBackdrop.classList.remove("open");
  syncMenuButtons();
}

function toggleToolsMenu() {
  if (toolsMenuOpen()) {
    closeToolsMenu();
    return;
  }

  openToolsMenu();
}

function openOverlay() {
  closeToolsMenu();
  els.overlay.classList.add("open");
  syncMenuButtons();
}

function closeOverlay() {
  els.overlay.classList.remove("open");
  syncMenuButtons();
}

function selectDisplayedOption(question, displayKey) {
  if (!question || question.type !== "mcq") return;

  const displayIndex = DISPLAY_KEYS.indexOf(displayKey);
  if (displayIndex < 0) return;

  const option = question.options[displayIndex];
  if (!option) return;

  setMcqSelection(question, option.key);
}

function handleTrueFalseHotkeys(question, key) {
  if (!question || question.type !== "true_false") return false;

  const map = {
    q: { key: "a", value: "true" },
    a: { key: "a", value: "false" },
    w: { key: "b", value: "true" },
    s: { key: "b", value: "false" },
    e: { key: "c", value: "true" },
    d: { key: "c", value: "false" },
    r: { key: "d", value: "true" },
    f: { key: "d", value: "false" },
    Q: { key: "a", value: "true" },
    A: { key: "a", value: "false" },
    W: { key: "b", value: "true" },
    S: { key: "b", value: "false" },
    E: { key: "c", value: "true" },
    D: { key: "c", value: "false" },
    R: { key: "d", value: "true" },
    F: { key: "d", value: "false" }
  };

  const action = map[key];
  if (!action) return false;
  if (!question.statements.some((statement) => statement.key === action.key)) return false;

  setTrueFalseSelection(question, action.key, action.value);
  return true;
}

function bindEvents() {
  els.lessonSelect.addEventListener("change", (event) => {
    changeLesson(event.target.value);
  });
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

  [els.openPaletteBtn, els.mobilePaletteBtn].forEach((button) => {
    button.addEventListener("click", openOverlay);
  });
  els.closePaletteBtn.addEventListener("click", closeOverlay);
  els.closeImageLightboxBtn.addEventListener("click", () => closeImageLightbox());
  els.prevImageLightboxBtn.addEventListener("click", () => stepImageLightbox(-1));
  els.nextImageLightboxBtn.addEventListener("click", () => stepImageLightbox(1));
  els.imageLightbox.addEventListener("click", (event) => {
    if (event.target === els.imageLightbox) {
      closeImageLightbox();
    }
  });

  els.openToolsBtn.addEventListener("click", toggleToolsMenu);
  els.closeToolsBtn.addEventListener("click", closeToolsMenu);
  els.toolsBackdrop.addEventListener("click", (event) => {
    if (event.target === els.toolsBackdrop) {
      closeToolsMenu();
    }
  });

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
    syncToolsMount();
    if (window.innerWidth > 900) {
      closeOverlay();
      closeToolsMenu();
    }
  });

  let swipeStartX = 0;
  let swipeStartY = 0;
  const viewer = document.querySelector(".viewer");

  if (viewer) {
    viewer.addEventListener("touchstart", (event) => {
      const touch = event.changedTouches[0];
      swipeStartX = touch.clientX;
      swipeStartY = touch.clientY;
    }, { passive: true });

    viewer.addEventListener("touchend", (event) => {
      const touch = event.changedTouches[0];
      const dx = touch.clientX - swipeStartX;
      const dy = touch.clientY - swipeStartY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx > 50 && absDx > absDy * 1.8) {
        if (dx > 0) {
          goTo(state.current - 1);
        } else {
          goTo(state.current + 1);
        }
      }
    }, { passive: true });
  }

  let imageSwipeStartX = 0;
  let imageSwipeStartY = 0;

  els.imageLightboxViewport.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    imageSwipeStartX = touch.clientX;
    imageSwipeStartY = touch.clientY;
  }, { passive: true });

  els.imageLightboxViewport.addEventListener("touchend", (event) => {
    if (imageViewerState.images.length < 2) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - imageSwipeStartX;
    const dy = touch.clientY - imageSwipeStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx > 44 && absDx > absDy * 1.3) {
      stepImageLightbox(dx > 0 ? -1 : 1);
    }
  }, { passive: true });

  document.addEventListener("keydown", (event) => {
    if (imageLightboxOpen()) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeImageLightbox();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepImageLightbox(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepImageLightbox(1);
        return;
      }

      return;
    }

    if (event.key === "Escape") {
      if (els.overlay.classList.contains("open")) {
        closeOverlay();
        return;
      }

      if (toolsMenuOpen()) {
        closeToolsMenu();
        return;
      }
    }

    if (els.overlay.classList.contains("open") || toolsMenuOpen()) return;

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

    const question = questions[state.current];
    if (!question) return;

    if (question.type === "true_false") {
      if (handleTrueFalseHotkeys(question, event.key)) {
        event.preventDefault();
      }
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

    event.preventDefault();
    selectDisplayedOption(question, displayKey);
  });

  syncMenuButtons();
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
  renderLessonSelector();

  try {
    const questionRes = await fetch(DATA_URL, { cache: "no-store" });

    if (!questionRes.ok) throw new Error(`Không tải được ${DATA_URL}`);

    data = await questionRes.json();
    sourceQuestions = Array.isArray(data.questions)
      ? data.questions.map(parseQuestion).filter((question) => {
          if (question.type === "true_false") {
            return question.statements.length > 0;
          }

          return question.options.length > 0;
        })
      : [];

    loadState();
    normalizeState();
    syncToolsMount();
    bindEvents();
    render();
  } catch (error) {
    console.error(error);
    els.mobileExamTitle.textContent = "Lỗi tải bài";
    els.examTitle.textContent = "Không tải được dữ liệu";
    els.examSection.textContent = "Hãy mở bằng localhost hoặc Live Server.";
    els.summary.textContent = "Lỗi";
    els.questionText.textContent = `Không tải được ${DATA_URL}`;
    els.questionMedia.innerHTML = "";
    els.questionMedia.hidden = true;
    els.options.innerHTML = "";
  }
}

init();
