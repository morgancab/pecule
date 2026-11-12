/** Majuscules, sans accents, ponctuation remplacée par des espaces. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9&]+/g, ' ')
    .trim();
}

/**
 * Le motif doit commencer au début d'un mot du libellé.
 * Les motifs courts (< 5 caractères) doivent correspondre à un mot entier
 * pour éviter que « PAUL » ne capte « PAULINE ».
 */
export function containsPattern(normLabel: string, normPattern: string, exact = normPattern.length < 5): boolean {
  if (!normPattern) return false;
  const hay = ' ' + normLabel + ' ';
  if (!exact) return hay.includes(' ' + normPattern);
  return hay.includes(' ' + normPattern + ' ');
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
