import { useEffect, useRef, useState } from 'react'
import { Headset, SendHorizonal } from 'lucide-react'
import { useStore } from '../lib/store'
import { useT } from '../lib/hooks'
import { tg, haptic } from '../lib/telegram'
import {
  supportSend, supportHistory, adminSupportList, adminSupportThread, adminSupportReply,
  type SupportMessage
} from '../lib/billing'
import { Btn } from '../components/ui'

/**
 * Support chat: users write to the owner (admin), the owner replies from the
 * same page (admin sees an inbox of threads). Messages live on the server.
 */
export default function SupportPage() {
  const t2 = useT()
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [role, setRole] = useState<'user' | 'admin'>('user')
  // admin inbox
  const [threads, setThreads] = useState<{ userId: string; username: string | null; unread: number; last: SupportMessage | null }[]>([])
  const [openThread, setOpenThread] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const initData = tg?.initData || ''

  async function loadThread(userId?: string) {
    if (role === 'admin' && userId) {
      const res = await adminSupportThread(initData, userId)
      if (!('error' in res)) setMessages(res.messages || [])
    } else {
      const res = await supportHistory(initData)
      if (!('error' in res)) setMessages(res.messages || [])
    }
  }

  async function loadInbox() {
    const res = await adminSupportList(initData)
    if (!('error' in res)) setThreads(res.threads || [])
  }

  useEffect(() => {
    document.title = 'Tempo — Support'
    // detect role: admins get an inbox, regular users get their own thread
    async function init() {
      // admin inbox works only for admins; a non-admin gets an error -> user mode
      const res = await adminSupportList(initData)
      if (!('error' in res) && Array.isArray(res.threads)) {
        setRole('admin')
        setThreads(res.threads || [])
      } else {
        setRole('user')
        loadThread()
      }
    }
    if (initData) init()
    const id = setInterval(() => {
      if (role === 'admin') { if (!openThread) loadInbox(); else loadThread(openThread) }
      else loadThread()
    }, 12000)
    return () => { clearInterval(id); document.title = 'Tempo — AI Life OS' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const value = text.trim()
    if (!value || sending) return
    setSending(true)
    haptic('medium')
    if (role === 'admin' && openThread) {
      const res = await adminSupportReply(initData, openThread, value)
      if (!('error' in res)) { setText(''); loadThread(openThread); loadInbox() }
    } else {
      const res = await supportSend(initData, value)
      if (!('error' in res)) { setText(''); loadThread() }
    }
    setSending(false)
  }

  return (
    <div className="mx-auto flex h-full max-w-[640px] flex-col md:max-w-none">
      {/* header */}
      <div className="mb-3 flex items-center gap-3">
        <div className="glass-sm flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
          <Headset size={20} className="text-acc" />
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight">{t2('support.title')}</h1>
          <p className="text-[13px] text-t2">{t2(role === 'admin' ? 'support.adminSub' : 'support.subtitle')}</p>
        </div>
      </div>

      {/* admin inbox */}
      {role === 'admin' && !openThread && (
        <div className="flex flex-col gap-2">
          {threads.length === 0 && <p className="px-1 text-[13px] text-t3">{t2('support.empty')}</p>}
          {threads.map((th) => (
            <button
              key={th.userId}
              className="glass-sm press flex items-center justify-between p-3.5 text-left"
              onClick={() => { setOpenThread(th.userId); haptic('select'); loadThread(th.userId) }}
            >
              <div className="min-w-0">
                <div className="text-[14px] font-bold">
                  {th.username || th.userId.slice(0, 12)}
                  {th.unread > 0 && (
                    <span className="ml-2 rounded-full bg-acc px-1.5 py-0.5 text-[10px] font-bold text-white">{th.unread}</span>
                  )}
                </div>
                <div className="truncate text-[12px] text-t3">{th.last?.text || ''}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* chat thread */}
      {(role === 'user' || openThread) && (
        <div className="glass flex min-h-[240px] flex-1 flex-col p-3">
          <div className="flex-1 space-y-2 overflow-y-auto pb-2" style={{ maxHeight: '46vh' }}>
            {messages.length === 0 && (
              <p className="px-1 py-6 text-center text-[13px] text-t3">{t2('support.hello')}</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug ${
                  m.from === 'user' ? 'bg-acc/20 text-t1' : 'bg-soft text-t2'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              className="inp flex-1"
              placeholder={t2('support.placeholder')}
              value={text}
              maxLength={1000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send() }}
            />
            <Btn className="!h-10 !w-10 !p-0" variant="primary" disabled={sending || !text.trim()} onClick={send} aria-label={t2('support.send')}>
              <SendHorizonal size={17} />
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}
