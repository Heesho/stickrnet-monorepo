"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"

export interface InteractiveGridPatternProps {
  className?: string
  children?: React.ReactNode
  /** Size of each grid cell in pixels */
  cellSize?: number
  /** Glow color on hover */
  glowColor?: string
  /** Border color of grid lines */
  borderColor?: string
  /** Mouse proximity radius for subtle highlighting */
  proximity?: number
  /** Scale all glow/highlight effects (0–1). Use ~0.1 for extremely subtle. */
  effectIntensity?: number
  /** Opacity of center ambient glow (0 to disable). */
  centerGlowOpacity?: number
  /** Hide the dark edge vignette (e.g. when used as overlay). */
  hideVignette?: boolean
}

interface CellState {
  hovered: boolean
  proximity: number // 0-1 based on distance from mouse
}

export function InteractiveGridPattern({
  className,
  children,
  cellSize = 50,
  glowColor = "rgba(75, 225, 130, 0.4)",
  borderColor = "rgba(63, 63, 70, 0.4)",
  proximity = 100,
  effectIntensity = 1,
  centerGlowOpacity = 0.2,
  hideVignette = false,
}: InteractiveGridPatternProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [grid, setGrid] = useState({ rows: 0, cols: 0, scale: 1 })
  const [hoveredCell, setHoveredCell] = useState<number | null>(null)
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 })

  const updateGrid = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const { width, height } = container.getBoundingClientRect()
    const scale = Math.max(1, Math.min(width, height) / 800)
    const scaledCellSize = cellSize * scale

    const cols = Math.ceil(width / scaledCellSize) + 1
    const rows = Math.ceil(height / scaledCellSize) + 1

    setGrid({ rows, cols, scale })
  }, [cellSize])

  useEffect(() => {
    updateGrid()
    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver(updateGrid)
    ro.observe(container)
    return () => ro.disconnect()
  }, [updateGrid])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  const handleMouseLeave = useCallback(() => {
    setMousePos({ x: -1000, y: -1000 })
    setHoveredCell(null)
  }, [])

  const scaledCellSize = cellSize * grid.scale
  const scaledProximity = proximity * grid.scale

  return (
    <div
      ref={containerRef}
      className={cn("fixed inset-0 overflow-hidden bg-transparent", className)}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Grid */}
      <div className="absolute inset-0">
        {Array.from({ length: grid.rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex">
            {Array.from({ length: grid.cols }).map((_, colIndex) => {
              const index = rowIndex * grid.cols + colIndex
              const cellX = colIndex * scaledCellSize + scaledCellSize / 2
              const cellY = rowIndex * scaledCellSize + scaledCellSize / 2
              const dx = mousePos.x - cellX
              const dy = mousePos.y - cellY
              const distance = Math.sqrt(dx * dx + dy * dy)
              const proximityFactor = Math.max(0, 1 - distance / scaledProximity)
              const isHovered = hoveredCell === index
              const proximityAlpha = proximityFactor * 0.15 * effectIntensity
              const hoverGlow = glowColor.replace(/[\d.]+\)$/, `${0.4 * effectIntensity})`)
              const hoverInsetGlow = glowColor.replace(/[\d.]+\)$/, `${0.2 * effectIntensity})`)

              return (
                <div
                  key={index}
                  className="shrink-0 border transition-all duration-1000 ease-out interactive-grid-cell"
                  style={{
                    width: scaledCellSize,
                    height: scaledCellSize,
                    borderColor: `var(--interactive-grid-border, ${borderColor})`,
                    backgroundColor: isHovered
                      ? hoverGlow
                      : proximityFactor > 0
                        ? glowColor.replace(/[\d.]+\)$/, `${proximityAlpha})`)
                        : "transparent",
                    boxShadow: isHovered
                      ? `0 0 ${12 * grid.scale}px ${hoverGlow}, inset 0 0 ${6 * grid.scale}px ${hoverInsetGlow}`
                      : "none",
                    transitionDuration: isHovered ? "0ms" : "1000ms",
                  }}
                  onMouseEnter={() => setHoveredCell(index)}
                  onMouseLeave={() => setHoveredCell(null)}
                />
              )
            })}
          </div>
        ))}
      </div>

      {/* Center ambient glow (optional, very faint when subtle) */}
      {centerGlowOpacity > 0 && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: "60vmin",
            height: "60vmin",
            opacity: centerGlowOpacity * effectIntensity,
            background: `radial-gradient(circle, ${glowColor.replace(/[\d.]+\)$/, "0.3)")} 0%, transparent 70%)`,
          }}
        />
      )}

      {/* Vignette */}
      {!hideVignette && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at center, transparent 0%, transparent 30%, rgba(10,10,10,0.8) 100%)",
          }}
        />
      )}

      {/* Content layer */}
      {children && (
        <div className="relative z-10 h-full w-full">{children}</div>
      )}
    </div>
  )
}
