import type { MonthlyPoint } from '../lib/zohoFinance'
import { formatMYR } from '../lib/zohoFinance'

const CHART_HEIGHT = 128 // px

// Hand-rolled (no charting library in this repo) grouped bar chart: two bars
// per month, scaled to the largest single value across the whole FY so
// months stay comparable. Wrapped in its own overflow-x-auto so 12 months
// never force the page itself to scroll horizontally on mobile.
export function RevenueExpenseChart({
  data,
  highlightKey,
}: {
  data: MonthlyPoint[]
  highlightKey?: string | null
}) {
  const max = Math.max(1, ...data.flatMap((point) => [point.revenue, point.expense]))

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-2xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
          Revenue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ink/70" aria-hidden="true" />
          Expense
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[560px] items-end gap-2">
          {data.map((point) => {
            const isHighlighted = highlightKey === point.key
            return (
              <div
                key={point.key}
                className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-1 pb-1 pt-2 transition-colors ${
                  isHighlighted ? 'bg-accent-soft/60' : ''
                }`}
              >
                <div
                  className="flex items-end gap-1"
                  style={{ height: CHART_HEIGHT }}
                  title={`${point.label}: Revenue ${formatMYR(point.revenue)}, Expense ${formatMYR(point.expense)}`}
                >
                  <div
                    className="w-2.5 rounded-t bg-accent"
                    style={{ height: `${Math.max(2, (point.revenue / max) * CHART_HEIGHT)}px` }}
                  />
                  <div
                    className="w-2.5 rounded-t bg-ink/70"
                    style={{ height: `${Math.max(2, (point.expense / max) * CHART_HEIGHT)}px` }}
                  />
                </div>
                <span className={`text-2xs ${isHighlighted ? 'font-semibold text-accent-hover' : 'text-muted'}`}>
                  {point.label.split(' ')[0]}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
