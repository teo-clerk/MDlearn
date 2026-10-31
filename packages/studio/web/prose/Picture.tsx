// Pictures in a document or lesson. They come from the folder or from the web (no referrer is sent); one that
// cannot be loaded leaves its description and a link. Any picture in the reading column opens larger.
import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'

const fromWeb = (src: string) => /^https:/i.test(src)

export function Picture({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (!failed) return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" tabIndex={0} onError={() => setFailed(true)} />
  return (
    <span className="picture-failed">
      {alt || t('A picture')}
      {fromWeb(src) && <> · <a href={src} target="_blank" rel="noopener noreferrer">{t('Open the picture')}</a></>}
    </span>
  )
}

/** The same for a picture in raw HTML, whose DOM React does not manage. */
export function replaceFailedPicture(img: HTMLImageElement): void {
  const note = document.createElement('span')
  note.className = 'picture-failed'
  note.textContent = img.alt || t('A picture')
  if (fromWeb(img.src)) {
    const link = Object.assign(document.createElement('a'), { href: img.src, target: '_blank', rel: 'noopener noreferrer', textContent: t('Open the picture') })
    note.append(' · ', link)
  }
  img.replaceWith(note)
}

export function PictureZoom() {
  const [picture, setPicture] = useState<{ src: string; alt: string } | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const open = (e: Event) => {
      const img = e.target
      if (!(img instanceof HTMLImageElement) || !img.closest('.read') || img.closest('a')) return
      if (e instanceof KeyboardEvent && e.key !== 'Enter') return
      e.preventDefault()
      setPicture({ src: img.currentSrc || img.src, alt: img.alt })
    }
    document.addEventListener('click', open)
    document.addEventListener('keydown', open)
    return () => { document.removeEventListener('click', open); document.removeEventListener('keydown', open) }
  }, [])
  useEffect(() => { if (picture) dialog.current?.showModal() }, [picture])
  if (!picture) return null
  return (
    <dialog ref={dialog} className="picture-zoom" aria-label={picture.alt || t('A picture')} onClose={() => setPicture(null)} onClick={() => dialog.current?.close()}>
      <img src={picture.src} alt={picture.alt} referrerPolicy="no-referrer" />
      {picture.alt && <p>{picture.alt}</p>}
    </dialog>
  )
}
