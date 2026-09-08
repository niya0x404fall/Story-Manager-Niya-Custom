import { GENERATION_TIMEOUT_ERROR_MESSAGE } from "../generation-timeout.js";
import { UI } from "../ui-text.js";

const TOAST_TITLES = Object.freeze({
  DEFAULT: UI.toast.titles.default,
  ENTITY: UI.toast.titles.entity,
  SUMMARY: UI.toast.titles.summary,
  IMAGE: UI.toast.titles.image,
});

const TOAST_DEDUPE_MS = 4000;
const toastLastShownAt = new Map();

function shouldShowToast(level, message, options = {}) {
  if (options.dedupe === false) {
    return true;
  }

  const now = Date.now();
  const title = options.title || TOAST_TITLES.DEFAULT;
  const dedupeMs = Number.isFinite(options.dedupeMs) ? options.dedupeMs : TOAST_DEDUPE_MS;
  const dedupeKey = options.dedupeKey || `${level}|${title}|${message}`;
  const lastShownAt = toastLastShownAt.get(dedupeKey) || 0;

  if (now - lastShownAt < dedupeMs) {
    return false;
  }

  toastLastShownAt.set(dedupeKey, now);
  return true;
}

function showToast(level, message, options = {}) {
  if (!shouldShowToast(level, message, options)) {
    return null;
  }

  const title = options.title || TOAST_TITLES.DEFAULT;
  if (level === "success") {
    return toastr.success(message, title, options.config);
  }
  if (level === "error") {
    return toastr.error(message, title, options.config);
  }
  if (level === "warning") {
    return toastr.warning(message, title, options.config);
  }
  return toastr.info(message, title, options.config);
}

function normalizeErrorMessage(error) {
  const message = String(error?.message || "").trim();
  if (!message) {
    return "";
  }
  return message;
}

function getErrorHint(error) {
  const message = normalizeErrorMessage(error).toLowerCase();
  const hints = UI.toast.errorHints;

  if (!message) {
    return hints.default;
  }

  if (message.includes("timeout") || message.includes("timed out")) {
    return hints.timeout;
  }

  if (message.includes("network") || message.includes("fetch")) {
    return hints.network;
  }

  if (message.includes("empty") || message.includes("no result")) {
    return hints.emptyResponse;
  }

  if (message.includes("чат сменился") || message.includes("chat")) {
    return hints.chatSwitched;
  }

  if (message.includes("пресет")) {
    return hints.imagePreset;
  }

  if (message.includes("api") || message.includes("key") || message.includes("auth")) {
    return hints.apiAuth;
  }

  if (message.includes(GENERATION_TIMEOUT_ERROR_MESSAGE.toLowerCase())) {
    return hints.timeout;
  }

  return hints.fallback;
}

export function toastInfo(message, options = {}) {
  return showToast("info", message, options);
}

export function toastStart(message, options = {}) {
  return showToast("info", message, options);
}

export function toastSuccess(message, options = {}) {
  return showToast("success", message, options);
}

export function toastWarning(message, options = {}) {
  return showToast("warning", message, options);
}

export function toastError(message, error, options = {}) {
  const details = normalizeErrorMessage(error);
  const hint = getErrorHint(error);
  const extra = details ? ` ${details}` : "";
  return showToast("error", `${message}${extra}\n${hint}`, options);
}

export function toastEntityStart(message) {
  return toastStart(message, { title: TOAST_TITLES.ENTITY });
}

export function toastEntitySuccess(message) {
  return toastSuccess(message, { title: TOAST_TITLES.ENTITY });
}

export function toastEntityWarning(message) {
  return toastWarning(message, { title: TOAST_TITLES.ENTITY });
}

export function toastEntityError(message, error) {
  return toastError(message, error, { title: TOAST_TITLES.ENTITY });
}

export function toastSummaryStart(message) {
  return toastStart(message, { title: TOAST_TITLES.SUMMARY });
}

export function toastSummarySuccess(message) {
  return toastSuccess(message, { title: TOAST_TITLES.SUMMARY });
}

export function toastSummaryWarning(message) {
  return toastWarning(message, { title: TOAST_TITLES.SUMMARY });
}

export function toastSummaryInfo(message) {
  return toastInfo(message, { title: TOAST_TITLES.SUMMARY });
}

export function toastSummaryError(message, error) {
  return toastError(message, error, { title: TOAST_TITLES.SUMMARY });
}

export function pickRandomImageStartMessage() {
  const messages = UI.toast.imageStart;
  const index = Math.floor(Math.random() * messages.length);
  return messages[index];
}

export function toastImageStart(message = pickRandomImageStartMessage()) {
  return toastStart(message, { title: TOAST_TITLES.IMAGE });
}

export function toastImageSuccess(message, config = { timeOut: 6000 }) {
  return toastSuccess(message, { title: TOAST_TITLES.IMAGE, config });
}

export function toastImageError(message, error, config = { timeOut: 7000 }) {
  return toastError(message, error, { title: TOAST_TITLES.IMAGE, config });
}
