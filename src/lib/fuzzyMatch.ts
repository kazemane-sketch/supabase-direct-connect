/**
 * Simple bigram-based string similarity (Sørensen–Dice coefficient).
 * Returns a value between 0 and 1.
 */
export function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams = (str: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bi = str.substring(i, i + 2);
      set.set(bi, (set.get(bi) || 0) + 1);
    }
    return set;
  };

  const bg1 = bigrams(s1);
  const bg2 = bigrams(s2);
  let matches = 0;
  for (const [bi, count] of bg1) {
    matches += Math.min(count, bg2.get(bi) || 0);
  }

  const total = s1.length + s2.length - 2;
  return (2 * matches) / total;
}
