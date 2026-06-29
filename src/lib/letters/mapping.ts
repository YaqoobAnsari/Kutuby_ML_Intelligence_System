/**
 * Canonical mapping of the 28 Arabic letters used by the pronunciation models.
 *
 * - `label`: the human/display label and the canonical grouping key found in
 *   `target_sent_to_api` for letter attempts.
 * - `arabic`: the Arabic glyph.
 * - `modelLabel`: the label emitted by the letter verification model
 *   (`predicted_letter`), which differs from our display label.
 */
export interface LetterEntry {
  /** Display label / canonical grouping key (e.g. "Alif"). */
  label: string;
  /** Arabic glyph (e.g. "ا"). */
  arabic: string;
  /** Model-emitted label (e.g. "Alif", "Aain"). */
  modelLabel: string;
}

/** The 28 Arabic letter entries (display label, glyph, model label). */
export const LETTERS: readonly LetterEntry[] = [
  { label: 'Ayn', arabic: 'ع', modelLabel: 'Aain' },
  { label: 'Alif', arabic: 'ا', modelLabel: 'Alif' },
  { label: 'Baa', arabic: 'ب', modelLabel: 'Ba' },
  { label: 'Dal', arabic: 'د', modelLabel: 'Dal' },
  { label: 'Dhaad', arabic: 'ض', modelLabel: 'Daud' },
  { label: 'Faa', arabic: 'ف', modelLabel: 'Faa' },
  { label: 'Ghayn', arabic: 'غ', modelLabel: 'Ghain' },
  { label: 'Ha', arabic: 'ه', modelLabel: 'Haa' },
  { label: 'Haa', arabic: 'ح', modelLabel: 'Hha' },
  { label: 'Jeem', arabic: 'ج', modelLabel: 'Jeem' },
  { label: 'Kaaf', arabic: 'ك', modelLabel: 'Kaaf' },
  { label: 'Khaa', arabic: 'خ', modelLabel: 'Kha' },
  { label: 'Laam', arabic: 'ل', modelLabel: 'Laam' },
  { label: 'Meem', arabic: 'م', modelLabel: 'Meem' },
  { label: 'Noon', arabic: 'ن', modelLabel: 'Noon' },
  { label: 'Qaaf', arabic: 'ق', modelLabel: 'Qauf' },
  { label: 'Raa', arabic: 'ر', modelLabel: 'Raa' },
  { label: 'Thaa', arabic: 'ث', modelLabel: 'Saa' },
  { label: 'Saad', arabic: 'ص', modelLabel: 'Saud' },
  { label: 'Seen', arabic: 'س', modelLabel: 'Seen' },
  { label: 'Sheen', arabic: 'ش', modelLabel: 'Sheen' },
  { label: 'Taa', arabic: 'ت', modelLabel: 'Ta' },
  { label: 'Toh', arabic: 'ط', modelLabel: 'Tua' },
  { label: 'Waw', arabic: 'و', modelLabel: 'Wao' },
  { label: 'Ya', arabic: 'ي', modelLabel: 'Yaa' },
  { label: 'Zay', arabic: 'ز', modelLabel: 'Zaa' },
  { label: 'Dhah', arabic: 'ظ', modelLabel: 'Zhal' },
  { label: 'Thal', arabic: 'ذ', modelLabel: 'Zua' },
];

/** All display labels, in canonical order. */
export const ARABIC_LETTER_LABELS: string[] = LETTERS.map((l) => l.label);

const LABEL_TO_ARABIC = new Map(LETTERS.map((l) => [l.label, l.arabic]));
const MODEL_LABEL_TO_LABEL = new Map(LETTERS.map((l) => [l.modelLabel, l.label]));
const LABEL_SET = new Set<string>(ARABIC_LETTER_LABELS);

/**
 * Resolve the Arabic glyph for a display label.
 * @returns The glyph, or `undefined` if the label is unknown.
 */
export function labelToArabic(label: string): string | undefined {
  return LABEL_TO_ARABIC.get(label);
}

/**
 * Resolve our display label from a model-emitted label.
 * @returns The display label, or `undefined` if the model label is unknown.
 */
export function modelLabelToLabel(model: string): string | undefined {
  return MODEL_LABEL_TO_LABEL.get(model);
}

/**
 * Type guard: whether a string is a known Arabic letter display label.
 */
export function isLetterLabel(s: string): boolean {
  return LABEL_SET.has(s);
}
