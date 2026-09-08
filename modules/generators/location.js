import { getLocationMessageContext } from "../message-context.js";
import {
  buildLocationEntityData,
  parseLocationCardResponse,
} from "../lore-cards.js";
import { generateStructuredEntity } from "./shared.js";

export async function generateLocation(messageId) {
  return generateStructuredEntity({
    entityType: "locations",
    messageId,
    promptKey: "locationPrompt",
    contextDirection: getLocationMessageContext(),
    parseResult: parseLocationCardResponse,
    buildEntityData: buildLocationEntityData,
  });
}
