export const VALHEIM_SIGN_WIDTH = 50;

/**
 * Distribute spaces across words so the string fills a 50-char Valheim sign.
 * - 1 word: right-aligned (all padding on the left).
 * - 2 words: one hugs the left edge, the other the right.
 * - 3+ words: split into two halves chosen to balance character counts, padded between.
 * Returns the original name if it can't fit (joined length > width) or is empty.
 */
export function formatForValheimSign(name: string, width = VALHEIM_SIGN_WIDTH): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return name;

  const joined = words.join(" ");
  if (joined.length > width) return name;

  if (words.length === 1) return words[0].padStart(width, " ");

  let bestK = 1;
  let bestDiff = Infinity;
  for (let k = 1; k < words.length; k++) {
    const leftLen = words.slice(0, k).join(" ").length;
    const rightLen = words.slice(k).join(" ").length;
    const diff = Math.abs(leftLen - rightLen);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestK = k;
    }
  }

  const left = words.slice(0, bestK).join(" ");
  const right = words.slice(bestK).join(" ");
  const fill = width - left.length - right.length;
  return left + " ".repeat(fill) + right;
}
