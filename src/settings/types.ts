export type Theme = 'system' | 'light' | 'dark'

export interface Settings {
  name: string
  email: string
  theme: Theme
}

export interface SettingsErrors {
  name?: string
  email?: string
}

export const THEMES: Theme[] = ['system', 'light', 'dark']

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  email: '',
  theme: 'system',
}

export const STORAGE_KEY = 'layernet-settings'

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && THEMES.includes(value as Theme)
}
