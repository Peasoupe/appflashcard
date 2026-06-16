import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function NotificationBell() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [reads, setReads] = useState(new Set())
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    fetchNotifications()
    fetchReads()

    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        setNotifications(prev => [payload.new, ...prev])
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications' }, (payload) => {
        setNotifications(prev => prev.filter(n => n.id !== payload.old.id))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user.id])

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function fetchNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data || [])
  }

  async function fetchReads() {
    const { data } = await supabase
      .from('notification_reads')
      .select('notification_id')
      .eq('user_id', user.id)
    setReads(new Set((data || []).map(r => r.notification_id)))
  }

  async function markAllRead(notifs) {
    const unread = notifs.filter(n => !reads.has(n.id))
    if (!unread.length) return
    await supabase.from('notification_reads').upsert(
      unread.map(n => ({ user_id: user.id, notification_id: n.id }))
    )
    setReads(prev => new Set([...prev, ...unread.map(n => n.id)]))
  }

  const unreadCount = notifications.filter(n => !reads.has(n.id)).length

  function handleOpen() {
    const next = !open
    setOpen(next)
    if (next) markAllRead(notifications)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="relative text-ivoire/70 hover:text-ivoire transition-colors"
        aria-label="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-seal text-ivoire text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-ivoire-2 border border-rule rounded-2xl z-50 overflow-hidden" style={{ boxShadow: '0 12px 28px -16px rgba(28,24,20,0.18)' }}>
          <div className="px-4 py-3 border-b border-rule">
            <p className="text-xs font-bold uppercase tracking-[1.5px] text-ink-3">Notifications</p>
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-ink-3 text-center py-8">Aucune notification</p>
          ) : (
            <div className="divide-y divide-rule max-h-80 overflow-y-auto">
              {notifications.map(n => (
                <div key={n.id} className={`px-4 py-3 ${reads.has(n.id) ? '' : 'bg-laiton/10'}`}>
                  <p className="text-sm font-bold text-ink">{n.title}</p>
                  {n.body && <p className="text-sm text-ink-3 mt-0.5 whitespace-pre-wrap">{n.body}</p>}
                  <p className="text-xs text-rule mt-1">
                    {new Date(n.created_at).toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
