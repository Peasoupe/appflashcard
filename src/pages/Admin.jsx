import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Admin() {
  const { isAdmin, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!isAdmin) { navigate('/'); return }
    fetchNotifications()
  }, [isAdmin, authLoading])

  async function fetchNotifications() {
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
    setNotifications(data || [])
    setLoading(false)
  }

  async function send(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSending(true)
    const { error } = await supabase
      .from('notifications')
      .insert({ title: title.trim(), body: body.trim() || null })
    if (!error) {
      setTitle('')
      setBody('')
      setSent(true)
      setTimeout(() => setSent(false), 2000)
      fetchNotifications()
    }
    setSending(false)
  }

  async function deleteNotification(id) {
    if (!confirm('Supprimer cette notification ?')) return
    await supabase.from('notifications').delete().eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  if (authLoading || !isAdmin) return null

  return (
    <div className="max-w-2xl mx-auto px-4 w-full" style={{ paddingTop: '48px', paddingBottom: '80px' }}>
      <div className="mb-8">
        <h1 className="font-display font-semibold text-foret mb-1" style={{ fontSize: '32px' }}>Administration</h1>
        <p className="text-sm text-ink-3">Envoyer des notifications à tous les utilisateurs</p>
      </div>

      <form onSubmit={send} className="bg-ivoire-2 border border-rule rounded-2xl p-5 mb-8 space-y-4" style={{ boxShadow: '0 12px 28px -16px rgba(28,24,20,0.18)' }}>
        <h2 className="text-xs font-bold uppercase tracking-[1.5px] text-ink-3">Nouvelle notification</h2>
        <div>
          <label className="block text-xs text-ink-3 mb-1">Titre *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: Nouvelles cartes disponibles"
            required
            className="w-full border-b border-rule bg-transparent text-ink text-sm py-1.5 focus:outline-none focus:border-foret transition-colors placeholder:text-ink-3"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-3 mb-1">Message (optionnel)</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Détails supplémentaires…"
            rows={3}
            className="w-full border border-rule rounded-[14px] px-3 py-2 text-sm bg-ivoire focus:outline-none focus:border-foret transition-colors resize-none placeholder:text-ink-3"
          />
        </div>
        <button
          type="submit"
          disabled={sending || !title.trim()}
          className="bg-foret text-ivoire text-sm px-5 py-2.5 rounded-[18px] hover:brightness-90 disabled:opacity-40 transition-all font-bold"
        >
          {sent ? 'Envoyé ✓' : sending ? 'Envoi…' : 'Envoyer à tous'}
        </button>
      </form>

      <div>
        <h2 className="text-xs font-bold uppercase tracking-[1.5px] text-ink-3 mb-4">Notifications envoyées</h2>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-rule border-t-foret rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-ink-3 text-center py-8">Aucune notification envoyée.</p>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => (
              <div key={n.id} className="bg-ivoire-2 border border-rule rounded-2xl p-4 flex gap-3 hover:border-laiton transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-ink">{n.title}</p>
                  {n.body && <p className="text-sm text-ink-3 mt-0.5 whitespace-pre-wrap">{n.body}</p>}
                  <p className="text-xs text-ink-3 mt-1">
                    {new Date(n.created_at).toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <button
                  onClick={() => deleteNotification(n.id)}
                  className="text-ink-3 hover:text-seal transition-colors text-sm flex-shrink-0"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
