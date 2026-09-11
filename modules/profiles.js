import { extension_settings } from "../../../../extensions.js";
import { eventSource, event_types, generateRaw } from "../../../../../script.js";
import { ConnectionManagerRequestService } from "../../../shared.js";
import { getSettings } from "./settings.js";

export function getProfileId() {
  return getSettings().connectionProfileId || "";
}

export function setProfileId(profileId) {
  getSettings().connectionProfileId = profileId || "";
}

export function getAllProfiles() {
  const cm = extension_settings?.connectionManager;
  return cm?.profiles || [];
}

/**
 * @param {string} profileId
 * @returns {object|null}
 */
export function getProfileById(profileId) {
  const id = String(profileId || "").trim();
  if (!id) return null;
  return getAllProfiles().find((profile) => profile.id === id) || null;
}

function normalizeMessageRole(role) {
  const value = String(role || "user").trim().toLowerCase();
  if (value === "admin" || value === "administrator") return "system";
  return ["system", "user", "assistant"].includes(value) ? value : "user";
}

function buildProfileMessages(prompt, systemPrompt, messages) {
  if (Array.isArray(messages) && messages.length > 0) {
    return messages
      .map((message) => ({
        role: normalizeMessageRole(message?.role),
        content: String(message?.content ?? "").trim(),
      }))
      .filter((message) => message.content);
  }

  return [
    ...(systemPrompt?.trim()
      ? [{ role: "system", content: systemPrompt.trim() }]
      : []),
    { role: "user", content: String(prompt ?? "").trim() },
  ].filter((message) => message.content);
}

async function extractProfileResponse(response) {
  if (typeof response === "function") {
    let finalText = "";
    for await (const chunk of response()) {
      if (typeof chunk?.text === "string") {
        finalText = chunk.text;
      }
    }
    if (!finalText.trim()) {
      throw new Error("Story Manager: модель вернула пустой потоковый ответ.");
    }
    return finalText.trim();
  }

  const text = String(response?.content ?? "").trim();
  if (!text) {
    throw new Error("Story Manager: модель вернула пустой ответ.");
  }
  return text;
}

function unwrapRequestError(error) {
  let current = error;
  while (current?.cause && typeof current.cause === "object") {
    current = current.cause;
  }
  return current && typeof current.message === "string" ? current : error;
}

export function getCurrentProfileId() {
  return extension_settings?.connectionManager?.selectedProfile || "";
}

export async function switchProfile(profileId) {
  if (!profileId) return;

  const profilesSelect = document.getElementById("connection_profiles");
  if (!profilesSelect) {
    console.warn("Story Manager: Connection profiles selector not found");
    return;
  }

  const awaitPromise = new Promise((resolve) => {
    const onLoaded = () => {
      eventSource.removeListener(
        event_types.CONNECTION_PROFILE_LOADED,
        onLoaded,
      );
      resolve();
    };

    eventSource.on(event_types.CONNECTION_PROFILE_LOADED, onLoaded);

    setTimeout(() => {
      eventSource.removeListener(
        event_types.CONNECTION_PROFILE_LOADED,
        onLoaded,
      );
      resolve();
    }, 5000);
  });

  profilesSelect.value = profileId;
  profilesSelect.dispatchEvent(new Event("change"));

  await awaitPromise;
  await new Promise((resolve) => setTimeout(resolve, 500));
}

/**
 * Генерация «тихого» запроса с учётом профиля Story Manager.
 * При включённом useDirectProfileRequests не трогает глобальный селект профилей.
 *
 * @param {{ prompt?: string, systemPrompt?: string, messages?: Array<{ role: string, content: string }>, responseLength?: number, profileIdOverride?: string, signal?: AbortSignal|null }} params
 * @returns {Promise<string>}
 */
export async function generateQuietWithProfile({
  prompt = "",
  systemPrompt = "",
  messages = null,
  responseLength = null,
  profileIdOverride,
  signal = null,
} = {}) {
  const settings = getSettings();
  const targetProfileId = profileIdOverride ?? getProfileId();
  const hasMessages = Array.isArray(messages) && messages.length > 0;
  const effectivePrompt = hasMessages ? messages : prompt;
  const effectiveSystemPrompt = hasMessages ? "" : systemPrompt;

  const runLegacyRequest = () =>
    withProfile(
      () =>
        generateRaw({
          prompt: effectivePrompt,
          systemPrompt: effectiveSystemPrompt,
          responseLength,
        }),
      profileIdOverride,
    );

  if (!settings.useDirectProfileRequests) {
    if (signal?.aborted) {
      throw new DOMException("Generation aborted", "AbortError");
    }
    return runLegacyRequest();
  }

  // Пустой профиль: используем текущие настройки ST.
  if (!targetProfileId) {
    if (signal?.aborted) {
      throw new DOMException("Generation aborted", "AbortError");
    }
    return generateRaw({
      prompt: effectivePrompt,
      systemPrompt: effectiveSystemPrompt,
      responseLength,
    });
  }

  const profile = getProfileById(targetProfileId);
  if (!profile) {
    throw new Error(`Story Manager: профиль подключения не найден (${targetProfileId}).`);
  }

  const profileMessages = buildProfileMessages(prompt, systemPrompt, messages);
  if (profileMessages.length === 0) {
    throw new Error("Story Manager: пустой запрос к модели.");
  }

  // Custom OpenAI-compatible профили получают штатный SSE-парсер ST.
  // Для остальных источников сохраняем обычный непотоковый ответ.
  const stream = String(profile.api || "").trim().toLowerCase() === "custom";

  try {
    const response = await ConnectionManagerRequestService.sendRequest(
      targetProfileId,
      profileMessages,
      typeof responseLength === "number" && responseLength > 0
        ? responseLength
        : 2000,
      {
        stream,
        signal,
        extractData: true,
        includePreset: false,
        includeInstruct: false,
      },
      { include_reasoning: false },
    );
    return await extractProfileResponse(response);
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") {
      throw error;
    }
    // После отправки запроса не делаем ни fallback, ни вторую попытку.
    throw unwrapRequestError(error);
  }
}

export async function withProfile(generationFn, profileIdOverride) {
  const targetProfileId = profileIdOverride ?? getProfileId();
  const currentProfileId = getCurrentProfileId();

  if (!targetProfileId) {
    return await generationFn();
  }

  if (targetProfileId === currentProfileId) {
    return await generationFn();
  }

  let profileSwitched = false;

  try {
    await switchProfile(targetProfileId);
    profileSwitched = true;

    const result = await generationFn();
    return result;
  } finally {
    // Возвращаем исходный профиль только после переключения.
    if (profileSwitched && currentProfileId) {
      await switchProfile(currentProfileId);
    }
  }
}
