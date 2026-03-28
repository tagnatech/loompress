import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const THEMES_DIR = path.join(__dirname, 'themes');

const BUILT_IN_THEMES = ['default', 'minimal', 'magazine', 'developer'];

export function sanitizeThemeName(themeName: string): string {
  return themeName.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function getThemeViewsDir(themeName: string): string {
  const sanitized = sanitizeThemeName(themeName);
  const themeDir = path.join(THEMES_DIR, sanitized);

  if (fs.existsSync(themeDir)) {
    return themeDir;
  }

  // Fallback to default
  return path.join(THEMES_DIR, 'default');
}

export function getAvailableThemes(): string[] {
  try {
    const dirs = fs.readdirSync(THEMES_DIR, { withFileTypes: true });
    return dirs.filter(d => d.isDirectory()).map(d => d.name);
  } catch {
    return BUILT_IN_THEMES;
  }
}

export function isAvailableTheme(themeName: string): boolean {
  const sanitized = sanitizeThemeName(themeName);
  return getAvailableThemes().includes(sanitized);
}

export function getAllThemeViewsDirs(): string[] {
  return getAvailableThemes().map(t => path.join(THEMES_DIR, t));
}
