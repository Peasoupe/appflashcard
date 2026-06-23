import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { sm2, isDue } from '../lib/sm2'
import CardRenderer from '../components/CardRenderer'

const QUALITY_LABELS = [
  { q: 0, label: 'Raté',     sub: 'une fois encore', color: '--rate-rate' },
  { q: 3, label: 'Difficile', sub: 'avec effort',     color: '--rate-hard' },
  { q: 4, label: 'Bien',     sub: 'satisfaisant',    color: '--rate-good' },
  { q: 5, label: 'Facile',   sub: 'aisément',        color: '--rate-easy' },
]

const SESSION_DURATIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '60 min', value: 60 },
  { label: 'Sans limite', value: 0 },
]

function markStudiedToday() {
  const key = 'flashefc_study_dates'
  const existing = JSON.parse(localStorage.getItem(key) || '[]')
  const today = new Date().toISOString().split('T')[0]
  if (!existing.includes(today)) {
    localStorage.setItem(key, JSON.stringify([...existing, today]))
  }
  localStorage.setItem('flashefc_last_studied', new Date().toISOString())
}

function SessionPicker({ deck, onStart }) {
  return (
    <div className="max-w-lg mx-auto px-4 w-full" style={{ paddingTop: '80px' }}>
      <Link to={`/decks/${deck?.id}`} className="text-xs font-bold uppercase tracking-[1.5px] text-ink-3 hover:text-ink transition-colors">
        ← {deck?.name}
      </Link>
      <div
        className="bg-ivoire-2 border border-rule rounded-2xl p-8 mt-6"
        style={{ boxShadow: '0 12px 28px -16px rgba(28,24,20,0.18)' }}
      >
        <h2 className="font-display font-semibold text-foret mb-2" style={{ fontSize: '28px' }}>
          Durée de session
        </h2>
        <p className="text-ink-3 text-sm mb-8">Choisissez combien de temps vous souhaitez étudier.</p>
        <div className="grid grid-cols-2 gap-3">
          {SESSION_DURATIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => onStart(value)}
              className="border border-foret text-foret font-bold rounded-[18px] py-4 hover:bg-foret hover:text-ivoire transition-all text-sm"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function SessionTimer({ durationMin, startTime }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!durationMin) return
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [durationMin, startTime])

  if (!durationMin) return null

  const totalSec = durationMin * 60
  const remaining = Math.max(0, totalSec - elapsed)
  const progress = Math.min(100, (elapsed / totalSec) * 100)
  const min = Math.floor(remaining / 60)
  const sec = remaining % 60

  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[2px] text-ink-3">Session</span>
        <span className="text-[11px] font-bold text-ink-3 tabular-nums">
          {min}:{String(sec).padStart(2, '0')} restant
        </span>
      </div>
      <div className="bg-rule rounded-full h-px">
        <div
          className="bg-laiton h-px rounded-full transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

export default function Study() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode')

  const [deck, setDeck] = useState(null)
  const [queue, setQueue] = useState([])
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sessionResults, setSessionResults] = useState([])
  const [done, setDone] = useState(false)

  const [sessionDuration, setSessionDuration] = useState(null)
  const [sessionStart, setSessionStart] = useState(null)

  const handleQualityRef = useRef(null)

  useEffect(() => { fetchSession() }, [id])

  useEffect(() => {
    function handleKey(e) {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        if (!flipped && !transitioning) flipCard()
      }
      if (flipped && !transitioning) {
        if (e.key === '1') handleQualityRef.current?.(0)
        if (e.key === '2') handleQualityRef.current?.(3)
        if (e.key === '3') handleQualityRef.current?.(4)
        if (e.key === '4') handleQualityRef.current?.(5)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [flipped, transitioning])

  async function fetchSession() {
    const { data: deckData } = await supabase
      .from('decks').select('*').eq('id', id).eq('user_id', user.id).single()

    if (!deckData) { navigate('/'); return }
    setDeck(deckData)

    const { data: cards } = await supabase
      .from('cards').select('*').eq('deck_id', id)

    const all = cards || []
    let filtered

    if (mode === 'all') {
      filtered = all
    } else if (mode === 'unseen') {
      const lastSessionDate = all
        .map(c => c.last_review_date)
        .filter(Boolean)
        .sort()
        .at(-1)
      filtered = lastSessionDate
        ? all.filter(c => c.last_review_date !== lastSessionDate)
        : all
    } else {
      const due = all.filter(isDue)
      filtered = due.length > 0 ? due : all
    }

    const coded = filtered.filter(c => c.card_code)
    const uncoded = filtered.filter(c => !c.card_code)

    const groups = {}
    for (const card of coded) {
      const root = card.card_code.split('.')[0]
      if (!groups[root]) groups[root] = []
      groups[root].push(card)
    }

    const codeSort = (a, b) => {
      const ap = a.card_code.split('.').map(Number)
      const bp = b.card_code.split('.').map(Number)
      for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
        const d = (ap[i] ?? 0) - (bp[i] ?? 0)
        if (d !== 0) return d
      }
      return 0
    }

    const shuffledGroups = Object.values(groups).sort(() => Math.random() - 0.5)
    const orderedCoded = shuffledGroups.flatMap(g => g.sort(codeSort))
    const shuffledUncoded = uncoded.sort(() => Math.random() - 0.5)

    setQueue([...orderedCoded, ...shuffledUncoded])
    setLoading(false)
  }

  function flipCard() {
    setTransitioning(true)
    setTimeout(() => {
      setFlipped(true)
      setTransitioning(false)
    }, 150)
  }

  async function handleQuality(quality) {
    const card = queue[current]
    const result = sm2(card, quality)
    await supabase.from('cards').update(result).eq('id', card.id)
    setSessionResults(prev => [...prev, { card, quality }])

    if (current + 1 >= queue.length) {
      markStudiedToday()
      setDone(true)
    } else {
      setTransitioning(true)
      setTimeout(() => {
        setCurrent(prev => prev + 1)
        setFlipped(false)
        setTransitioning(false)
      }, 150)
    }
  }

  handleQualityRef.current = handleQuality

  function handleSessionStart(duration) {
    setSessionDuration(duration)
    setSessionStart(Date.now())
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className="w-6 h-6 border-2 border-rule border-t-foret rounded-full animate-spin" />
      </div>
    )
  }

  if (queue.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="font-display text-foret mb-3" style={{ fontSize: '32px', fontStyle: 'italic' }}>
          Tout est à jour.
        </p>
        <p className="text-ink-3 text-sm mb-8">Toutes les cartes sont révisées pour aujourd'hui.</p>
        <Link
          to={`/decks/${id}`}
          className="text-xs font-bold uppercase tracking-[1.5px] text-laiton hover:text-foret transition-colors"
        >
          ← Retour au deck
        </Link>
      </div>
    )
  }

  if (sessionDuration === null) {
    return <SessionPicker deck={deck} onStart={handleSessionStart} />
  }

  if (done) {
    const correct = sessionResults.filter(r => r.quality >= 3).length
    const studied = new Set(JSON.parse(localStorage.getItem('flashefc_study_dates') || '[]'))
    const dayLabels = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
    const weekDays = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      weekDays.push({ studied: studied.has(dateStr), label: dayLabels[d.getDay()] })
    }

    return (
      <div className="max-w-lg mx-auto px-4 w-full" style={{ paddingTop: '80px', paddingBottom: '80px' }}>
        <div
          className="bg-ivoire-2 border border-rule rounded-2xl p-8 mb-6 text-center"
          style={{ boxShadow: '0 12px 28px -16px rgba(28,24,20,0.18)' }}
        >
          <p className="font-display font-semibold text-foret mb-2" style={{ fontSize: '32px', fontStyle: 'italic' }}>
            {correct >= sessionResults.length * 0.8 ? 'Bien joué.' : correct >= sessionResults.length * 0.5 ? 'Bon travail.' : 'Continuez.'}
          </p>
          <p className="text-ink-2 text-base">
            {correct} carte{correct !== 1 ? 's' : ''} acquise{correct !== 1 ? 's' : ''} sur {sessionResults.length}.
          </p>
        </div>

        {/* Weekly chart */}
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[2px] text-ink-3 mb-3">Cette semaine</p>
          <div className="flex gap-2 items-end">
            {weekDays.map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-full rounded ${d.studied ? 'bg-foret' : 'bg-rule'}`} style={{ height: '20px' }} />
                <span className="text-[10px] text-ink-3">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card results */}
        <div className="space-y-2 mb-8">
          {sessionResults.map(({ card, quality }, i) => {
            const qi = QUALITY_LABELS.find(q => q.q === quality) || QUALITY_LABELS[0]
            return (
              <div key={i} className="bg-ivoire-2 border border-rule rounded-xl px-4 py-3 flex justify-between items-center">
                <p className="text-sm text-ink-2 truncate flex-1 mr-4">{card.front}</p>
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full text-ivoire shrink-0"
                  style={{ backgroundColor: `var(${qi.color})` }}
                >
                  {qi.label}
                </span>
              </div>
            )
          })}
        </div>

        <div className="flex gap-3 justify-center">
          <Link
            to={`/decks/${id}`}
            className="text-xs font-bold uppercase tracking-[1.5px] text-laiton hover:text-foret transition-colors"
          >
            ← Retour au deck
          </Link>
          <button
            onClick={() => {
              setCurrent(0); setFlipped(false); setDone(false)
              setSessionResults([]); setSessionDuration(null); fetchSession()
            }}
            className="bg-foret text-ivoire text-sm px-5 py-2.5 rounded-[18px] hover:brightness-90 transition-all font-bold"
          >
            Recommencer
          </button>
        </div>
      </div>
    )
  }

  const card = queue[current]
  const progress = Math.round((current / queue.length) * 100)

  return (
    <div className="max-w-[720px] mx-auto px-4 w-full" style={{ paddingTop: '40px', paddingBottom: '60px' }}>
      {/* Session timer */}
      {sessionDuration > 0 && (
        <SessionTimer durationMin={sessionDuration} startTime={sessionStart} />
      )}

      {/* Metadata header */}
      <div className="flex items-center justify-between mb-6">
        <Link to={`/decks/${id}`} className="text-[11px] font-bold uppercase tracking-[2px] text-ink-3 hover:text-ink transition-colors">
          ← {deck?.name}
        </Link>
        <div className="flex items-center gap-4 text-[11px] font-bold uppercase tracking-[2px] text-ink-3">
          <span>{current + 1} / {queue.length}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-rule rounded-full h-px mb-8">
        <div
          className="bg-foret h-px rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Flashcard */}
      <div
        onClick={() => { if (!flipped && !transitioning) flipCard() }}
        className={`border rounded-2xl mb-6 cursor-pointer transition-all duration-300 ${
          flipped ? 'border-laiton cursor-default' : 'border-rule hover:border-laiton'
        }`}
        style={{
          backgroundColor: 'var(--ivoire-2)',
          minHeight: '420px',
          boxShadow: '0 12px 28px -16px rgba(28,24,20,0.18)',
          opacity: transitioning ? 0 : 1,
          transform: transitioning ? 'scale(0.98)' : 'scale(1)',
          transition: 'opacity 150ms ease-out, transform 150ms ease-out, border-color 200ms',
        }}
      >
        {!flipped ? (
          <div className="flex flex-col items-center justify-center text-center p-10 h-full" style={{ minHeight: '420px' }}>
            <p className="text-[11px] font-bold uppercase tracking-[2.5px] text-ink-3 mb-6">Question</p>
            <p
              className="font-display font-semibold text-foret"
              style={{ fontSize: '28px', lineHeight: '1.4' }}
            >
              {card.front}
            </p>
            <p className="text-xs text-ink-3 mt-8">Espace · Cliquez pour révéler</p>
          </div>
        ) : (
          <div className="p-8 w-full">
            <div className="text-center mb-6">
              <p className="text-[11px] font-bold uppercase tracking-[2.5px] text-ink-3 mb-3">Question</p>
              <p className="text-ink-3 text-sm leading-relaxed">{card.front}</p>
            </div>
            <div className="border-t border-rule pt-6">
              <p className="text-[11px] font-bold uppercase tracking-[2.5px] text-ink-3 mb-4 text-center">Réponse</p>
              <div
                className="text-ink-2 leading-relaxed"
                style={{ fontSize: '20px', lineHeight: '1.7' }}
              >
                <CardRenderer content={card.back} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rating buttons */}
      {flipped && (
        <div className="grid grid-cols-4 gap-2">
          {QUALITY_LABELS.map(({ q, label, sub, color }, idx) => (
            <button
              key={q}
              onClick={() => handleQuality(q)}
              className="flex flex-col items-center justify-center rounded-[18px] text-ivoire transition-all hover:brightness-90 active:scale-95"
              style={{
                backgroundColor: `var(${color})`,
                height: '80px',
                padding: '0 8px',
              }}
            >
              <span className="font-display font-semibold" style={{ fontSize: '18px', lineHeight: '1.1' }}>
                {label}
              </span>
              <span className="font-['Atkinson_Hyperlegible'] italic text-ivoire/80" style={{ fontSize: '11px', marginTop: '3px' }}>
                {sub}
              </span>
              <span className="font-mono text-ivoire/50 mt-1" style={{ fontSize: '10px' }}>
                {idx + 1}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
