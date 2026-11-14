import { createContext, useContext, useEffect, useState } from 'react'

// Static stages settle motion parts too, even without an OS preference.
export const StillContext = createContext(false)

/** Whether the viewer asked for reduced motion. A stage shows its still; parts skip their tweens. */
export function useReducedMotion() {
  const still = useContext(StillContext)
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    // The page's own "Pause animations" control sets data-motion="off" on <html>.
    const update = () => setReduced(mq.matches || document.documentElement.dataset.motion === 'off')
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return still || reduced
}
