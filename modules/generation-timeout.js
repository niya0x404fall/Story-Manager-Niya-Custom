import { createTimeout } from "../../../../../scripts/utils.js";
import { fmt, UI } from "./ui-text.js";

/** Ожидание одного запроса к модели при генерации (мс). */
export const GENERATION_TIMEOUT_MS = 180_000;

/** @deprecated Оставлено для обратной совместимости со старым именем. */
export const SUMMARY_GENERATION_TIMEOUT_MS = GENERATION_TIMEOUT_MS;

/** Единый текст ошибки для всех генераций Story Manager при долгом ответе модели. */
export const GENERATION_TIMEOUT_ERROR_MESSAGE = UI.timeout.generation;

/** Сколько раз повторять запрос к модели для одного куска. */
export const SUMMARY_CHUNK_MAX_RETRIES = 3;

/**
 * Ограничивает время ожидания промиса, не затрагивая обычную генерацию SillyTavern.
 * @template T
 * @param {Promise<T>} promise
 * @param {{ timeoutMs?: number, errorMessage?: string, onTimeout?: () => void|Promise<void> }} [options]
 * @returns {Promise<T>}
 */
export async function withGenerationTimeout(promise, options = {}) {
  const timeoutMs = options.timeoutMs ?? GENERATION_TIMEOUT_MS;
  const seconds = Math.round(timeoutMs / 1000);
  const errorMessage =
    options.errorMessage ?? fmt.generationTimeoutWait(seconds);

  try {
    return await Promise.race([promise, createTimeout(timeoutMs, errorMessage)]);
  } catch (err) {
    if (err instanceof Error && err.message === errorMessage) {
      await options.onTimeout?.();
    }
    throw err;
  }
}
