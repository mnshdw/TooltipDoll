const state = {
  entries: [],
  selectedId: null,
  originalContent: "",
  fileName: "",
  searchTerm: "",
  nextId: 0,
};

const COLOR_DEFINITIONS = {
  PositiveValue: "#135213",
  VeryPositiveValue: "#f5d87a",
  NegativeValue: "#8f1e1e",
  VeryNegativeValue: "#9a1c1c",
  DamageValue: "#8f1e1e",
  Passive: "#4f1800",
  Active: "#000ec1",
  OneTimeEffect: "#000ec1",
  Skill: "#400080",
  Status: "#731f39",
  Perk: "#008060",
  RuneColor: "#bf2aac",
  Buff: "#56c7ff",
  Debuff: "#ff5e5e",
  PositiveEventValue: "#1e861e",
  NegativeEventValue: "#a22424",
};

const COLOR_TOKEN_MAP = Object.entries(COLOR_DEFINITIONS).reduce((map, [name, value]) => {
  map[`::Const.UI.Color.${name}`] = value;
  map[`this.Const.UI.Color.${name}`] = value;
  return map;
}, {});

const DEFAULT_COLOR = "#d7b174";

const COLOR_NAME_MAP = { ...COLOR_DEFINITIONS };

const COLOR_PLACEHOLDER_PREFIX = "__TD_COLOR__";
const COLOR_PLACEHOLDER_SUFFIX = "__";

const PERK_NAME_PREFIX = "PerkName.";
const PERK_DESCRIPTION_PREFIX = "PerkDescription.";

function makeColorToken(name, scope = "::") {
  return scope === "this" ? `this.Const.UI.Color.${name}` : `::Const.UI.Color.${name}`;
}

function canonicalizeColorToken(token) {
  if (!token) {
    return token;
  }
  const match = token.match(/(?:this|::)\.Const\.UI\.Color\.([A-Za-z0-9_]+)/);
  if (!match) {
    return token;
  }
  return makeColorToken(match[1], "::");
}

const fileInput = document.querySelector("#file-input");
const searchInput = document.querySelector("#search-input");
const entryListEl = document.querySelector("#entry-list");
const entryCountEl = document.querySelector("#entry-count");
const textareaEl = document.querySelector("#entry-text");
const previewEl = document.querySelector("#preview");
const assignmentOutputEl = document.querySelector("#assignment-output");
const copyAssignmentBtn = document.querySelector("#copy-assignment");
const downloadBtn = document.querySelector("#download-file");
const addEntryBtn = document.querySelector("#add-entry");
const statusEl = document.querySelector("#status");
const entryNameEl = document.querySelector("#entry-name");
const notesSection = document.querySelector("#entry-notes");
const notesList = notesSection?.querySelector("ul");

fileInput.addEventListener("change", handleFileLoad);
searchInput.addEventListener("input", handleSearchChange);
textareaEl.addEventListener("input", handleTextChange);
copyAssignmentBtn.addEventListener("click", () => copyToClipboard(assignmentOutputEl.value, "Assignment copied."));
downloadBtn.addEventListener("click", handleDownload);
addEntryBtn.addEventListener("click", handleAddEntry);

entryListEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-entry-id]");
  if (!button) return;
  selectEntry(Number(button.dataset.entryId));
});

function handleFileLoad(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    loadContent(String(reader.result ?? ""), file.name);
    setStatus(`Loaded ${file.name}`, "success");
  };
  reader.onerror = () => setStatus("Failed to read file", "error");
  reader.readAsText(file);
}

function loadContent(sourceText, fileName = "") {
  state.nextId = 0;
  state.originalContent = sourceText;
  state.fileName = fileName;
  state.entries = parseEntries(sourceText);
  state.searchTerm = "";
  searchInput.value = "";
  state.selectedId = null;
  entryCountEl.textContent = `${state.entries.length} strings`;
  downloadBtn.disabled = state.entries.length === 0;
  renderEntryList();
  if (state.entries.length > 0) {
    selectEntry(state.entries[0].id);
  } else {
    clearEditor();
    setStatus("No ::Const.Strings assignments found", "");
  }
}

function parseEntries(content) {
  const parsed = [];
  const regex = /::Const\.Strings\.([\w\.]+)\s*(=|<-)\s*([\s\S]*?);/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const key = match[1];
    const operator = match[2];
    const expression = match[3];
    const searchStart = match.index + "::Const.Strings.".length + key.length;
    let operatorIndex = content.indexOf(operator, searchStart);
    const semicolonIndex = regex.lastIndex - 1;
    if (operatorIndex === -1 || operatorIndex > semicolonIndex) {
      operatorIndex = match.index + match[0].indexOf(operator);
    }
    const valueStart = operatorIndex + operator.length;
    const valueEnd = semicolonIndex;
    const rawExpression = content.slice(valueStart, valueEnd);
    const leadingWhitespace = rawExpression.match(/^\s*/)?.[0] ?? "";
    const trailingWhitespace = rawExpression.match(/\s*$/)?.[0] ?? "";
    const trimmed = rawExpression.trim();
    const { text: displayText, colorTokens } = decodeExpression(trimmed);
    const entry = {
      id: state.nextId++,
      key,
      displayName: key.split(".").pop() ?? key,
      rawExpression,
      leadingWhitespace,
      trailingWhitespace,
      valueStart,
      valueEnd,
      operator,
      displayText,
      colorTokens,
      unknownTokens: [],
      dirty: false,
      isNew: false,
    };
    updateEntryUnknownTokens(entry);
    parsed.push(entry);
  }
  return parsed;
}

function decodeExpression(expr) {
  if (!expr) {
    return { text: "", colorTokens: {} };
  }

  const colorTokens = {};
  const tokenRegex = /(this\.Const\.UI\.Color|::Const\.UI\.Color)\.([A-Za-z0-9_]+)/g;
  let processed = expr.replace(tokenRegex, (_, base, name) => {
    const scope = base.startsWith("this") ? "this" : "::";
    const token = makeColorToken(name, scope);
    const canonical = canonicalizeColorToken(token);
    if (!colorTokens[name]) {
      colorTokens[name] = canonical;
    }
    return `"${COLOR_PLACEHOLDER_PREFIX}${name}${COLOR_PLACEHOLDER_SUFFIX}"`;
  });

  const parts = [];
  const stringRegex = /"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = stringRegex.exec(processed)) !== null) {
    parts.push(match[1]);
  }

  let combined = parts.join("");
  const placeholderInColorPattern = new RegExp(`\\[color=${COLOR_PLACEHOLDER_PREFIX}([A-Za-z0-9_]+)${COLOR_PLACEHOLDER_SUFFIX}\\]`, "g");
  combined = combined.replace(placeholderInColorPattern, (_, name) => `[color=${name}]`);
  const standalonePlaceholderPattern = new RegExp(`${COLOR_PLACEHOLDER_PREFIX}([A-Za-z0-9_]+)${COLOR_PLACEHOLDER_SUFFIX}`, "g");
  combined = combined.replace(standalonePlaceholderPattern, (_, name) => name);
  combined = combined.replace(/\\n/g, "\n");
  combined = combined.replace(/\\r/g, "\r");
  combined = combined.replace(/\\t/g, "\t");
  combined = combined.replace(/\\"/g, '"');
  combined = combined.replace(/\\\\/g, "\\");

  return { text: combined, colorTokens };
}

function updateEntryUnknownTokens(entry) {
  if (!entry) {
    return [];
  }
  const unknown = new Set();
  if (entry.colorTokens) {
    Object.entries(entry.colorTokens).forEach(([name, tokenString]) => {
      const canonical = canonicalizeColorToken(tokenString ?? makeColorToken(name));
      entry.colorTokens[name] = canonical;
      if (!COLOR_TOKEN_MAP[canonical] && !COLOR_NAME_MAP[name]) {
        unknown.add(canonical);
      }
    });
  }
  entry.unknownTokens = Array.from(unknown);
  return entry.unknownTokens;
}

function renderEntryList() {
  const list = document.createDocumentFragment();
  const filtered = getFilteredEntries();
  filtered.forEach((entry) => {
    const button = document.createElement("button");
    button.className = "entry-button" + (entry.id === state.selectedId ? " active" : "");
    button.type = "button";
    button.dataset.entryId = String(entry.id);

    const nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = entry.key;
    button.append(nameSpan);

    if (entry.unknownTokens.length > 0) {
      const issue = document.createElement("span");
      issue.className = "issue-dot";
      issue.title = `Unknown color token${entry.unknownTokens.length > 1 ? "s" : ""}`;
      button.append(issue);
    } else if (entry.dirty) {
      const dirty = document.createElement("span");
      dirty.className = "dirty-dot";
      dirty.title = "Unsaved change";
      button.append(dirty);
    }

    list.append(button);
  });
  entryListEl.innerHTML = "";
  entryListEl.append(list);
  entryCountEl.textContent = `${filtered.length} string${filtered.length === 1 ? "" : "s"}`;
}

function getFilteredEntries() {
  if (!state.searchTerm) return [...state.entries];
  const term = state.searchTerm.toLowerCase();
  return state.entries.filter((entry) =>
    entry.key.toLowerCase().includes(term) || entry.displayText.toLowerCase().includes(term)
  );
}

function selectEntry(id, options = {}) {
  const focusEditor = options.focusEditor ?? true;
  const entry = state.entries.find((item) => item.id === id);
  state.selectedId = entry?.id ?? null;
  renderEntryList();
  if (!entry) {
    clearEditor();
    return;
  }
  entryNameEl.value = entry.key;
  textareaEl.disabled = false;
  textareaEl.value = entry.displayText;
  if (focusEditor) {
    textareaEl.focus();
    textareaEl.setSelectionRange(entry.displayText.length, entry.displayText.length);
  }
  assignmentOutputEl.value = formatAssignment(entry);
  copyAssignmentBtn.disabled = false;
  downloadBtn.disabled = false;
  updatePreview(entry);
  updateEntryUnknownTokens(entry);
  updateNotes(entry);
}

function clearEditor() {
  textareaEl.value = "";
  textareaEl.disabled = true;
  assignmentOutputEl.value = "";
  copyAssignmentBtn.disabled = true;
  entryNameEl.value = "";
  previewEl.innerHTML = "Load a string to see the tooltip preview.";
  if (notesSection) {
    notesSection.hidden = true;
  }
  if (notesList) {
    notesList.innerHTML = "";
  }
}

function handleSearchChange(event) {
  state.searchTerm = event.target.value.trim();
  const filtered = getFilteredEntries();
  const selectedStillVisible = filtered.some((entry) => entry.id === state.selectedId);
  renderEntryList();
  if (!selectedStillVisible) {
    if (!state.searchTerm) {
      if (filtered.length > 0) {
        const preferred = filtered.find((item) => item.key.startsWith(PERK_DESCRIPTION_PREFIX)) ?? filtered[0];
        selectEntry(preferred.id, { focusEditor: false });
      } else {
        state.selectedId = null;
        clearEditor();
      }
    } else {
      state.selectedId = null;
      clearEditor();
    }
    searchInput.focus();
  }
}

function handleTextChange(event) {
  const entry = state.entries.find((item) => item.id === state.selectedId);
  if (!entry) return;
  entry.displayText = event.target.value;
  entry.dirty = true;
  assignmentOutputEl.value = formatAssignment(entry);
  updateEntryUnknownTokens(entry);
  updatePreview(entry);
  updateNotes(entry);
  renderEntryList();
}

function updatePreview(entry) {
  if (!entry) {
    previewEl.innerHTML = "";
    return;
  }
  const html = buildPreviewHtml(entry);
  previewEl.innerHTML = html;
}

function updateNotes(entry) {
  if (!notesSection || !notesList) {
    return;
  }
  if (!entry.unknownTokens.length) {
    notesSection.hidden = true;
    notesList.innerHTML = "";
    return;
  }
  notesSection.hidden = false;
  notesList.innerHTML = "";
  entry.unknownTokens.forEach((token) => {
    const li = document.createElement("li");
    li.textContent = `Unknown color token: ${token}`;
    notesList.append(li);
  });
}

function formatAssignment(entry) {
  const expression = encodeExpression(entry);
  const operator = entry.operator ?? "<-";
  return `::Const.Strings.${entry.key} ${operator} ${expression};`;
}

function encodeSquirrelString(text) {
  if (text == null) {
    return '""';
  }
  let escaped = text.replace(/\\/g, "\\\\");
  escaped = escaped.replace(/\r/g, "\\r");
  escaped = escaped.replace(/\n/g, "\\n");
  escaped = escaped.replace(/\t/g, "\\t");
  escaped = escaped.replace(/"/g, '\\"');
  escaped = escaped.replace(/\\\\'/g, "\\'");
  return `"${escaped}"`;
}

function encodeExpression(entry) {
  const text = entry.displayText ?? "";
  const tokenLookup = entry.colorTokens ?? {};
  if (!entry.colorTokens) {
    entry.colorTokens = tokenLookup;
  }

  const parts = [];
  const pushStringPart = (value) => {
    if (!value) return;
    const encoded = encodeSquirrelString(value);
    const lastIndex = parts.length - 1;
    if (lastIndex >= 0) {
      const last = parts[lastIndex];
      if (typeof last === "string" && last.startsWith("\"") && last.endsWith("\"")) {
        parts[lastIndex] = last.slice(0, -1) + encoded.slice(1);
        return;
      }
    }
    parts.push(encoded);
  };

  const colorPattern = /\[color=([A-Za-z0-9_]+)\]/g;
  let cursor = 0;
  let match;

  while ((match = colorPattern.exec(text)) !== null) {
    const start = match.index;
    if (start > cursor) {
      pushStringPart(text.slice(cursor, start));
    }
    const tokenName = match[1];
    const fullToken = canonicalizeColorToken(tokenLookup[tokenName] ?? makeColorToken(tokenName));
    tokenLookup[tokenName] = fullToken;
    pushStringPart("[color=");
    parts.push(fullToken);
    pushStringPart("]");
    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    pushStringPart(text.slice(cursor));
  }

  if (parts.length === 0) {
    return encodeSquirrelString(text);
  }

  if (parts.length === 1) {
    return parts[0];
  }

  return parts.join(" + ");
}

function bbcodeToHtml(rawText) {
  if (!rawText) return "";
  let html = escapeHtml(rawText);
  html = html.replace(/\[br\]/gi, "<br>");
  html = html.replace(/\[color=([^\]]+)\]([\s\S]*?)\[\/color\]/gi, (_, color, content) => {
    return `<span style="color:${sanitizeColor(color)}">${content}</span>`;
  });
  html = html.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<span class="bbcode-bold">$1</span>');
  html = html.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<span class="bbcode-italic">$1</span>');
  html = html.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<span class="bbcode-underline">$1</span>');
  html = html.replace(/\n/g, "<br>");
  return html;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function sanitizeColor(color) {
  const trimmed = color.trim().replace(/"/g, "");
  if (COLOR_TOKEN_MAP[trimmed]) {
    return COLOR_TOKEN_MAP[trimmed];
  }
  if (/^[A-Za-z0-9_]+$/.test(trimmed)) {
    const mapped = COLOR_NAME_MAP[trimmed];
    if (mapped) {
      return mapped;
    }
    return DEFAULT_COLOR;
  }
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) {
    return trimmed;
  }
  if (/^(rgb|rgba|hsl|hsla)\(/i.test(trimmed)) {
    return trimmed;
  }
  return DEFAULT_COLOR;
}

function getPerkBaseKey(key) {
  if (key.startsWith(PERK_NAME_PREFIX)) {
    return key.slice(PERK_NAME_PREFIX.length);
  }
  if (key.startsWith(PERK_DESCRIPTION_PREFIX)) {
    return key.slice(PERK_DESCRIPTION_PREFIX.length);
  }
  return null;
}

function findPerkEntry(baseKey, prefix) {
  return state.entries.find((item) => item.key === `${prefix}${baseKey}`);
}

function buildPreviewHtml(entry) {
  const baseKey = getPerkBaseKey(entry.key);
  if (!baseKey) {
    return entry.displayText ? bbcodeToHtml(entry.displayText) : "";
  }
  const nameEntry = findPerkEntry(baseKey, PERK_NAME_PREFIX) ?? null;
  const descriptionEntry = findPerkEntry(baseKey, PERK_DESCRIPTION_PREFIX) ?? null;

  const nameHtml = nameEntry ? bbcodeToHtml(nameEntry.id === entry.id ? entry.displayText : nameEntry.displayText) : "";
  const descriptionHtml = descriptionEntry
    ? bbcodeToHtml(descriptionEntry.id === entry.id ? entry.displayText : descriptionEntry.displayText)
    : "";

  if (!nameHtml && !descriptionHtml) {
    return entry.displayText ? bbcodeToHtml(entry.displayText) : "";
  }

  let html = "";
  if (nameHtml) {
    html += `<div class="perk-preview__name">${nameHtml}</div>`;
  }
  if (descriptionHtml) {
    html += `<div class="perk-preview__description">${descriptionHtml}</div>`;
  }
  return html;
}

async function copyToClipboard(value, successMessage) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    setStatus(successMessage, "success");
  } catch (error) {
    console.error(error);
    setStatus("Clipboard copy failed", "error");
  }
}

function setStatus(message, variant) {
  statusEl.textContent = message;
  statusEl.classList.remove("is-error", "is-success");
  if (variant === "error") {
    statusEl.classList.add("is-error");
  } else if (variant === "success") {
    statusEl.classList.add("is-success");
    setTimeout(() => {
      if (statusEl.textContent === message) {
        statusEl.textContent = "";
        statusEl.classList.remove("is-success");
      }
    }, 2200);
  }
}

function handleDownload() {
  if (!state.entries.length) {
    setStatus("Nothing to export", "error");
    return;
  }
  const content = buildUpdatedContent();
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = state.fileName || "strings.nut";
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus("Download generated", "success");
}

function buildUpdatedContent() {
  if (!state.originalContent) {
    return state.entries.map((entry) => formatAssignment(entry)).join("\n") + "\n";
  }
  let content = state.originalContent;
  const replacements = state.entries
    .filter((entry) => !entry.isNew)
    .map((entry) => {
      const expression = encodeExpression(entry);
      const replacement = `${entry.leadingWhitespace || " "}${expression}${entry.trailingWhitespace || ""}`;
      return { start: entry.valueStart, end: entry.valueEnd, replacement };
    })
    .sort((a, b) => b.start - a.start);

  replacements.forEach(({ start, end, replacement }) => {
    content = content.slice(0, start) + replacement + content.slice(end);
  });

  const newEntries = state.entries.filter((entry) => entry.isNew);
  if (newEntries.length > 0) {
    const separator = content.endsWith("\n") ? "" : "\n";
    const extra = newEntries.map((entry) => formatAssignment(entry)).join("\n");
    content += separator + extra + "\n";
  }
  return content;
}

function handleAddEntry() {
  const proposed = prompt("Enter the new string identifier (e.g. PerkDescription.MyPerk)");
  if (!proposed) return;
  const sanitized = proposed.trim();
  if (!/^([A-Za-z_][\w]*\.)*[A-Za-z_][\w]*$/.test(sanitized)) {
    setStatus("Invalid identifier", "error");
    return;
  }
  const fullKey = sanitized.includes("::Const.Strings.")
    ? sanitized.replace(/^::Const\.Strings\./, "")
    : sanitized;
  if (state.entries.some((entry) => entry.key === fullKey)) {
    setStatus("Key already exists", "error");
    return;
  }
  const newEntry = {
    id: state.nextId++,
    key: fullKey,
    displayName: fullKey.split(".").pop() ?? fullKey,
    rawExpression: "",
    leadingWhitespace: " ",
    trailingWhitespace: "",
    valueStart: 0,
    valueEnd: 0,
    operator: "<-",
    displayText: "",
    colorTokens: {},
    unknownTokens: [],
    dirty: true,
    isNew: true,
  };
  state.entries.push(newEntry);
  renderEntryList();
  selectEntry(newEntry.id);
  downloadBtn.disabled = false;
}

// Initial render (empty state)
renderEntryList();
clearEditor();
