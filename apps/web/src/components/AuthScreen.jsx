import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthScreen({ onAuthSuccess }) {
  const [isSignup, setIsSignup] = useState(false)
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
      setError('Full name is required.')
      setLoading(false)
      return
    }

    if (isSignup && password !== confirmPassword) {
      setError('Passwords do not match.')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      setLoading(false)
      return
    }

    try {
      if (isSignup) {
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim() },
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
            <h2 className="font-display text-xl font-semibold text-gray-900">Check your email</h2>
            <p className="mt-2 text-sm text-gray-600">
              We sent a confirmation link to <span className="font-medium text-gray-900">{email}</span>.
              Click it to activate your account, then come back here to sign in.
            </p>
            <button
              onClick={() => { setConfirmationSent(false); setIsSignup(false) }}
              className="mt-6 w-full rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-md ring-4 ring-blue-600/10 transition-all duration-200 hover:bg-blue-700 hover:shadow-lg hover:ring-blue-700/20 active:scale-[0.97]"
            >
              Back to Sign In
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
          The AI coordination teammate for nurses.<br />
          Speak orders. Track tasks. Handoff safely.
        </p>

        {/* Auth form */}
        <div className="mt-8 w-full rounded-xl border border-gray-200 bg-white px-6 py-6 shadow-sm">
          <h2 className="font-display text-xl font-semibold text-gray-900">
            {isSignup ? 'Create your account' : 'Sign in'}
          </h2>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-left">
            {isSignup && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">Full name</label>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Jane Doe"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="At least 6 characters"
              />
            </div>

            {isSignup && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">Confirm password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Re-enter your password"
                />
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
              {loading ? (isSignup ? 'Creating account...' : 'Signing in...') : (isSignup ? 'Create Account' : 'Sign In')}
            </button>
          </form>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="text-sm text-gray-500">
              {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={() => { setIsSignup(!isSignup); setError(null) }}
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                {isSignup ? 'Sign in' : 'Create one'}
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-12 text-xs text-gray-400">
          Synthetic data only &mdash; no real patient information
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Built by Noa Health
        </p>
      </div>
    </div>
  )
}
