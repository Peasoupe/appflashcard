import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const FILTERS = [
  { label: 'Tous', value: 'all' },
  { label: 'Mes decks', value: 'own' },
  { label: 'Communauté', value: 'community' },
]

export default function Library() {
  const { user } = useAuth()
  const [decks, setDecks] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [copying, setCopying] = useState(null)
  const [copied, setCopied] = useState({})

  useEffect(() => { fetchPublicDecks() }, [])

  async function fetchPublicDecks() {
    setLoading(true)
    const { data } = await supabase
      .from('decks')
      .select('id, name, author_name, published_at, user_id, cards(id)')
      .eq('is_public', true)
      .order('published_at', { ascending: false })

    setDecks(data || [])
    setLoading(false)
  }

  async function copyDeck(deck) {
    setCopying(deck.id)

    const { data: newDeck, error } = await supabase
      .from('decks')
      .insert({ name: deck.name, user_id: user.id })
      .select()
      .single()

    if (error) { setCopying(null); return }

    const { data: cards } = await supabase
      .from('cards')
      .select('front, back')
      .eq('deck_id', deck.id)

    if (cards?.length) {
      await supabase.from('cards').insert(
        cards.map(c => ({ deck_id: newDeck.id, front: c.front, back: c.back }))
      )
    }

    setCopied(prev => ({ ...prev, [deck.id]: true }))
    setCopying(null)
  }

  const isOwnDeck = (deck) => deck.user_id === user.id

  const filtered = useMemo(() => decks.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.author_name || '').toLowerCase().includes(search.toLowerCase())
    if (!matchSearch) return false
    if (filter === 'own') return isOwnDeck(d)
    if (filter === 'community') return !isOwnDeck(d)
    return true
  }), [decks, search, filter, user.id])

  return (
    <div className="max-w-4xl mx-auto px-4 w-full" style={{ paddingTop: '64px', paddingBottom: '80px' }}>
      <div className="mb-8">
        <h1 className="font-display font-semibold text-foret mb-1" style={{ fontSize: '40px', lineHeight: '1.05' }}>
          Bibliothèque
        </h1>
        <p className="text-ink-3 text-sm">Decks partagés par la communauté</p>
      </div>

      {/* Search */}
      <div className="mb-5">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un deck…"
          className="w-full border-b border-rule bg-transparent text-ink text-sm py-2 focus:outline-none focus:border-foret transition-colors placeholder:text-ink-3"
        />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {FILTERS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`text-xs font-bold uppercase tracking-[1.5px] px-4 py-2 rounded-full border transition-colors ${
              filter === value
                ? 'bg-foret text-ivoire border-foret'
                : 'bg-ivoire-2 text-ink-3 border-rule hover:border-laiton'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-rule border-t-foret rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="font-display text-foret mb-2" style={{ fontSize: '24px', fontStyle: 'italic' }}>
            {search ? 'Aucun résultat.' : 'Aucun deck publié.'}
          </p>
          <p className="text-ink-3 text-sm">
            {search ? 'Essayez un autre terme de recherche.' : "La communauté n'a pas encore partagé de deck."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map(deck => (
            <div
              key={deck.id}
              className="bg-ivoire-2 border border-rule rounded-2xl p-6 hover:border-laiton transition-colors"
              style={{ boxShadow: '0 12px 28px -16px rgba(28,24,20,0.18)' }}
            >
              <div className="flex items-start justify-between mb-1">
                <h3 className="font-display font-semibold text-foret" style={{ fontSize: '20px', lineHeight: '1.1' }}>
                  {deck.name}
                </h3>
                {isOwnDeck(deck) ? (
                  <span className="text-[11px] font-bold uppercase tracking-[1px] text-laiton border border-laiton/40 px-2 py-0.5 rounded-full ml-3 shrink-0">
                    Mon deck
                  </span>
                ) : copied[deck.id] ? (
                  <span className="text-[11px] font-bold uppercase tracking-[1px] text-rate-good border border-rate-good/40 px-2 py-0.5 rounded-full ml-3 shrink-0">
                    Copié
                  </span>
                ) : null}
              </div>

              <p className="text-xs font-bold uppercase tracking-[2px] text-ink-3 mb-4">
                par {deck.author_name || 'Anonyme'} · {deck.cards?.length ?? 0} carte{(deck.cards?.length ?? 0) !== 1 ? 's' : ''}
              </p>

              {deck.published_at && (
                <p className="text-xs text-ink-3 mb-4">
                  {new Date(deck.published_at).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}

              {!isOwnDeck(deck) && !copied[deck.id] && (
                <button
                  onClick={() => copyDeck(deck)}
                  disabled={copying === deck.id}
                  className="text-xs font-bold uppercase tracking-[1px] border border-foret text-foret px-4 py-2 rounded-[18px] hover:bg-foret hover:text-ivoire transition-all disabled:opacity-40"
                >
                  {copying === deck.id ? 'Copie…' : 'Copier dans mes decks'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
