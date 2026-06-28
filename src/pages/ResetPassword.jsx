import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // The PASSWORD_RECOVERY event often fires before this component mounts,
    // so we also check for an existing session immediately.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ivoire px-4">
        <div
          className="w-full max-w-sm bg-ivoire-2 border border-rule rounded-2xl p-6 text-center space-y-3"
          style={{ boxShadow: '0 12px 28px -16px rgba(28,24,20,0.18)' }}
        >
          <p className="text-sm text-ink-3">Vérification du lien en cours…</p>
          <Link to="/forgot-password" className="block text-sm font-bold text-laiton hover:text-foret transition-colors">
            Renvoyer un lien
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ivoire px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display font-semibold text-foret text-center mb-8" style={{ fontSize: '32px' }}>
          FlashEFC
        </h1>
        <div className="bg-ivoire-2 border border-rule rounded-2xl p-6 space-y-4" style={{ boxShadow: '0 12px 28px -16px rgba(28,24,20,0.18)' }}>
          <h2 className="text-sm font-bold uppercase tracking-[1.5px] text-ink-3">Nouveau mot de passe</h2>
          {error && <p className="text-sm text-ivoire bg-seal rounded-xl px-3 py-2">{error}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-[1.5px] text-ink-3 mb-1">Nouveau mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border-b border-rule bg-transparent text-ink text-sm py-1.5 focus:outline-none focus:border-foret transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-[1.5px] text-ink-3 mb-1">Confirmer le mot de passe</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                className="w-full border-b border-rule bg-transparent text-ink text-sm py-1.5 focus:outline-none focus:border-foret transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-foret text-ivoire rounded-[18px] py-3 text-sm font-bold hover:brightness-90 disabled:opacity-40 transition-all"
            >
              {loading ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
