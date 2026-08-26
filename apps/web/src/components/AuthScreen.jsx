import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { SUPPORTED_LANGUAGES, applyLanguage, currentLanguage } from '../i18n'

export default function AuthScreen({ onAuthSuccess }) {
  const { t } = useTranslation()
  const [isSignup, setIsSignup] = useState(false)
  // Not held in component state: the picker reads and writes the app's one
  // live language value, so this screen can't disagree with what it shows.
  const language = currentLanguage()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (isSignup && !fullName.trim()) {
      setError(t('errors.fullNameRequired'))
      setLoading(false)
      return
    }

    if (isSignup && password !== confirmPassword) {
      setError(t('errors.passwordsMismatch'))
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError(t('errors.passwordTooShort'))
      setLoading(false)
      return
    }

    try {
      if (isSignup) {
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // The only place the sign-up choice is recorded until
            // FacilityScreen creates the nurses row. Email confirmation puts
            // a page load in between, so it has to survive outside the tab.
            data: { full_name: fullName.trim(), preferred_language: language },
          },
        })
        if (signupError) throw signupError

        // If email confirmation is required, Supabase returns a user but no session
        if (data.user && !data.session) {
          setConfirmationSent(true)
        } else if (data.session) {
          onAuthSuccess(data.session)
        }
      } else {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (loginError) throw loginError
        onAuthSuccess(data.session)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Apply immediately so the rest of sign-up is already in that language.
  const handleLanguagePick = (code) => applyLanguage(code)

  if (confirmationSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-6">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            <span className="text-blue-600">noa</span> health
          </h1>
          <div className="mt-8 w-full rounded-xl border border-gray-200 bg-white px-6 py-8 shadow-sm">
            <div className="mb-4 flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="font-display text-xl font-semibold text-gray-900">{t('auth.checkEmailHeading')}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {t('auth.confirmationSentPrefix')} <span className="font-medium text-gray-900">{email}</span>.{' '}
              {t('auth.confirmationSentSuffix')}
            </p>
            <button
              onClick={() => { setConfirmationSent(false); setIsSignup(false) }}
              className="mt-6 w-full rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-md ring-4 ring-blue-600/10 transition-all duration-200 hover:bg-blue-700 hover:shadow-lg hover:ring-blue-700/20 active:scale-[0.97]"
            >
              {t('auth.backToSignIn')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-6">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        {/* Logo / Brand */}
        <h1 className="font-display text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          <span className="text-blue-600">noa</span> health
        </h1>

        {/* Tagline */}
        <p className="mt-4 text-lg text-gray-600 leading-relaxed">
          {t('auth.taglineLine1')}<br />
          {t('auth.taglineLine2')}
        </p>

        {/* Auth form */}
        <div className="mt-8 w-full rounded-xl border border-gray-200 bg-white px-6 py-6 shadow-sm">
          <h2 className="font-display text-xl font-semibold text-gray-900">
            {isSignup ? t('auth.createAccountHeading') : t('auth.signInHeading')}
          </h2>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-left">
            {isSignup && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">{t('auth.fullName')}</label>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder={t('auth.fullNamePlaceholder')}
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">{t('auth.email')}</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder={t('auth.emailPlaceholder')}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">{t('auth.password')}</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder={t('auth.passwordPlaceholder')}
              />
            </div>

            {isSignup && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">{t('auth.confirmPassword')}</label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                />
              </div>
            )}

            {isSignup && (
              <div>
                <span className="block text-sm font-medium text-gray-700">{t('language.label')}</span>
                <div className="mt-1 flex gap-2">
                  {SUPPORTED_LANGUAGES.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleLanguagePick(code)}
                      className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        language === code
                          ? 'bg-blue-100 text-blue-700 border border-blue-300'
                          : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      {t(`language.${code}`)}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-400">{t('language.signupHint')}</p>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-md ring-4 ring-blue-600/10 transition-all duration-200 hover:bg-blue-700 hover:shadow-lg hover:ring-blue-700/20 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? (isSignup ? t('auth.creatingAccount') : t('auth.signingIn'))
                : (isSignup ? t('auth.createAccountButton') : t('auth.signInButton'))}
            </button>
          </form>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="text-sm text-gray-500">
              {isSignup ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
              <button
                onClick={() => { setIsSignup(!isSignup); setError(null) }}
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                {isSignup ? t('auth.switchToSignIn') : t('auth.switchToSignUp')}
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-12 text-xs text-gray-400">
          {t('common.syntheticDataOnly')}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          {t('common.builtBy')}
        </p>
      </div>
    </div>
  )
}
