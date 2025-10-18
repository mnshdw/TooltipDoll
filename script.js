const state = {
  entries: [],
  selectedId: null,
  originalContent: "",
  fileName: "",
  searchTerm: "",
  nextId: 0,
  unknownTokens: new Set(),
};

const COLOR_TOKEN_MAP = {
  "this.Const.UI.Color.PositiveValue": "#135213",
  "::Const.UI.Color.PositiveValue": "#135213",
  "this.Const.UI.Color.VeryPositiveValue": "#f5d87a",
  "::Const.UI.Color.VeryPositiveValue": "#f5d87a",
  "this.Const.UI.Color.NegativeValue": "#8f1e1e",
  "::Const.UI.Color.NegativeValue": "#8f1e1e",
  "this.Const.UI.Color.VeryNegativeValue": "#9a1c1c",
  "::Const.UI.Color.VeryNegativeValue": "#9a1c1c",
  "this.Const.UI.Color.DamageValue": "#8f1e1e",
  "::Const.UI.Color.DamageValue": "#8f1e1e",
  "this.Const.UI.Color.Passive": "#4f1800",
  "::Const.UI.Color.Passive": "#4f1800",
  "this.Const.UI.Color.Active": "#000ec1",
  "::Const.UI.Color.Active": "#000ec1",
  "this.Const.UI.Color.OneTimeEffect": "#000ec1",
  "::Const.UI.Color.OneTimeEffect": "#000ec1",
  "this.Const.UI.Color.Skill": "#400080",
  "::Const.UI.Color.Skill": "#400080",
  "this.Const.UI.Color.Status": "#731f39",
  "::Const.UI.Color.Status": "#731f39",
  "this.Const.UI.Color.Perk": "#008060",
  "::Const.UI.Color.Perk": "#008060",
  "this.Const.UI.Color.RuneColor": "#bf2aac",
  "::Const.UI.Color.RuneColor": "#bf2aac",
  "this.Const.UI.Color.Buff": "#56c7ff",
  "::Const.UI.Color.Buff": "#56c7ff",
  "this.Const.UI.Color.Debuff": "#ff5e5e",
  "::Const.UI.Color.Debuff": "#ff5e5e",
  "this.Const.UI.Color.PositiveEventValue": "#1e861e",
  "::Const.UI.Color.PositiveEventValue": "#1e861e",
  "this.Const.UI.Color.NegativeEventValue": "#a22424",
  "::Const.UI.Color.NegativeEventValue": "#a22424",
};

const DEFAULT_COLOR = "#d7b174";

const PERK_NAME_PREFIX = "PerkName.";
const PERK_DESCRIPTION_PREFIX = "PerkDescription.";

const fileInput = document.querySelector("#file-input");
const searchInput = document.querySelector("#search-input");
const entryListEl = document.querySelector("#entry-list");
const entryCountEl = document.querySelector("#entry-count");
const textareaEl = document.querySelector("#entry-text");
const previewEl = document.querySelector("#preview");
const assignmentOutputEl = document.querySelector("#assignment-output");
const copyAssignmentBtn = document.querySelector("#copy-assignment");
const copyPreviewBtn = document.querySelector("#copy-preview-html");
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
copyPreviewBtn.addEventListener("click", () => copyToClipboard(previewEl.innerHTML, "Preview HTML copied."));
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
      displayText: decodeExpression(trimmed),
      unknownTokens: collectUnknownTokens(trimmed),
      dirty: false,
      isNew: false,
    };
    parsed.push(entry);
  }
  return parsed;
}

function collectUnknownTokens(expr) {
  const unknown = new Set();
  const tokenRegex = /(::|this\.)Const\.UI\.Color\.[A-Za-z0-9_]+/g;
  let match;
  while ((match = tokenRegex.exec(expr)) !== null) {
    const token = match[0];
    if (!COLOR_TOKEN_MAP[token]) {
      state.unknownTokens.add(token);
      unknown.add(token);
    }
  }
  return Array.from(unknown);
}

function decodeExpression(expr) {
  if (!expr) return "";
  let processed = expr.replace(/(::|this\.)Const\.UI\.Color\.[A-Za-z0-9_]+/g, (token) => {
    const value = COLOR_TOKEN_MAP[token];
    if (!value) {
      return `"${DEFAULT_COLOR}"`;
    }
    return `"${value}"`;
  });
  const parts = [];
  const stringRegex = /"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = stringRegex.exec(processed)) !== null) {
    parts.push(match[1]);
  }
  let combined = parts.join("");
  combined = combined.replace(/\\n/g, "\n");
  combined = combined.replace(/\\t/g, "\t");
  combined = combined.replace(/\\"/g, '"');
  combined = combined.replace(/\\\\/g, "\\");
  return combined;
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

function selectEntry(id) {
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
  textareaEl.focus();
  textareaEl.setSelectionRange(entry.displayText.length, entry.displayText.length);
  assignmentOutputEl.value = formatAssignment(entry);
  copyAssignmentBtn.disabled = false;
  copyPreviewBtn.disabled = false;
  downloadBtn.disabled = false;
  updatePreview(entry);
  updateNotes(entry);
}

function clearEditor() {
  textareaEl.value = "";
  textareaEl.disabled = true;
  assignmentOutputEl.value = "";
  copyAssignmentBtn.disabled = true;
  copyPreviewBtn.disabled = true;
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
    if (filtered.length > 0) {
      const preferred = filtered.find((item) => item.key.startsWith(PERK_DESCRIPTION_PREFIX)) ?? filtered[0];
      selectEntry(preferred.id);
    } else {
      state.selectedId = null;
      clearEditor();
    }
  }
}

function handleTextChange(event) {
  const entry = state.entries.find((item) => item.id === state.selectedId);
  if (!entry) return;
  entry.displayText = event.target.value;
  entry.dirty = true;
  assignmentOutputEl.value = formatAssignment(entry);
  updatePreview(entry);
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
  const encoded = encodeSquirrelString(entry.displayText);
  const operator = entry.operator ?? "<-";
  return `::Const.Strings.${entry.key} ${operator} ${encoded};`;
}

function encodeSquirrelString(text) {
  if (text == null) {
    return '""';
  }
  let escaped = text.replace(/\\/g, "\\\\");
  escaped = escaped.replace(/\r?\n/g, "\\n");
  escaped = escaped.replace(/\t/g, "\\t");
  escaped = escaped.replace(/"/g, '\\"');
  return `"${escaped}"`;
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
      const encoded = encodeSquirrelString(entry.displayText);
      const replacement = `${entry.leadingWhitespace || " "}${encoded}${entry.trailingWhitespace || ""}`;
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
