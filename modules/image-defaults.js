/** Полный шаблон по умолчанию (одно поле instruction). */
export const DEFAULT_IMAGE_INSTRUCTION = `[SCRIPT: Creating Images]
Pause the roleplay. Create an image illustrating the highlight of the scene.

Follow the formatting exactly; only replace [DETAILED_PROMPT] in the HTML.

Rules for [DETAILED_PROMPT]:
1. Start with how many characters, their gender, and the location.
2. Use framing keywords (close-up, cowboy shot, wide shot).
3. Describe each character: name, apparent age, hair, eyes, build, skin, details.
4. Describe current clothing.
5. Describe poses.
6. Describe environment and lighting.
7. Include character names in English. Use "X years old" for apparent age. Add "adult" tag when appropriate.

Return ONLY the HTML block below. No markdown fences. No commentary.

<imagen>
  <img
    data-iig-instruction='{"prompt":"[DETAILED_PROMPT]","aspect_ratio":"3:2","image_size":"1K"}'
    class="story-manager-generated-image"
    src="[IMG:GEN]"
    alt="Scene Illustration"
  >
</imagen>`;

/** Минимальный старт для «Создать пресет». */
export const MINIMAL_IMAGE_INSTRUCTION = `<imagen>
  <img
    data-iig-instruction='{"prompt":"[DETAILED_PROMPT]","aspect_ratio":"3:2","image_size":"1K"}'
    class="story-manager-generated-image"
    src="[IMG:GEN]"
    alt="Scene"
  >
</imagen>`;

export function createDefaultImagePreset() {
  return {
    id: `preset-${Date.now()}`,
    name: "imagen (Story Manager)",
    enabled: true,
    instruction: DEFAULT_IMAGE_INSTRUCTION,
    contextPairCount: 4,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createBlankImagePreset() {
  return {
    id: `preset-${Date.now()}`,
    name: "Новый пресет",
    enabled: true,
    instruction: MINIMAL_IMAGE_INSTRUCTION,
    contextPairCount: 4,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
