import { useEffect, useState } from 'react'
import {
  LogIn, UserPlus, LogOut, RefreshCw, CloudUpload, CloudDownload,
  ShieldCheck, RefreshCcw, Ban, Crown, Users2, CreditCard
} from 'lucide-react'
import { Btn, useToast } from './ui'
import { useT } from '../lib/hooks'
import { useStore } from '../lib/store'
import {
  getAccount, login, register, logout, uploadData, downloadData,
  adminOverview, adminGrant, adminRevoke,
  type AdminOverview, type AccountInfo
} from '../lib/account'

/**
 * Account section for Profile: register/login, data sync between sites,
 * and (for the owner account) the admin panel with payments overview.
 */

function AccountLogin({ onAccount }: { onAccount: (a: AccountInfo) => void }) {
  const t2 = useT()
  const toast = useToast()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    if (!username.trim() || password.length < 6) {
      toast(t2('acc.formError'), 'err')
      return
    }
    setBusy(true)
    const res = mode === 'login'
      ? await login(username.trim(), password)
      : await register(username.trim(), password)
    setBusy(false)
    if (res.ok && res.account) {
      toast(t2('acc.welcome') + ' ' + res.account.username, 'ok')
      onAccount(res.account)
    } else {
      toast(t2(res.error === 'taken' ? 'acc.taken' : 'acc.invalid'), 'err')
    }
  }

  return (
    <div className="glass p-4">
      <div className="mb-3 flex items-center gap-2 text-[15px] font-bold">
        <LogIn size={16} className="text-acc" />
        {t2('acc.title')}
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-t2">{t2('acc.text')}</p>
      <div className="space-y-2.5">
        <input
          className="inp h-11 w-full"
          placeholder={t2('acc.username')}
          value={username}
          maxLength={30}
          autoComplete="username"
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="inp h-11 w-full"
          type="password"
          placeholder={t2('acc.password')}
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <Btn className="w-full" onClick={submit} disabled={busy}>
          {mode === 'login' ? <LogIn size={15} /> : <UserPlus size={15} />}
          {t2(mode === 'login' ? 'acc.login' : 'acc.register')}
        </Btn>
        <button
          className="press w-full text-center text-[12px] font-semibold text-acc"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {t2(mode === 'login' ? 'acc.toRegister' : 'acc.toLogin')}
        </button>
      </div>
    </div>
  )
}

function AdminPanel() {
  const t2 = useT()
  const toast = useToast()
  const [data, setData] = useState<AdminOverview | null>(null)
  const [busy, setBusy] = useState(false)
  const [grantUser, setGrantUser] = useState('')
  const [grantPlan, setGrantPlan] = useState<'plus' | 'pro'>('plus')
  const [grantPeriod, setGrantPeriod] = useState<'monthly' | 'annual'>('monthly')

  const load = async () => {
    setBusy(true)
    const res = await adminOverview()
    setBusy(false)
    if (res.error) {
      toast(t2('acc.serverOff'), 'err')
    } else if (res.data) {
      setData(res.data)
    }
  }

  useEffect(() => { load() }, [])

  const doGrant = async () => {
    if (!grantUser.trim()) return
    setBusy(true)
    const res = await adminGrant(grantUser.trim(), grantPlan, grantPeriod)
    setBusy(false)
    toast(res.ok ? t2('acc.grantOk') : t2('acc.grantFail'), res.ok ? 'ok' : 'err')
    if (res.ok) { setGrantUser(''); load() }
  }

  return (
    <div className="glass overflow-hidden">
      <div className="flex items-center justify-between border-b bd-soft px-4 py-3">
        <span className="flex items-center gap-2 text-[13px] font-bold text-t2">
          <ShieldCheck size={15} className="text-acc" />
          {t2('admin.title')}
        </span>
        <button className="press text-t3" onClick={load} aria-label="refresh">
          <RefreshCcw size={15} className={busy ? 'animate-spin' : ''} />
        </button>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-2 p-4">
          <div className="rounded-xl bg-soft p-2.5 text-center">
            <Users2 size={14} className="mx-auto mb-1 text-acc" />
            <div className="tabular text-[17px] font-bold">{data.totals.users}</div>
            <div className="text-[10px] text-t3">{t2('admin.users')}</div>
          </div>
          <div className="rounded-xl bg-soft p-2.5 text-center">
            <Crown size={14} className="mx-auto mb-1 text-acc" />
            <div className="tabular text-[17px] font-bold">{data.totals.paying}</div>
            <div className="text-[10px] text-t3">{t2('admin.paying')}</div>
          </div>
          <div className="rounded-xl bg-soft p-2.5 text-center">
            <CreditCard size={14} className="mx-auto mb-1 text-acc" />
            <div className="tabular text-[17px] font-bold">{data.totals.payments}</div>
            <div className="text-[10px] text-t3">{t2('admin.payments')}</div>
          </div>
        </div>
      )}

      {/* grant subscription */}
      <div className="border-t bd-soft p-4">
        <div className="mb-2 text-[12px] font-bold text-t2">{t2('admin.grantTitle')}</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="inp h-9 min-w-0 flex-1"
            placeholder={t2('admin.grantUser')}
            value={grantUser}
            onChange={(e) => setGrantUser(e.target.value)}
          />
          <select className="inp h-9 w-[92px]" value={grantPlan} onChange={(e) => setGrantPlan(e.target.value as 'plus' | 'pro')}>
            <option value="plus">Plus</option>
            <option value="pro">Pro</option>
          </select>
          <select className="inp h-9 w-[110px]" value={grantPeriod} onChange={(e) => setGrantPeriod(e.target.value as 'monthly' | 'annual')}>
            <option value="monthly">{t2('plan.monthly')}</option>
            <option value="annual">{t2('plan.annualBtn')}</option>
          </select>
          <Btn size="sm" onClick={doGrant} disabled={busy}>
            <RefreshCw size={14} /> {t2('admin.grant')}
          </Btn>
        </div>
        <p className="mt-1.5 text-[11px] text-t3">{t2('admin.grantHint')}</p>
      </div>

      {/* users & payments */}
      {data && (
        <div className="border-t bd-soft">
          <div className="px-4 pt-3 text-[12px] font-bold text-t2">{t2('admin.userList')}</div>
          {data.users.map((u, i) => (
            <div key={u.id || i} className={`px-4 py-3 ${i > 0 ? 'border-t bd-soft' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">
                    {u.id}
                    {u.plan !== 'free' && <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-acc2">{u.plan}</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-t3">
                    {t2('admin.referrals')}: {u.referrals.invited}/{u.referrals.paying}
                    {u.expiresAt && u.status === 'active' && ` · ${t2('plan.expires')} ${u.expiresAt.slice(0, 10)}`}
                  </div>
                </div>
                {u.status === 'active' && u.id && (
                  <button
                    className="press flex items-center gap-1 text-[11px] font-semibold text-red"
                    onClick={async () => {
                      setBusy(true)
                      const res = await adminRevoke(u.id!)
                      setBusy(false)
                      toast(res.ok ? t2('c.done') : t2('acc.grantFail'), res.ok ? 'ok' : 'err')
                      if (res.ok) load()
                    }}
                  >
                    <Ban size={12} /> {t2('admin.revoke')}
                  </button>
                )}
              </div>
              {u.history.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {u.history.slice(0, 3).map((h) => (
                    <div key={h.id} className="tabular text-[10px] text-t3">
                      {new Date(h.ts).toLocaleDateString()} · {h.plan} · {h.period === 'annual' ? t2('plan.annualBtn') : t2('plan.monthly')} · {h.stars} ⭐{h.note ? ' · ' + h.note : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {data.users.length === 0 && (
            <div className="px-4 py-4 text-center text-[12px] text-t3">{t2('admin.noUsers')}</div>
          )}
        </div>
      )}
    </div>
  )
}

export function AccountSection() {
  const t2 = useT()
  const toast = useToast()
  const [account, setAccount] = useState<AccountInfo | null>(getAccount())
  const [syncBusy, setSyncBusy] = useState(false)
  const exportJson = useStore((s) => s.exportJson)
  const importJson = useStore((s) => s.importJson)

  if (!account) {
    return <AccountLogin onAccount={setAccount} />
  }

  const doUpload = async () => {
    setSyncBusy(true)
    const res = await uploadData(exportJson())
    setSyncBusy(false)
    toast(res.ok ? t2('acc.uploadOk') : t2('acc.serverOff'), res.ok ? 'ok' : 'err')
  }

  const doDownload = async () => {
    setSyncBusy(true)
    const res = await downloadData()
    setSyncBusy(false)
    if (res.error) {
      toast(t2('acc.serverOff'), 'err')
      return
    }
    if (!res.data) {
      toast(t2('acc.noCloudData'), 'info')
      return
    }
    const ok = importJson(res.data)
    toast(ok ? t2('acc.downloadOk') : t2('err.parse'), ok ? 'ok' : 'err')
  }

  return (
    <div className="space-y-3">
      <div className="glass p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2 text-[15px] font-bold">
            <LogIn size={16} className="text-acc" />
            {account.username}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${account.role === 'admin' ? 'bg-accent-soft text-acc2' : 'bg-soft2 text-t2'}`}>
            {account.role === 'admin' ? 'ADMIN' : t2('acc.user')}
          </span>
        </div>
        <p className="mb-3 text-[12px] leading-relaxed text-t2">{t2('acc.syncText')}</p>
        <div className="flex flex-wrap gap-2">
          <Btn size="sm" variant="ghost" onClick={doUpload} disabled={syncBusy}>
            <CloudUpload size={14} /> {t2('acc.upload')}
          </Btn>
          <Btn size="sm" variant="ghost" onClick={doDownload} disabled={syncBusy}>
            <CloudDownload size={14} /> {t2('acc.download')}
          </Btn>
          <Btn size="sm" variant="danger" onClick={() => { logout(); setAccount(null) }}>
            <LogOut size={14} /> {t2('acc.logout')}
          </Btn>
        </div>
      </div>

      {account.role === 'admin' && <AdminPanel />}
    </div>
  )
}
