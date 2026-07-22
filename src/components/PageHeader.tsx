import { useEffect, useState, type ReactNode } from 'react'
import { BackButton } from './BackButton'

// Sticky page header parked below the global AppHeader (~49px logo bar).
// Shrinks noticeably on scroll (2xl -> base) so it stops eating vertical
// space, while the back control stays put. Scroll is captured on window
// AND in capture phase, so it still fires if a page scrolls a nested box.
export function PageHeader({
  title,
  parentOverride,
  children,
}: {
  title: string
  // Only needed by pages whose real parent depends on fetched data (e.g.
  // StaffMemberDetailPage, StudentDetailPage) — everyone else is resolved
  // automatically from the route table in lib/up.ts.
  parentOverride?: string | null
  children?: ReactNode
}) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    function onScroll(e?: Event) {
      const target = e?.target
      const y =
        target instanceof HTMLElement ? target.scrollTop : window.scrollY
      setScrolled(y > 8)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () =>
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions)
  }, [])
  return (
    <div
      className={`sticky top-[49px] z-10 -mx-6 flex items-center gap-2 border-b bg-cream/95 px-6 backdrop-blur transition-all duration-200 ${
        scrolled
          ? 'border-accent-soft/50 py-1.5 shadow-sm'
          : 'border-transparent py-3'
      }`}
    >
      <BackButton parentOverride={parentOverride} />
      <h1
        className={`font-bold text-ink transition-all duration-200 ${
          scrolled ? 'text-base' : 'text-2xl'
        }`}
      >
        {title}
      </h1>
      {children ? (
        <div className="ml-auto flex items-center gap-2">{children}</div>
      ) : null}
    </div>
  )
}
