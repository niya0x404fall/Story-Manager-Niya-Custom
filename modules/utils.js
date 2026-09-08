/**
 * Утилиты для Story Manager
 */

/**
 * Очистка текста от Markdown-мусора
 */
export function cleanMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .trim();
}

/**
 * Безопасный парсинг JSON с исправлением типичных ошибок нейросетей
 */
export function safeJsonParse(result) {
  try {
    // Ищем JSON внутри блоков кода или просто фигурных скобок
    let jsonMatch =
      result.match(/```json\s*([\s\S]*?)\s*```/) || result.match(/\{[\s\S]*\}/);
    let jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : result;

    // Фиксим проблему со слэшами
    jsonString = jsonString.replace(/(?<!\\)\//g, "\\/");

    return JSON.parse(jsonString);
  } catch (e) {
    console.warn("Story Manager: JSON parse failed", e);
    return null; // Если совсем плохо, возвращаем null, генератор сам решит что делать
  }
}

/**
 * Очистка ключевых слов
 */
export function cleanKeywords(keywordsString) {
  if (!keywordsString) return "";
  return keywordsString
    .split(",")
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
    .join(", ")
    .replace(/\//g, "");
}
