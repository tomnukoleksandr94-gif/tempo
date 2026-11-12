import { useMemo, useState } from 'react'
import { Plus, Flame, Trash2, Sparkles, Camera } from 'lucide-react'
import { SectionHeader, Sheet, Btn, Field, IconBtn, EmptyState, useToast, Segmented } from '../components/ui'
import { Ring, MacroBar, Bars } from '../components/charts'
import { CaptureFlow, type CaptureRequest } from '../components/CaptureFlow'
import { useStore, mealsKcal, mealsMacros } from '../lib/store'
import { useT } from '../lib/hooks'
import { todayISO, addDays, parseAmount, imageToB64 } from '../lib/utils'
import type { FoodItem, MealType } from '../lib/types'
import { haptic } from '../lib/telegram'

export default function Nutrition() {
  const t2 = useT()
  const toast = useToast()
  const meals = useStore((s) => s.meals)
  const foods = useStore((s) => s.foods)
  const addMeal = useStore((s) => s.addMeal)
  const deleteMeal = useStore((s) => s.deleteMeal)
  const addFood = useStore((s) => s.addFood)
  const deleteFood = useStore((s) => s.deleteFood)
  const settings = useStore((s) => s.settings)
  const target = settings.kcalTarget
  const today = todayISO()

  const todayMeals = useMemo(() => meals.filter((m) => m.date === today).sort((a, b) => a.createdAt - b.createdAt), [meals, today])
  const kcal = mealsKcal(todayMeals)
  const macros = mealsMacros(todayMeals)

  const week = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const iso = addDays(today, i - 6)
      const dayMeals = meals.filter((m) => m.date === iso)
      return {
        label: new Date(iso).toLocaleDateString(settings.locale === 'ru' ? 'ru-RU' : 'en-GB', { weekday: 'short' }),
        value: mealsKcal(dayMeals)
      }
    })
  }, [meals, today, settings.locale])

  // ----- AI meal capture -----
  const [req, setReq] = useState<CaptureRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [mealText, setMealText] = useState('')
  const [foodForm, setFoodForm] = useState<null | { name: string; kcal: string; p: string; c: string; f: string }>(null)

  const estimate = (text?: string) => {
    if (!text?.trim()) return
    setBusy(true)
    setReq({ id: Date.now(), text })
    setMealText('')
  }

  // ----- manual meal -----
  const [manual, setManual] = useState<null | { mealType: MealType; items: FoodItem[]; item: FoodItem }>(null)
  const blankItem = (): FoodItem => ({ name: '', kcal: 0, p: 0, c: 0, f: 0 })

  return (
    <div className="mx-auto max-w-[640px] md:max-w-none">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-extrabold">{t2('nut.title')}</h1>
        <IconBtn label="add meal" onClick={() => setManual({ mealType: 'lunch', items: [], item: blankItem() })}>
          <Plus size={18} />
        </IconBtn>
      </div>

      {/* today summary */}
      <div className="glass flex items-center gap-5 p-4">
        <Ring value={kcal / target} size={100} stroke={10} color={kcal > target ? '#FF9F0A' : '#8E7BEF'}>
          <span className="tabular text-[18px] font-bold leading-none">{kcal}</span>
          <span className="text-[10px] font-medium text-t3">{t2('nut.target')} {target}</span>
        </Ring>
        <div className="min-w-0 flex-1 space-y-2.5">
          <MacroBar label={t2('nut.protein')} value={macros.p} target={Math.round((target * 0.3) / 4)} color="#30D158" />
          <MacroBar label={t2('nut.carbs')} value={macros.c} target={Math.round((target * 0.4) / 4)} color="#FF9F0A" />
          <MacroBar label={t2('nut.fat')} value={macros.f} target={Math.round((target * 0.3) / 9)} color="#64D2FF" />
        </div>
      </div>

      {/* AI estimate */}
      <SectionHeader title={t2('nut.addMeal')} />
      <div className="glass flex flex-col gap-2.5 p-4">
        <textarea
          className="inp min-h-[72px] resize-none"
          placeholder={t2('nut.whatAtePh')}
          value={mealText}
          onChange={(e) => setMealText(e.target.value)}
          maxLength={400}
        />
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={() => estimate(mealText)} disabled={!mealText.trim() || busy}>
            <Sparkles size={15} />
            {t2('nut.estimate')}
          </Btn>
          <Btn variant="ghost" onClick={() => setManual({ mealType: 'lunch', items: [], item: blankItem() })}>
            {t2('nut.manualAdd')}
          </Btn>
        </div>
        <p className="text-[11px] text-t3">{t2('nut.estimatedNote')}</p>
      </div>

      {/* meals today */}
      <SectionHeader title={`${t2('nut.meals')} · ${t2('c.today')}`} />
      <div className="glass divide-y divide-white/6 overflow-hidden">
        {todayMeals.length === 0 && (
          <EmptyState
            icon={<Flame size={30} />}
            title={t2('nut.noMeals')}
            action={<Btn size="sm" variant="soft" onClick={() => estimate('съел тарелку риса с курицей и выпил кофе')}>{t2('ai.ex4')}</Btn>}
          />
        )}
        {todayMeals.map((m) => {
          const mk = m.items.reduce((a, i) => a + i.kcal, 0)
          return (
            <div key={m.id} className="group flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-acc2">{t2(`meal.${m.mealType}`)}</span>
                  {m.source === 'ai' && (
                    <span className="rounded-full bg-white/6 px-1.5 py-0.5 text-[9px] font-bold text-t3">AI ≈</span>
                  )}
                </div>
                <div className="clamp1 mt-0.5 text-sm font-semibold">{m.title}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {m.items
                    .filter((it) => it.name.trim().toLowerCase() !== m.title.trim().toLowerCase() || m.items.length > 1)
                    .slice(0, 4)
                    .map((it, i) => (
                      <span key={i} className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-t2">
                        {it.name} · ≈{Math.round(it.kcal)}
                      </span>
                    ))}
                </div>
                <div className="tabular mt-1.5 text-[12px] font-bold">
                  ≈{Math.round(mk)} kcal · P {Math.round(m.items.reduce((a, i) => a + i.p, 0))} / C {Math.round(m.items.reduce((a, i) => a + i.c, 0))} / F {Math.round(m.items.reduce((a, i) => a + i.f, 0))}
                </div>
              </div>
              <button
                onClick={() => {
                  haptic('light')
                  deleteMeal(m.id)
                }}
                aria-label="delete meal"
                className="press shrink-0 rounded-full p-2 text-t3 opacity-0 transition-opacity hover:text-red group-hover:opacity-100"
              >
                <Trash2 size={15} />
              </button>
            </div>
          )
        })}
      </div>

      {/* week chart */}
      <SectionHeader title={t2('nut.weekKcal')} />
      <div className="glass p-4">
        <Bars data={week} height={110} color="#30D158" highlightLast formatValue={(v) => `${v} kcal`} />
      </div>

      {/* custom foods */}
      <SectionHeader title={t2('nut.customFoods')} />
      <div className="glass divide-y divide-white/6 overflow-hidden">
        {foods.length === 0 && (
          <EmptyState
            title={t2('nut.customFoods')}
            action={
              <Btn size="sm" variant="ghost" onClick={() => setFoodForm({ name: '', kcal: '', p: '', c: '', f: '' })}>
                {t2('c.add')}
              </Btn>
            }
          />
        )}
        {foods.map((f) => (
          <div key={f.id} className="group flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => {
                haptic('success')
                addMeal({ title: f.name, mealType: 'snack', items: [f], date: today, source: 'manual' })
                toast(t2('cap.applied'), 'ok')
              }}
              className="min-w-0 flex-1 text-left"
            >
              <div className="clamp1 text-sm font-semibold">{f.name}</div>
              <div className="tabular mt-0.5 text-[12px] text-t2">
                ≈{f.kcal} kcal · P {f.p} / C {f.c} / F {f.f}
              </div>
            </button>
            <button
              onClick={() => deleteFood(f.id)}
              aria-label="delete food"
              className="press shrink-0 rounded-full p-2 text-t3 opacity-0 hover:text-red group-hover:opacity-100"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      {/* manual meal sheet */}
      <Sheet
        open={!!manual}
        onClose={() => setManual(null)}
        title={t2('nut.manualAdd')}
        footer={
          <Btn
            className="w-full"
            onClick={() => {
              if (!manual) return
              const items = [...manual.items, manual.item].filter((i) => i.name.trim() && i.kcal > 0)
              if (!items.length) {
                toast(t2('nut.itemName'), 'err')
                return
              }
              addMeal({
                title: items.map((i) => i.name).join(', ').slice(0, 80),
                mealType: manual.mealType,
                items,
                date: today,
                source: 'manual'
              })
              haptic('success')
              toast(t2('cap.applied'), 'ok')
              setManual(null)
            }}
          >
            {t2('c.save')}
          </Btn>
        }
      >
        {manual && (
          <div className="flex flex-col gap-3.5">
            <Segmented
              value={manual.mealType}
              onChange={(v) => setManual({ ...manual, mealType: v })}
              options={(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((m) => ({ id: m, label: t2(`meal.${m}`) }))}
            />
            {manual.items.map((it, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-white/4 px-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{it.name}</span>
                <span className="tabular shrink-0 font-semibold text-t2">≈{it.kcal} kcal</span>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label={t2('nut.itemName')}>
                  <input
                    className="inp"
                    value={manual.item.name}
                    onChange={(e) => setManual({ ...manual, item: { ...manual.item, name: e.target.value } })}
                  />
                </Field>
              </div>
              <Field label="kcal">
                <input
                  className="inp tabular"
                  inputMode="numeric"
                  value={manual.item.kcal || ''}
                  onChange={(e) => setManual({ ...manual, item: { ...manual.item, kcal: Number(e.target.value) || 0 } })}
                />
              </Field>
              <Field label="P (г)">
                <input
                  className="inp tabular"
                  inputMode="numeric"
                  value={manual.item.p || ''}
                  onChange={(e) => setManual({ ...manual, item: { ...manual.item, p: Number(e.target.value) || 0 } })}
                />
              </Field>
              <Field label="C (г)">
                <input
                  className="inp tabular"
                  inputMode="numeric"
                  value={manual.item.c || ''}
                  onChange={(e) => setManual({ ...manual, item: { ...manual.item, c: Number(e.target.value) || 0 } })}
                />
              </Field>
              <Field label="F (г)">
                <input
                  className="inp tabular"
                  inputMode="numeric"
                  value={manual.item.f || ''}
                  onChange={(e) => setManual({ ...manual, item: { ...manual.item, f: Number(e.target.value) || 0 } })}
                />
              </Field>
            </div>
            <Btn
              variant="ghost"
              onClick={() => {
                if (!manual.item.name.trim() || manual.item.kcal <= 0) return
                setManual({ ...manual, items: [...manual.items, manual.item], item: blankItem() })
              }}
            >
              <Plus size={15} /> {t2('c.add')}
            </Btn>
          </div>
        )}
      </Sheet>

      <CaptureFlow
        request={req}
        onFinish={(r) => {
          setBusy(false)
          setReq(null)
          if (r.ok && !r.applied.length && r.reply) toast(r.reply, 'info')
        }}
      />

      {/* custom food form */}
      <Sheet
        open={!!foodForm}
        onClose={() => setFoodForm(null)}
        title={t2('nut.customFoods')}
        footer={
          <Btn
            className="w-full"
            onClick={() => {
              if (!foodForm) return
              const kcal = parseAmount(foodForm.kcal)
              if (!foodForm.name.trim() || kcal == null) {
                toast(t2('nut.itemName'), 'err')
                return
              }
              addFood({
                name: foodForm.name.trim(),
                kcal: Math.round(kcal),
                p: Math.round(parseAmount(foodForm.p) ?? 0),
                c: Math.round(parseAmount(foodForm.c) ?? 0),
                f: Math.round(parseAmount(foodForm.f) ?? 0)
              })
              toast(t2('c.done'), 'ok')
              setFoodForm(null)
            }}
          >
            {t2('c.save')}
          </Btn>
        }
      >
        {foodForm && (
          <div className="flex flex-col gap-3.5">
            <Field label={t2('nut.itemName')}>
              <input className="inp" autoFocus value={foodForm.name} onChange={(e) => setFoodForm({ ...foodForm, name: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="kcal">
                <input className="inp tabular" inputMode="numeric" value={foodForm.kcal} onChange={(e) => setFoodForm({ ...foodForm, kcal: e.target.value })} />
              </Field>
              <Field label="P (г)">
                <input className="inp tabular" inputMode="numeric" value={foodForm.p} onChange={(e) => setFoodForm({ ...foodForm, p: e.target.value })} />
              </Field>
              <Field label="C (г)">
                <input className="inp tabular" inputMode="numeric" value={foodForm.c} onChange={(e) => setFoodForm({ ...foodForm, c: e.target.value })} />
              </Field>
              <Field label="F (г)">
                <input className="inp tabular" inputMode="numeric" value={foodForm.f} onChange={(e) => setFoodForm({ ...foodForm, f: e.target.value })} />
              </Field>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
