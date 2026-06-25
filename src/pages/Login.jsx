import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import OAuthButtons from '../components/OAuthButtons'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) {
      setError('Email ou mot de passe incorrect.')
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ivoire px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display font-semibold text-foret text-center mb-8" style={{ fontSize: '32px' }}>
          FlashEFC
        </h1>
        <div className="bg-ivoire-2 border border-rule rounded-2xl p-6 space-y-4" style={{ boxShadow: '0 12px 28px -16px rgba(28,24,20,0.18)' }}>
          <h2 className="text-sm font-bold uppercase tracking-[1.5px] text-ink-3">Connexion</h2>
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
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-rule" />
            <span className="text-xs font-bold uppercase tracking-[1.5px] text-ink-3">ou</span>
            <div className="flex-1 h-px bg-rule" />
          </div>
          <OAuthButtons />
          <p className="text-sm text-center text-ink-3">
            <Link to="/forgot-password" className="text-laiton hover:text-foret transition-colors font-bold">
              Mot de passe oublié ?
            </Link>
          </p>
          <p className="text-sm text-center text-ink-3">
            Pas de compte ?{' '}
            <Link to="/register" className="text-laiton hover:text-foret transition-colors font-bold">
              Créer un compte
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
