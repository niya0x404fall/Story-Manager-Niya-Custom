import { extension_settings } from "../../../../extensions.js";
import { eventSource, event_types, generateRaw } from "../../../../../script.js";
import { getSettings } from "./settings.js";
import {
  canUseDirectConnectionProfile,
  generateDirectQuiet,
  getConnectionProfileById,
} from "./llm-client.js";

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
  return getConnectionProfileById(profileId);
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

  const runWithLegacySwitch = () =>
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
    return runWithLegacySwitch();
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
  if (!profile || !canUseDirectConnectionProfile(profile)) {
    return runWithLegacySwitch();
  }

  try {
    return await generateDirectQuiet({
      prompt,
      systemPrompt,
      messages: hasMessages ? messages : null,
      responseLength,
      profile,
      signal,
    });
  } catch (err) {
    if (signal?.aborted || err?.name === "AbortError") {
      throw err;
    }
    return runWithLegacySwitch();
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
