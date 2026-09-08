import { extension_settings } from "../../../../extensions.js";
import { getRequestHeaders } from "../../../../../script.js";
import { chat_completion_sources, proxies } from "../../../../openai.js";

const GOOGLE_API_ALIASES = new Set(["google", "makersuite"]);

/**
 * @param {string} apiName
 * @returns {string}
 */
function getChatCompletionSource(apiName) {
  const normalized = String(apiName || "").trim().toLowerCase();
  if (GOOGLE_API_ALIASES.has(normalized)) {
    return chat_completion_sources.MAKERSUITE;
  }
  return normalized || chat_completion_sources.OPENAI;
}

/**
 * @param {string} profileId
 * @returns {object|null}
 */
export function getConnectionProfileById(profileId) {
  const id = String(profileId || "").trim();
  if (!id) {
    return null;
  }

  return (
    extension_settings?.connectionManager?.profiles?.find(
      (profile) => profile.id === id,
    ) || null
  );
}

/**
 * @param {object} profile
 * @returns {boolean}
 */
export function canUseDirectConnectionProfile(profile) {
  if (!profile) {
    return false;
  }

  // Text Completion профили завязаны на другой пайплайн ST.
  if (profile.mode === "tc") {
    return false;
  }

  return Boolean(profile.api && profile.model);
}

function buildMessages(prompt, systemPrompt) {
  const messages = [];

  if (systemPrompt?.trim()) {
    messages.push({ role: "system", content: systemPrompt.trim() });
  }

  messages.push({ role: "user", content: String(prompt ?? "").trim() });
  return messages;
}

/**
 * @param {Array<{ role: string, content: string }>} messages
 * @returns {Array<{ role: string, content: string }>}
 */
function normalizeMessageRole(role) {
  const value = String(role || "user").trim().toLowerCase();
  if (value === "admin" || value === "administrator") {
    return "system";
  }
  if (value === "system" || value === "user" || value === "assistant") {
    return value;
  }
  return "user";
}

function normalizeChatMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  return messages
    .map((message) => ({
      role: normalizeMessageRole(message?.role),
      content: String(message?.content ?? "").trim(),
    }))
    .filter((message) => message.content);
}

/**
 * Подставляет поля connection profile в payload chat-completions (без смены глобального профиля).
 * @param {object} generateData
 * @param {object} profile
 * @param {string} ccSource
 */
function applyConnectionProfileData(generateData, profile, ccSource) {
  const profileApiUrl = profile["api-url"];

  if (ccSource === chat_completion_sources.CUSTOM) {
    const customUrl = String(profileApiUrl || "")
      .trim()
      .replace(/\/+$/, "");
    if (customUrl) {
      generateData.custom_url = customUrl;
    }

    const chatSettings = SillyTavern.getContext()?.chatCompletionSettings;
    const postProcessing =
      profile["prompt-post-processing"] ??
      chatSettings?.custom_prompt_post_processing;
    if (postProcessing) {
      generateData.custom_prompt_post_processing = postProcessing;
    }

    if (chatSettings?.custom_include_body) {
      generateData.custom_include_body = chatSettings.custom_include_body;
    }
    if (chatSettings?.custom_exclude_body) {
      generateData.custom_exclude_body = chatSettings.custom_exclude_body;
    }
    if (chatSettings?.custom_include_headers) {
      generateData.custom_include_headers = chatSettings.custom_include_headers;
    }
  } else if (
    ccSource === chat_completion_sources.VERTEXAI &&
    profileApiUrl
  ) {
    generateData.vertexai_region = profileApiUrl;
    const chatSettings = SillyTavern.getContext()?.chatCompletionSettings;
    if (chatSettings?.vertexai_auth_mode) {
      generateData.vertexai_auth_mode = chatSettings.vertexai_auth_mode;
    }
    if (chatSettings?.vertexai_express_project_id) {
      generateData.vertexai_express_project_id =
        chatSettings.vertexai_express_project_id;
    }
  } else if (ccSource === chat_completion_sources.ZAI && profileApiUrl) {
    generateData.zai_endpoint = profileApiUrl;
  }

  if (profile["secret-id"]) {
    generateData.secret_id = profile["secret-id"];
  }
}

/**
 * @param {object} data
 * @param {string} ccSource
 * @returns {string}
 */
function extractMessageContent(data, ccSource) {
  if (ccSource === chat_completion_sources.CLAUDE) {
    const block = data?.content?.[0];
    if (typeof block === "string") {
      return block.trim();
    }
    return block?.text?.trim() || "";
  }

  if (ccSource === chat_completion_sources.MAKERSUITE) {
    return (
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      data?.choices?.[0]?.message?.content?.trim() ||
      ""
    );
  }

  return (
    data?.choices?.[0]?.message?.content?.trim() ||
    data?.choices?.[0]?.text?.trim() ||
    ""
  );
}

/**
 * Прямой запрос к /api/backends/chat-completions/generate с параметрами выбранного профиля.
 * Глобальный connection profile в UI не переключается.
 *
 * @param {{ prompt?: string, systemPrompt?: string, messages?: Array<{ role: string, content: string }>, responseLength?: number, profile: object, signal?: AbortSignal|null }} params
 * @returns {Promise<string>}
 */
export async function generateDirectQuiet({
  prompt = "",
  systemPrompt = "",
  messages: messagesOverride = null,
  responseLength = null,
  profile,
  signal = null,
}) {
  if (!canUseDirectConnectionProfile(profile)) {
    throw new Error("Story Manager: профиль не поддерживает прямой API-запрос.");
  }

  const ccSource = getChatCompletionSource(profile.api);
  const normalized = normalizeChatMessages(messagesOverride);
  const messages =
    normalized.length > 0 ? normalized : buildMessages(prompt, systemPrompt);

  if (messages.length === 0) {
    throw new Error("Story Manager: пустой запрос к модели.");
  }

  /** @type {Record<string, unknown>} */
  const generateData = {
    messages,
    model: profile.model,
    stream: false,
    chat_completion_source: ccSource,
    include_reasoning: false,
  };

  if (typeof responseLength === "number" && responseLength > 0) {
    generateData.max_tokens = responseLength;
  }

  const proxyPreset = proxies.find((item) => item.name === profile.proxy);
  if (proxyPreset && ccSource !== chat_completion_sources.OPENROUTER) {
    generateData.reverse_proxy = proxyPreset.url;
    generateData.proxy_password = proxyPreset.password;
  }

  applyConnectionProfileData(generateData, profile, ccSource);

  if (
    ccSource === chat_completion_sources.CUSTOM &&
    !generateData.custom_url
  ) {
    throw new Error(
      "Story Manager: в профиле Custom не указан API URL (api-url).",
    );
  }

  if (
    ccSource === chat_completion_sources.MAKERSUITE ||
    ccSource === chat_completion_sources.CLAUDE
  ) {
    generateData.use_sysprompt = true;
  }

  const response = await fetch("/api/backends/chat-completions/generate", {
    method: "POST",
    headers: getRequestHeaders(),
    body: JSON.stringify(generateData),
    signal,
  });

  if (!response.ok) {
    let details = response.statusText;
    try {
      const errorBody = await response.json();
      details = errorBody?.error?.message || errorBody?.error || details;
    } catch {
      try {
        details = await response.text();
      } catch {
        // ignore
      }
    }
    throw new Error(`Story Manager direct API ${response.status}: ${details}`);
  }

  const data = await response.json();

  if (data?.error) {
    throw new Error(data.error.message || data.error || "API error");
  }

  const text = extractMessageContent(data, ccSource);
  if (!text) {
    throw new Error("Story Manager: модель вернула пустой ответ.");
  }

  return text;
}
