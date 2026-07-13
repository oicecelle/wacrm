import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  /** Pre-formatted value for display (e.g. "42" or "$1,250"). */
  value: string
  icon: ComponentType<{ className?: string }>
  /**
   * Delta-mode secondary row: arrow + delta text. Omit when the metric
   * doesn't have a sensible comparison (e.g. total pipeline value).
   */
  delta?: {
    /** Positive / negative / zero drives arrow + color. */
    sign: number
    /** Pre-formatted delta, e.g. "+3 vs yesterday". */
    label: string
  }
  /** Used instead of `delta` when the metric has a static subtitle. */
  subtitle?: string
  /** Color variant for premium status context. */
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
}

export function MetricCard({ title, value, icon: Icon, delta, subtitle, variant = 'default' }: MetricCardProps) {
  const variantStyles = {
    default: {
      card: 'border-border bg-card hover:border-neutral-300',
      iconBg: 'bg-muted text-muted-foreground',
      value: 'text-foreground',
    },
    success: {
      card: 'border-emerald-500/20 bg-emerald-500/[0.02] hover:border-emerald-500/40',
      iconBg: 'bg-emerald-500/10 text-emerald-600',
      value: 'text-emerald-950 dark:text-emerald-200',
    },
    warning: {
      card: 'border-amber-500/20 bg-amber-500/[0.02] hover:border-amber-500/40',
      iconBg: 'bg-amber-500/10 text-amber-600',
      value: 'text-amber-950 dark:text-amber-200',
    },
    error: {
      card: 'border-red-500/20 bg-red-500/[0.02] hover:border-red-500/40',
      iconBg: 'bg-red-500/10 text-red-600',
      value: 'text-red-950 dark:text-red-200',
    },
    info: {
      card: 'border-blue-500/20 bg-blue-500/[0.02] hover:border-blue-500/40',
      iconBg: 'bg-blue-500/10 text-blue-600',
      value: 'text-blue-950 dark:text-blue-200',
    },
  }

  const styles = variantStyles[variant] || variantStyles.default

  return (
    <div className={cn(
      "rounded-2xl border p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md",
      styles.card
    )}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl", styles.iconBg)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className={cn("mt-3 text-2xl leading-none font-extrabold tracking-tight tabular-nums", styles.value)}>
        {value}
      </p>
      {delta ? <DeltaRow sign={delta.sign} label={delta.label} /> : subtitle ? (
        <p className="mt-2 text-xs font-medium text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  )
}

function DeltaRow({ sign, label }: { sign: number; label: string }) {
  const tone =
    sign > 0
      ? 'text-emerald-600'
      : sign < 0
      ? 'text-red-500'
      : 'text-muted-foreground'
  const Arrow = sign > 0 ? ArrowUp : sign < 0 ? ArrowDown : Minus
  return (
    <div className={cn('mt-2.5 flex items-center gap-1 text-xs font-semibold', tone)}>
      <Arrow className="h-3.5 w-3.5" aria-hidden />
      <span className="tabular-nums">{label}</span>
    </div>
  )
}

