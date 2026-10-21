export type ThemeName = 'red basic' | 'dark minimal' | 'oled pure';

export function applyTheme(themeName: string) {
  const root = document.documentElement;
  if (themeName === 'dark minimal') {
    root.style.setProperty('--bg-top', '#13171b');
    root.style.setProperty('--bg-bottom', '#040608');
    root.style.setProperty('--selected', '#1f2730');
    root.style.setProperty('--surface-1', '#0f1317');
    root.style.setProperty('--surface-2', '#13181e');
    root.style.setProperty('--surface-3', '#0c1014');
  } else if (themeName === 'oled pure') {
    root.style.setProperty('--bg-top', '#0a0a0a');
    root.style.setProperty('--bg-bottom', '#000000');
    root.style.setProperty('--selected', '#242424');
    root.style.setProperty('--surface-1', '#0c0c0c');
    root.style.setProperty('--surface-2', '#121212');
    root.style.setProperty('--surface-3', '#080808');
  } else {
    // red basic default
    root.style.removeProperty('--bg-top');
    root.style.removeProperty('--bg-bottom');
    root.style.removeProperty('--selected');
    root.style.removeProperty('--surface-1');
    root.style.removeProperty('--surface-2');
    root.style.removeProperty('--surface-3');
  }
  localStorage.setItem('rrchat_theme', themeName);
}

export function initTheme() {
  const saved = localStorage.getItem('rrchat_theme') || 'red basic';
  applyTheme(saved);
}
