import { getCharacterMessageContext } from "../message-context.js";
import {
  buildCharacterEntityData,
  parseCharacterCardResponse,
} from "../lore-cards.js";
import { generateStructuredEntity } from "./shared.js";

export async function generateCharacter(messageId) {
  return generateStructuredEntity({
    entityType: "characters",
    messageId,
    promptKey: "characterPrompt",
    contextDirection: getCharacterMessageContext(),
    parseResult: parseCharacterCardResponse,
    buildEntityData: buildCharacterEntityData,
  });
}
