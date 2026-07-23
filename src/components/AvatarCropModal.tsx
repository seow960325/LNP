import { useEffect, useRef, useState } from 'react'

const FRAME_SIZE = 288 // px, the interactive square crop frame
const PREVIEW_SIZE = 96 // px, the circular live-preview
const OUTPUT_SIZE = 512 // px, the exported square image
const MAX_ZOOM = 3

interface Transform {
  scale: number // multiplier on top of the cover-fit base scale
  x: number // translate of the image's top-left corner, in frame px
  y: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

interface AvatarCropModalProps {
  file: File
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}

// Lets the user reposition/zoom a picked photo into a square frame before it
// ever reaches the upload path, so the stored avatar is pre-framed and
// object-cover never crops a head. Hand-rolled with pointer events + canvas
// to avoid pulling in a crop library for one screen.
export function AvatarCropModal({ file, onCancel, onConfirm }: AvatarCropModalProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 })
  const [exporting, setExporting] = useState(false)

  const imgRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  if (!objectUrl) return null

  // baseScale = smallest scale at which the image fully covers the square
  // frame (the "fit" / zoom=1 state).
  const baseScale = naturalSize ? FRAME_SIZE / Math.min(naturalSize.w, naturalSize.h) : 1
  const effectiveScale = baseScale * transform.scale
  const dispW = (naturalSize?.w ?? FRAME_SIZE) * effectiveScale
  const dispH = (naturalSize?.h ?? FRAME_SIZE) * effectiveScale

  function clampPosition(x: number, y: number, w: number, h: number): { x: number; y: number } {
    const minX = FRAME_SIZE - w
    const minY = FRAME_SIZE - h
    return {
      x: clamp(x, minX, 0),
      y: clamp(y, minY, 0),
    }
  }

  function handleImageLoad() {
    const img = imgRef.current
    if (!img) return
    const w = img.naturalWidth
    const h = img.naturalHeight
    setNaturalSize({ w, h })
    const fitScale = FRAME_SIZE / Math.min(w, h)
    const initW = w * fitScale
    const initH = h * fitScale
    setTransform({ scale: 1, x: (FRAME_SIZE - initW) / 2, y: (FRAME_SIZE - initH) / 2 })
  }

  function handlePointerDown(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { startX: event.clientX, startY: event.clientY, origX: transform.x, origY: transform.y }
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!dragRef.current) return
    const dx = event.clientX - dragRef.current.startX
    const dy = event.clientY - dragRef.current.startY
    const next = clampPosition(dragRef.current.origX + dx, dragRef.current.origY + dy, dispW, dispH)
    setTransform((t) => ({ ...t, ...next }))
  }

  function endDrag() {
    dragRef.current = null
  }

  function handleZoomChange(nextScale: number) {
    // Zoom around the frame's center so the focal point stays put instead
    // of jumping toward the top-left corner as the image grows.
    const centerFracX = (FRAME_SIZE / 2 - transform.x) / dispW
    const centerFracY = (FRAME_SIZE / 2 - transform.y) / dispH
    const nextW = (naturalSize?.w ?? FRAME_SIZE) * baseScale * nextScale
    const nextH = (naturalSize?.h ?? FRAME_SIZE) * baseScale * nextScale
    const nextX = FRAME_SIZE / 2 - centerFracX * nextW
    const nextY = FRAME_SIZE / 2 - centerFracY * nextH
    const clamped = clampPosition(nextX, nextY, nextW, nextH)
    setTransform({ scale: nextScale, ...clamped })
  }

  async function handleConfirm() {
    if (!objectUrl || !naturalSize || exporting) return
    setExporting(true)

    // Draw from a fresh decode of the original file in NATURAL pixel space,
    // never from the rendered <img> element — the element's displayed box
    // doesn't correspond to frame-space math, so sampling it drifts from
    // the on-screen preview.
    const source = new Image()
    source.src = objectUrl
    try {
      await source.decode()
    } catch {
      setExporting(false)
      return
    }

    // frame px -> natural px
    const naturalPerFramePx = 1 / effectiveScale
    // Clamp against natural bounds so rounding at max zoom / edges never
    // samples outside the image.
    const sSize = Math.min(FRAME_SIZE * naturalPerFramePx, naturalSize.w, naturalSize.h)
    const sx = clamp(-transform.x * naturalPerFramePx, 0, naturalSize.w - sSize)
    const sy = clamp(-transform.y * naturalPerFramePx, 0, naturalSize.h - sSize)

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setExporting(false)
      return
    }
    ctx.drawImage(source, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

    canvas.toBlob(
      (blob) => {
        setExporting(false)
        if (blob) onConfirm(blob)
      },
      'image/jpeg',
      0.9,
    )
  }

  const previewRatio = PREVIEW_SIZE / FRAME_SIZE

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-modal-title"
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-card-lg animate-fade-in"
      >
        <h2 id="crop-modal-title" className="font-semibold text-lg text-ink">
          Reposition photo
        </h2>

        <div className="flex justify-center">
          <div
            className="relative touch-none overflow-hidden rounded-xl bg-cream select-none"
            style={{ width: FRAME_SIZE, height: FRAME_SIZE }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onPointerCancel={endDrag}
          >
            <img
              ref={imgRef}
              src={objectUrl}
              onLoad={handleImageLoad}
              draggable={false}
              alt=""
              className="absolute max-w-none cursor-grab active:cursor-grabbing"
              style={{ left: transform.x, top: transform.y, width: dispW, height: dispH }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">Zoom</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={transform.scale}
            onChange={(event) => handleZoomChange(Number(event.target.value))}
            className="flex-1 accent-accent"
            aria-label="Zoom"
          />
        </div>

        <div className="flex items-center justify-center gap-3">
          <span className="text-xs text-muted">Preview</span>
          <div
            className="relative overflow-hidden rounded-full shadow-card"
            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
          >
            <img
              src={objectUrl}
              draggable={false}
              alt=""
              className="absolute max-w-none"
              style={{
                left: transform.x * previewRatio,
                top: transform.y * previewRatio,
                width: dispW * previewRatio,
                height: dispH * previewRatio,
              }}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={exporting}
            className="min-h-tap flex-1 rounded-xl border border-line bg-white font-semibold text-sm text-muted hover:bg-cream hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={exporting || !naturalSize}
            className="min-h-tap flex-1 rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
          >
            {exporting ? 'Saving…' : 'Use photo'}
          </button>
        </div>
      </div>
    </div>
  )
}
