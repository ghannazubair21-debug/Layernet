import { useEffect, useId, useState, type FormEvent } from 'react'
import { getInitialSettings, saveSettings } from '../settings/storage'
import { applyTheme } from '../settings/theme'
import type { Settings, Theme } from '../settings/types'
import { hasValidationErrors, validateSettings } from '../settings/validation'
import './SettingsForm.css'

export interface SettingsFormProps {
  className?: string
  onSave?: (settings: Settings) => void
}

const THEME_LABELS: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

export function SettingsForm({ className, onSave }: SettingsFormProps) {
  const formId = useId()
  const nameId = `${formId}-name`
  const emailId = `${formId}-email`
  const themeId = `${formId}-theme`
  const nameErrorId = `${formId}-name-error`
  const emailErrorId = `${formId}-email-error`
  const successId = `${formId}-success`

  const [settings, setSettings] = useState<Settings>(() => getInitialSettings())
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})
  const [successMessage, setSuccessMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    applyTheme(settings.theme)
  }, [])

  function updateField<K extends keyof Settings>(field: K, value: Settings[K]) {
    setSuccessMessage('')
    setSettings((current) => {
      const nextSettings = { ...current, [field]: value }

      if (submitted) {
        setErrors(validateSettings(nextSettings))
      }

      return nextSettings
    })
  }

  function handleThemeChange(theme: Theme) {
    updateField('theme', theme)
    applyTheme(theme)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)

    const validationErrors = validateSettings(settings)
    setErrors(validationErrors)

    if (hasValidationErrors(validationErrors)) {
      setSuccessMessage('')
      return
    }

    const normalizedSettings: Settings = {
      name: settings.name.trim(),
      email: settings.email.trim(),
      theme: settings.theme,
    }

    saveSettings(normalizedSettings)
    applyTheme(normalizedSettings.theme)
    setSettings(normalizedSettings)
    setSuccessMessage('Settings saved successfully.')
    onSave?.(normalizedSettings)
  }

  const formClassName = ['settings-form', className].filter(Boolean).join(' ')

  return (
    <form
      className={formClassName}
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby={`${formId}-title`}
    >
      <h2 id={`${formId}-title`}>Settings</h2>

      <div className="settings-form__field">
        <label htmlFor={nameId}>Name</label>
        <input
          id={nameId}
          name="name"
          type="text"
          autoComplete="name"
          value={settings.name}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? nameErrorId : undefined}
          onChange={(event) => updateField('name', event.target.value)}
        />
        {errors.name ? (
          <p id={nameErrorId} className="settings-form__error" role="alert">
            {errors.name}
          </p>
        ) : null}
      </div>

      <div className="settings-form__field">
        <label htmlFor={emailId}>Email</label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          value={settings.email}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? emailErrorId : undefined}
          onChange={(event) => updateField('email', event.target.value)}
        />
        {errors.email ? (
          <p id={emailErrorId} className="settings-form__error" role="alert">
            {errors.email}
          </p>
        ) : null}
      </div>

      <div className="settings-form__field">
        <label htmlFor={themeId}>Theme</label>
        <select
          id={themeId}
          name="theme"
          value={settings.theme}
          onChange={(event) =>
            handleThemeChange(event.target.value as Theme)
          }
        >
          {(Object.keys(THEME_LABELS) as Theme[]).map((theme) => (
            <option key={theme} value={theme}>
              {THEME_LABELS[theme]}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="settings-form__submit">
        Save settings
      </button>

      {successMessage ? (
        <p
          id={successId}
          className="settings-form__success"
          role="status"
          aria-live="polite"
        >
          {successMessage}
        </p>
      ) : null}
    </form>
  )
}
