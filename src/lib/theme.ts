/**
 * Couleurs des graphiques. Palette catégorielle validée (ordre fixe, jamais recyclé) :
 * un groupe garde toujours la même couleur, quel que soit le nombre de groupes affichés.
 * Les autres couleurs de l'interface sont dans styles.css (variables CSS).
 */
export interface ChartTheme {
  series: string[];
  neutral: string;
  grid: string;
  axis: string;
  muted: string;
  text: string;
  text2: string;
  surface: string;
}

export const CHART: Record<'dark' | 'light', ChartTheme> = {
  dark: {
    series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
    neutral: '#6f6e69',
    grid: '#2c2c2a',
    axis: '#383835',
    muted: '#898781',
    text: '#f0efec',
    text2: '#c3c2b7',
    surface: '#1a1a19',
  },
  light: {
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    neutral: '#8f8e88',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    muted: '#898781',
    text: '#0b0b0b',
    text2: '#52514e',
    surface: '#fcfcfb',
  },
};

export function slotColor(theme: ChartTheme, slot: number | null): string {
  return slot === null ? theme.neutral : theme.series[slot];
}

/** Texte lisible posé sur une couleur de série (blanc, sauf sur le jaune). */
export function inkOn(color: string): string {
  return color === '#eda100' || color === '#c98500' ? '#0b0b0b' : '#ffffff';
}
