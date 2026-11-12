import {
  UtensilsCrossed, ShoppingBasket, Car, Home, HeartPulse, Clapperboard, Shirt,
  GraduationCap, Gift, Receipt, CircleEllipsis, Banknote, Laptop, TrendingUp
} from 'lucide-react'

export interface CatMeta {
  color: string
  icon: any
}

export const CAT_META: Record<string, CatMeta> = {
  food: { color: '#FF9F0A', icon: UtensilsCrossed },
  groceries: { color: '#30D158', icon: ShoppingBasket },
  transport: { color: '#0A84FF', icon: Car },
  home: { color: '#BF5AF2', icon: Home },
  health: { color: '#FF375F', icon: HeartPulse },
  fun: { color: '#FF2D55', icon: Clapperboard },
  clothes: { color: '#64D2FF', icon: Shirt },
  education: { color: '#5E5CE6', icon: GraduationCap },
  gifts: { color: '#FFD60A', icon: Gift },
  bills: { color: '#FF6B4A', icon: Receipt },
  other: { color: '#8E8E93', icon: CircleEllipsis },
  salary: { color: '#30D158', icon: Banknote },
  freelance: { color: '#64D2FF', icon: Laptop },
  gift: { color: '#FFD60A', icon: Gift },
  invest: { color: '#BF5AF2', icon: TrendingUp }
}

export const EXPENSE_CATS = [
  'food', 'groceries', 'transport', 'home', 'health', 'fun', 'clothes', 'education', 'gifts', 'bills', 'other'
]
export const INCOME_CATS = ['salary', 'freelance', 'gift', 'invest', 'other']

export const DONUT_COLORS = [
  '#8E7BEF', '#30D158', '#FF9F0A', '#0A84FF', '#FF375F', '#64D2FF',
  '#BF5AF2', '#FFD60A', '#5E5CE6', '#FF6B4A', '#8E8E93'
]
