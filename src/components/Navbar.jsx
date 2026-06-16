import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ADMIN_EMAIL } from '../lib/admin'
import NotificationBell from './NotificationBell'

function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 480 480" aria-hidden="true">
      <circle cx="240" cy="240" r="218" fill="none" stroke="#A8895C" stroke-width="14"/>
      <circle cx="240" cy="240" r="194" fill="#FBF6E9"/>
      <g transform="translate(240 240)">
        <path d="M 0 -160 L 22 0 L 0 160 L -22 0 Z" fill="#F1EBD9"/>
        <path d="M -160 0 L 0 -22 L 160 0 L 0 22 Z" fill="#F1EBD9"/>
        <path d="M -100 -100 L -10 -10 L 0 0 Z" fill="#A8895C"/>
        <path d="M 100 -100 L 10 -10 L 0 0 Z" fill="#A8895C"/>
        <path d="M -100 100 L -10 10 L 0 0 Z" fill="#A8895C"/>
        <path d="M 100 100 L 10 10 L 0 0 Z" fill="#A8895C"/>
      </g>
      <circle cx="240" cy="240" r="62" fill="#7A1F2B"/>
      <circle cx="240" cy="240" r="62" fill="none" stroke="#A8895C" stroke-width="3"/>
    </svg>
  )
}

export default function Navbar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const linkClass = (path) => {
    const active = location.pathname === path
    return `text-xs font-bold tracking-[1.5px] uppercase transition-opacity ${
      active
        ? 'text-ivoire opacity-100 border-b-2 border-laiton pb-0.5'
        : 'text-ivoire opacity-70 hover:opacity-100'
    }`
  }

  return (
    <nav className="bg-foret border-b border-laiton/40">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 no-underline">
          <LogoMark size={32} />
          <span
            className="font-display text-ivoire font-semibold leading-none"
            style={{ fontSize: '22px', letterSpacing: '-0.5px' }}
          >
            FlashEFC
          </span>
        </Link>

        {user && (
          <div className="flex items-center gap-5">
            <Link to="/library" className={linkClass('/library')}>
              Bibliothèque
            </Link>
            {user.email === ADMIN_EMAIL && (
              <Link to="/admin" className={linkClass('/admin')}>
                Admin
              </Link>
            )}
            <NotificationBell />
            <span className="text-xs text-ivoire/50 hidden sm:block">{user.email}</span>
            <button
              onClick={handleSignOut}
              className="text-xs font-bold tracking-[1.5px] uppercase text-ivoire opacity-70 hover:opacity-100 transition-opacity"
            >
              Déconnexion
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
