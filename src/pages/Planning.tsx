import { useEffect } from 'react'
import { CalendarDays, SquareCheck, UtensilsCrossed } from 'lucide-react'
import { useStore } from '../lib/store'
import { useT } from '../lib/hooks'
import CalendarPage from './Calendar'
import TasksPage from './Tasks'
import Nutrition from './Nutrition'

export type PlanningTab = 'calendar' | 'tasks' | 'nutrition'

/**
 * Planning hub: calendar, tasks and nutrition live here as sub-tabs,
 * keeping the main navigation to 5 sections.
 */
export default function PlanningPage() {
  const t = useT()
  const sub = useStore((s) => s.planningTab)

  const SUBS: { id: PlanningTab; icon: React.ReactNode; key: string }[] = [
    { id: 'calendar', icon: <CalendarDays size={15} />, key: 'nav.calendar' },
    { id: 'tasks', icon: <SquareCheck size={15} />, key: 'nav.tasks' },
    { id: 'nutrition', icon: <UtensilsCrossed size={15} />, key: 'nav.nutrition' }
  ]

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [sub])

  return (
    <div>
      {/* segmented sub-navigation */}
      <div className="glass-sm mb-4 flex items-center gap-1 p-1">
        {SUBS.map((s) => (
          <button
            key={s.id}
            onClick={() => useStore.getState().setPlanningTab(s.id)}
            className={`press flex flex-1 items-center justify-center gap-1.5 rounded-[11px] py-2 text-[13px] font-semibold transition-colors ${
              sub === s.id ? 'bg-soft3 text-t1' : 'text-t2'
            }`}
          >
            {s.icon}
            {t(s.key)}
          </button>
        ))}
      </div>
      {sub === 'calendar' && <CalendarPage />}
      {sub === 'tasks' && <TasksPage />}
      {sub === 'nutrition' && <Nutrition />}
    </div>
  )
}
