import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsForm } from './SettingsForm'
import { STORAGE_KEY } from '../settings/types'

describe('SettingsForm', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('renders accessible labels for all fields', () => {
    render(<SettingsForm />)

    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Theme')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'System' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Light' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Dark' })).toBeInTheDocument()
  })

  it('shows validation messages when invalid data is submitted', async () => {
    const user = userEvent.setup()
    render(<SettingsForm />)

    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(screen.getByText('Name is required.')).toBeInTheDocument()
    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('shows an email format error for invalid email values', async () => {
    const user = userEvent.setup()
    render(<SettingsForm />)

    await user.type(screen.getByLabelText('Name'), 'LayerNet User')
    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(
      screen.getByText('Enter a valid email address.'),
    ).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('saves valid settings and shows a success message', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<SettingsForm onSave={onSave} />)

    await user.type(screen.getByLabelText('Name'), 'LayerNet User')
    await user.type(screen.getByLabelText('Email'), 'user@example.com')
    await user.selectOptions(screen.getByLabelText('Theme'), 'dark')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    await waitFor(() => {
      expect(
        screen.getByText('Settings saved successfully.'),
      ).toBeInTheDocument()
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify({
        name: 'LayerNet User',
        email: 'user@example.com',
        theme: 'dark',
      }),
    )
    expect(onSave).toHaveBeenCalledWith({
      name: 'LayerNet User',
      email: 'user@example.com',
      theme: 'dark',
    })
  })

  it('applies the selected theme immediately', async () => {
    const user = userEvent.setup()
    render(<SettingsForm />)

    await user.selectOptions(screen.getByLabelText('Theme'), 'light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    await user.selectOptions(screen.getByLabelText('Theme'), 'dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    await user.selectOptions(screen.getByLabelText('Theme'), 'system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('loads saved settings on mount', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        name: 'Saved User',
        email: 'saved@example.com',
        theme: 'light',
      }),
    )

    render(<SettingsForm />)

    expect(screen.getByLabelText('Name')).toHaveValue('Saved User')
    expect(screen.getByLabelText('Email')).toHaveValue('saved@example.com')
    expect(screen.getByLabelText('Theme')).toHaveValue('light')
  })
})
