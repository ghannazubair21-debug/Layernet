import type { Settings, SettingsErrors } from './types'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateSettings(settings: Settings): SettingsErrors {
  const errors: SettingsErrors = {}

  if (!settings.name.trim()) {
    errors.name = 'Name is required.'
  }

  const email = settings.email.trim()
  if (!email) {
    errors.email = 'Email is required.'
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address.'
  }

  return errors
}

export function hasValidationErrors(errors: SettingsErrors): boolean {
  return Object.keys(errors).length > 0
}
