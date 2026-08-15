import {
  DEFAULT_SETTINGS,
  isTheme,
  STORAGE_KEY,
  type Settings,
} from './types'

function isSettings(value: unknown): value is Settings {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.name === 'string' &&
    typeof candidate.email === 'string' &&
    isTheme(candidate.theme)
  )
}

export function loadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed: unknown = JSON.parse(raw)
    return isSettings(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function getInitialSettings(): Settings {
  return loadSettings() ?? { ...DEFAULT_SETTINGS }
}
