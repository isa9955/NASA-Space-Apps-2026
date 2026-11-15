'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from './use-prefers-reduced-motion'
import { MARS_BUMP_URL, MARS_GLOBE_TEXTURE_URL } from './textures'
import type { MarsScene } from './mars-scene'
import { MarsFallback } from './mars-fallback'

interface MarsGlobeProps {
  className?: string
  showRegionMarker?: boolean
  /** Sunlight direction in camera space. */
  lightDirection?: [number, number, number]
  degreesPerSecond?: number
  onSettled?: () => void
}

type Status = 'loading' | 'ready' | 'error'

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function MarsGlobeBase({
  className,
  showRegionMarker = false,
  lightDirection = [-0.86, 0.32, 0.5],
  degreesPerSecond = 2,
  onSettled,
}: MarsGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<MarsScene | null>(null)
  const onSettledRef = useRef(onSettled)
  const [status, setStatus] = useState<Status>('loading')
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    onSettledRef.current = onSettled
  }, [onSettled])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    let disposed = false
    let resizeObserver: ResizeObserver | undefined

    const fail = () => {
      if (disposed) return
      setStatus('error')
      onSettledRef.current?.()
    }

    async function init() {
      if (!canvas || !container) return
      if (!supportsWebGL()) return fail()
      try {
        const { createMarsScene } = await import('./mars-scene')
        const scene = await createMarsScene(canvas, {
          textureUrl: MARS_GLOBE_TEXTURE_URL,
          bumpUrl: MARS_BUMP_URL,
          lightDirection,
          startLongitude: 25,
          viewTilt: 22,
          degreesPerSecond,
          marker: showRegionMarker
            ? { latitude: 44, longitude: 25 }
            : undefined,
        })
        if (disposed) {
          scene.dispose()
          return
        }
        sceneRef.current = scene

        const fit = () => {
          const { width, height } = container.getBoundingClientRect()
          scene.resize(width, height)
          scene.render(0)
        }
        fit()
        resizeObserver = new ResizeObserver(fit)
        resizeObserver.observe(container)

        setStatus('ready')
        onSettledRef.current?.()
      } catch {
        fail()
      }
    }

    const onContextLost = (event: Event) => {
      event.preventDefault()
      fail()
    }
    canvas.addEventListener('webglcontextlost', onContextLost)
    init()

    return () => {
      disposed = true
      canvas.removeEventListener('webglcontextlost', onContextLost)
      resizeObserver?.disconnect()
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
    // The scene is configured once per mount; layouts remount the globe per concept.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    const container = containerRef.current
    if (status !== 'ready' || !scene || !container || reducedMotion) return

    let raf = 0
    let last = 0
    let inView = true

    const tick = (now: number) => {
      const delta = last ? Math.min((now - last) / 1000, 0.1) : 0
      last = now
      scene.render(delta)
      raf = requestAnimationFrame(tick)
    }
    const run = () => {
      if (raf || !inView || document.hidden) return
      last = 0
      raf = requestAnimationFrame(tick)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }
    const onVisibility = () => (document.hidden ? stop() : run())

    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      if (inView) run()
      else stop()
    })
    observer.observe(container)
    document.addEventListener('visibilitychange', onVisibility)
    run()

    return () => {
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [status, reducedMotion])

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Rotating three-dimensional globe of Mars, mapped from NASA/JPL imagery"
      className={['editorial-globe', className].filter(Boolean).join(' ')}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="editorial-globe-canvas"
        style={{ opacity: status === 'ready' ? 1 : 0 }}
      />
      {status !== 'ready' && <MarsFallback />}
    </div>
  )
}

export const MarsGlobe = memo(MarsGlobeBase)
