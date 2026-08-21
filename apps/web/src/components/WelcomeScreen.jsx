export default function WelcomeScreen({ onStart }) {
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

        {/* Try it hint */}
        <div className="mt-8 rounded-xl border border-gray-200 bg-white px-6 py-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Try it: tap the mic and say</p>
          <p className="mt-2 font-display text-base font-semibold text-gray-900">
            &ldquo;Order a CBC stat for Sarah Johnson due tomorrow&rdquo;
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={onStart}
          className="mt-8 rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-md ring-4 ring-blue-600/10 transition-all duration-200 hover:bg-blue-700 hover:shadow-lg hover:ring-blue-700/20 active:scale-[0.97]"
        >
          Start Demo →
        </button>

        {/* Subtle footer */}
        <p className="mt-12 text-xs text-gray-400">
          Demo with simulated data
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Built by Noa Health
        </p>
      </div>
    </div>
  );
}
