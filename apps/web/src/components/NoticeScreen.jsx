import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, applyLanguage, currentLanguage } from '../i18n'

// Mandatory data-entry notice. Blocks everything else -- facility selection,
// dashboard -- until acknowledged (App.jsx). Text is verbatim from
// SECURITY.md, both languages: do not paraphrase or shorten it here.
export default function NoticeScreen({ onAcknowledge }) {
  const { t } = useTranslation()
  // Same reasoning as AuthScreen/FacilityScreen: not held in component
  // state, so the picker can't disagree with the app's one live language.
  const language = currentLanguage()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)

  const paragraphs = t('notice.paragraphs', { returnObjects: true })

  const handleConfirm = async () => {
    setError(null)
    setConfirming(true)
    try {
      await onAcknowledge()
    } catch (err) {
      setError(err.message)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-6 py-10">
      <div className="flex w-full max-w-2xl flex-col items-center text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          <span className="text-blue-600">noa</span> health
        </h1>

        <div className="mt-8 w-full rounded-xl border border-gray-200 bg-white px-6 py-6 shadow-sm text-left">
          {/* Language toggle: usable here regardless of the nurse's signup
              choice, in case they want to read the notice in the other
              language. Same mechanism as TopRightMenu's. */}
          <div className="mb-5 flex justify-end gap-2">
            {SUPPORTED_LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => applyLanguage(code)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  language === code
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                }`}
              >
                {t(`language.${code}`)}
              </button>
            ))}
          </div>

          <h2 className="font-display text-lg font-semibold text-gray-900">{t('notice.title')}</h2>

          <div className="mt-4 max-h-[50vh] space-y-4 overflow-y-auto pr-1 text-sm leading-relaxed text-gray-700">
            {paragraphs.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
            <p className="text-gray-500">{t('notice.builtBy')}</p>
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            className="mt-5 w-full rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-md ring-4 ring-blue-600/10 transition-all duration-200 hover:bg-blue-700 hover:shadow-lg hover:ring-blue-700/20 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirming ? t('common.saving') : t('notice.confirmButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
