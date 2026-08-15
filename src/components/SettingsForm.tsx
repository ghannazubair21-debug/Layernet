import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './SettingsForm.css'

type Theme = 'light' | 'dark' | 'system'

interface Settings {
  name: string
  email: string
  theme: Theme
}

const STORAGE_KEY = 'layernet-settings'

const defaultSettings: Settings = {
  name: '',
  email: '',
  theme: 'system',
}

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return defaultSettings
    return { ...defaultSettings, ...JSON.parse(stored) }
  } catch {
    return defaultSettings
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

export default function SettingsForm() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme])

  function handleChange(field: keyof Settings, value: string) {
    setSettings((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    applyTheme(settings.theme)
    setSaved(true)
  }

  return (
    <section className="settings">
      <h1>Settings</h1>
      <p className="settings-description">
        Update your profile and appearance preferences.
      </p>

      <form className="settings-form" onSubmit={handleSubmit}>
        <div className="settings-field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            value={settings.name}
            onChange={(event) => handleChange('name', event.target.value)}
            placeholder="Your name"
            autoComplete="name"
          />
        </div>

        <div className="settings-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={settings.email}
            onChange={(event) => handleChange('email', event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>

        <div className="settings-field">
          <label htmlFor="theme">Theme</label>
          <select
            id="theme"
            value={settings.theme}
            onChange={(event) =>
              handleChange('theme', event.target.value as Theme)
            }
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <div className="settings-actions">
          <button type="submit" className="settings-save">
            Save
          </button>
          {saved && (
            <p className="settings-feedback" role="status">
              Settings saved.
            </p>
          )}
        </div>
      </form>
    </section>
  )
}
