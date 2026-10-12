// Descriptive statistics only. These rates are observations across a sample,
// not per-message constraints or a calibrated personal voice classifier.
export function aggregate(texts: string[]) {
  if (!texts.length) throw new Error("Cannot measure an empty text sample.");
  const lengths = texts
    .map((text) => text.trim().split(/\s+/).filter(Boolean).length)
    .sort((a, b) => a - b);
  const middle = Math.floor(lengths.length / 2);
  const openers: { [key: string]: number } = {};
  for (const text of texts) {
    const word = text.trim().split(/\s+/)[0].toLowerCase();
    openers[word] = (openers[word] ?? 0) + 1 / texts.length;
  }
  const rate = (test: (text: string) => boolean) =>
    texts.filter(test).length / texts.length;
  return {
    medianWords:
      lengths.length % 2
        ? lengths[middle]
        : (lengths[middle - 1] + lengths[middle]) / 2,
    p90Words:
      lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * 0.9))],
    startsLowercaseRate: rate((text) => {
      const letter = text.match(/\p{L}/u)?.[0];
      return (
        !!letter &&
        letter === letter.toLowerCase() &&
        letter !== letter.toUpperCase()
      );
    }),
    endsWithPeriodRate: rate((text) => text.trim().endsWith(".")),
    endsWithExclamationRate: rate((text) => text.trim().endsWith("!")),
    openerDist: openers,
  };
}
