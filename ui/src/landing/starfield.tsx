'use client'

import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from './use-prefers-reduced-motion'

interface Star {
  x: number
  y: number
  radius: number
  alpha: number
  layer: number
  phase: number
  twinkleRate: number
  warm: boolean
}

interface ShootingStar {
  x: number
  y: number
  dx: number
  dy: number
  distance: number
  tail: number
  start: number
  duration: number
}

const LAYERS = [
  { speed: 1.4, depth: 0.15, radius: [0.4, 0.75], alpha: [0.22, 0.5], share: 0.56 },
  { speed: 3.4, depth: 0.4, radius: [0.6, 1.0], alpha: [0.35, 0.7], share: 0.32 },
  { speed: 7.5, depth: 0.9, radius: [0.9, 1.35], alpha: [0.5, 0.9], share: 0.12 },
] as const

const FIRST_SHOOTING_STAR_MS = 6000
const SHOOTING_STAR_INTERVAL_MS: [number, number] = [12000, 20000]
const DRIFT = { x: -1, y: 0.12 }

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function createStars(width: number, height: number): Star[] {
  const total = Math.round(Math.min(420, Math.max(90, (width * height) / 5500)))
  const stars: Star[] = []
  LAYERS.forEach((layer, index) => {
    const count = Math.round(total * layer.share)
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: rand(layer.radius[0], layer.radius[1]),
        alpha: rand(layer.alpha[0], layer.alpha[1]),
        layer: index,
        phase: Math.random() * Math.PI * 2,
        twinkleRate: rand(0.4, 1.1),
        warm: Math.random() < 0.18,
      })
    }
  })
  return stars
}

function createShootingStar(width: number, height: number, now: number): ShootingStar {
  const angle = (rand(18, 34) * Math.PI) / 180
  const leftToRight = Math.random() < 0.5
  return {
    x: rand(width * 0.1, width * 0.75),
    y: rand(height * 0.05, height * 0.45),
    dx: Math.cos(angle) * (leftToRight ? 1 : -1),
    dy: Math.sin(angle),
    distance: rand(0.2, 0.3) * width,
    tail: rand(90, 140),
    start: now,
    duration: rand(1300, 1800),
  }
}

export function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    let width = 0
    let height = 0
    let stars: Star[] = []
    let raf = 0
    let lastTime = 0
    let nextShootingStarAt = FIRST_SHOOTING_STAR_MS
    let shootingStar: ShootingStar | null = null
    let elapsed = 0
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      stars = createStars(width, height)
      draw(0)
    }

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height)

      for (const star of stars) {
        const layer = LAYERS[star.layer]
        const twinkle = reducedMotion
          ? 1
          : 0.78 + 0.22 * Math.sin(time * 0.001 * star.twinkleRate * 2 + star.phase)
        const px = pointer.x * layer.depth * 14
        const py = pointer.y * layer.depth * 14
        context.globalAlpha = star.alpha * twinkle
        context.fillStyle = star.warm ? '#ffe2cf' : '#ece8e1'
        context.beginPath()
        context.arc(star.x + px, star.y + py, star.radius, 0, Math.PI * 2)
        context.fill()
      }
      context.globalAlpha = 1

      if (shootingStar) {
        const progress = (time - shootingStar.start) / shootingStar.duration
        if (progress >= 1) {
          shootingStar = null
        } else {
          const travelled = progress * 0.6 + (1 - (1 - progress) ** 2) * 0.4
          const headX = shootingStar.x + shootingStar.dx * shootingStar.distance * travelled
          const headY = shootingStar.y + shootingStar.dy * shootingStar.distance * travelled
          const tail = shootingStar.tail * (1 - 0.35 * progress)
          const envelope = smoothstep(0, 0.14, progress) * (1 - smoothstep(0.5, 1, progress))
          const tailX = headX - shootingStar.dx * tail
          const tailY = headY - shootingStar.dy * tail

          const gradient = context.createLinearGradient(tailX, tailY, headX, headY)
          gradient.addColorStop(0, 'rgba(236,232,225,0)')
          gradient.addColorStop(1, `rgba(236,232,225,${0.85 * envelope})`)
          context.strokeStyle = gradient
          context.lineWidth = 1.2
          context.lineCap = 'round'
          context.beginPath()
          context.moveTo(tailX, tailY)
          context.lineTo(headX, headY)
          context.stroke()

          context.fillStyle = `rgba(255,248,240,${0.95 * envelope})`
          context.beginPath()
          context.arc(headX, headY, 1.1, 0, Math.PI * 2)
          context.fill()
        }
      }
    }

    const tick = (now: number) => {
      const delta = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 0
      lastTime = now
      elapsed += delta * 1000

      pointer.x += (pointer.targetX - pointer.x) * 0.04
      pointer.y += (pointer.targetY - pointer.y) * 0.04

      for (const star of stars) {
        const speed = LAYERS[star.layer].speed
        star.x += DRIFT.x * speed * delta
        star.y += DRIFT.y * speed * delta
        if (star.x < -2) star.x += width + 4
        if (star.y > height + 2) star.y -= height + 4
      }

      if (!shootingStar && elapsed >= nextShootingStarAt) {
        shootingStar = createShootingStar(width, height, elapsed)
        nextShootingStarAt = elapsed + rand(...SHOOTING_STAR_INTERVAL_MS)
      }

      draw(elapsed)
      raf = requestAnimationFrame(tick)
    }

    const start = () => {
      if (raf || reducedMotion || document.hidden) return
      lastTime = 0
      raf = requestAnimationFrame(tick)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }
    const onVisibility = () => (document.hidden ? stop() : start())
    const onPointer = (event: PointerEvent) => {
      pointer.targetX = (event.clientX / window.innerWidth - 0.5) * 2
      pointer.targetY = (event.clientY / window.innerHeight - 0.5) * 2
    }

    resize()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    if (!reducedMotion) {
      window.addEventListener('pointermove', onPointer, { passive: true })
    }
    start()

    return () => {
      stop()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reducedMotion])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="editorial-stars"
    />
  )
}
