import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import OAuthButtons from '../components/OAuthButtons'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const { signUp } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }
    setLoading(true)
    const { error } = await signUp(email, password)
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ivoire px-4">
        <div
          className="w-full max-w-sm bg-ivoire-2 border border-rule rounded-2xl p-6 text-center space-y-3"
          style={{ boxShadow: '0 12px 28px -16px rgba(28,24,20,0.18)' }}
        >
          <p className="font-display text-foret" style={{ fontSize: '24px', fontStyle: 'italic' }}>Confirmez votre email.</p>
          <p className="text-sm text-ink-3">
            Un lien de confirmation a été envoyé à <strong className="text-ink">{email}</strong>.
          </p>
          <Link to="/login" className="block text-sm font-bold text-laiton hover:text-foret transition-colors">
            Retour à la connexion
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
          <h2 className="text-sm font-bold uppercase tracking-[1.5px] text-ink-3">Créer un compte</h2>
          {error && <p className="text-sm text-ivoire bg-seal rounded-xl px-3 py-2">{error}</p>}
          <div>
            <label className="block text-xs font-bold uppercase tracking-[1.5px] text-ink-3 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full border-b border-rule bg-transparent text-ink text-sm py-1.5 focus:outline-none focus:border-foret transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-[1.5px] text-ink-3 mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full border-b border-rule bg-transparent text-ink text-sm py-1.5 focus:outline-none focus:border-foret transition-colors"
            />
          </div>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-foret text-ivoire rounded-[18px] py-3 text-sm font-bold hover:brightness-90 disabled:opacity-40 transition-all"
          >
            {loading ? 'Création…' : 'Créer le compte'}
          </button>
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-rule" />
            <span className="text-xs font-bold uppercase tracking-[1.5px] text-ink-3">ou</span>
            <div className="flex-1 h-px bg-rule" />
          </div>
          <OAuthButtons />
          <p className="text-sm text-center text-ink-3">
            Déjà un compte ?{' '}
            <Link to="/login" className="text-laiton hover:text-foret transition-colors font-bold">
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
