import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-bg flex flex-col items-center justify-center px-5 py-8">
      {/* Golfer logo */}
      <div className="mb-3 sm:mb-4">
        <svg width="44" height="44" viewBox="0 0 52 52" fill="none" aria-hidden="true" className="sm:w-[52px] sm:h-[52px]">
          <circle cx="26" cy="9" r="6" fill="#34d178" />
          <line x1="26" y1="15" x2="26" y2="34" stroke="#e4ebe6" strokeWidth="3" strokeLinecap="round" />
          <line x1="26" y1="34" x2="17" y2="47" stroke="#e4ebe6" strokeWidth="3" strokeLinecap="round" />
          <line x1="26" y1="34" x2="35" y2="47" stroke="#e4ebe6" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>

      {/* Brand */}
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-2">
        par<span className="text-ok">3</span>
      </h1>
      <p className="text-muted text-base sm:text-lg mb-10 sm:mb-14">Tu copiloto de practica</p>

      {/* Mode cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-lg mb-10 sm:mb-16">
        <Link href="/mirror">
          <div className="bg-s1 border border-border rounded-2xl p-5 sm:p-7 hover:border-ok/50 hover:bg-s2 transition-all duration-200 cursor-pointer">
            <div className="text-ok mb-4">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none" className="sm:w-8 sm:h-8">
                <rect x="3" y="7" width="26" height="19" rx="3" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="16" cy="16" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 7l2-3h4l2 3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-txt font-semibold text-base sm:text-lg mb-1">Espejo Inteligente</h2>
            <p className="text-dim text-xs sm:text-sm leading-relaxed">Análisis en tiempo real con tu cámara</p>
          </div>
        </Link>

        <Link href="/analysis">
          <div className="bg-s1 border border-border rounded-2xl p-5 sm:p-7 hover:border-blue/50 hover:bg-s2 transition-all duration-200 cursor-pointer">
            <div className="text-blue mb-4">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none" className="sm:w-8 sm:h-8">
                <rect x="3" y="3" width="26" height="26" rx="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 22l5-8 4 6 3-4 4 6H8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-txt font-semibold text-base sm:text-lg mb-1">Análisis de Video</h2>
            <p className="text-dim text-xs sm:text-sm leading-relaxed">Sube o graba un vídeo para analizar</p>
          </div>
        </Link>
      </div>

      {/* Footer */}
      <p className="font-mono text-xs text-dim text-center leading-relaxed">
        par3.app — MediaPipe Pose Detection<br className="sm:hidden" /> para postura de principiantes
      </p>
    </main>
  )
}
