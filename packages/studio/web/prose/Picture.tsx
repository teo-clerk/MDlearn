// Pictures in a document or lesson. Those in the folder just show. One from the web waits until its site is allowed,
// because a document may come from anywhere and a picture's address can carry information out; see webPictures.ts.
// One that cannot be loaded leaves its description and a link. Any picture in the reading column opens larger.
import { useEffect, useRef, useState } from 'react'
import { allowSite, fromWeb, loadWebPicture, siteOf, useAllowedSites } from './webPictures'
import { t } from '../i18n'

function FailedPicture({ src, alt }: { src: string; alt: string }) {
  return (
    <span className="picture-failed">
      {alt || t('A picture')}
      {fromWeb(src) && <> · <a href={src} target="_blank" rel="noopener noreferrer">{t('Open the picture')}</a></>}
    </span>
  )
}

function WebPicture({ src, alt }: { src: string; alt: string }) {
  const site = siteOf(src)
  const allowed = useAllowedSites().includes(site)
  const [shown, setShown] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!allowed) return
    let live = true
    loadWebPicture(src).then((url) => { if (live) setShown(url) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [src, allowed])
  if (failed) return <FailedPicture src={src} alt={alt} />
  if (!allowed) return <span className="picture-held">{alt || t('A picture')} <button type="button" onClick={() => allowSite(site)}>{t('Show pictures from {site}', { site })}</button></span>
  return shown ? <img src={shown} alt={alt} loading="lazy" tabIndex={0} onError={() => setFailed(true)} /> : <span className="picture-held">{alt || t('A picture')}</span>
}

export function Picture({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (fromWeb(src)) return <WebPicture src={src} alt={alt} />
  return failed ? <FailedPicture src={src} alt={alt} /> : <img src={src} alt={alt} loading="lazy" tabIndex={0} onError={() => setFailed(true)} />
}

/** The same for a picture in raw HTML, whose DOM React does not manage. */
export function replaceFailedPicture(img: HTMLImageElement): void {
  const src = img.dataset.webSrc ?? img.src
  const note = document.createElement('span')
  note.className = 'picture-failed'
  note.textContent = img.alt || t('A picture')
  if (fromWeb(src)) {
    const link = Object.assign(document.createElement('a'), { href: src, target: '_blank', rel: 'noopener noreferrer', textContent: t('Open the picture') })
    note.append(' · ', link)
  }
  img.replaceWith(note)
}
/** What stands in for a web picture in raw HTML until its site is allowed. */
export function heldPicture(src: string, alt: string): HTMLElement {
  const site = siteOf(src)
  const held = document.createElement('span')
  held.className = 'picture-held'
  const show = Object.assign(document.createElement('button'), { type: 'button', textContent: t('Show pictures from {site}', { site }) })
  show.addEventListener('click', () => allowSite(site))
  held.append(`${alt || t('A picture')} `, show)
  return held
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
      <img src={picture.src} alt={picture.alt} />
      {picture.alt && <p>{picture.alt}</p>}
    </dialog>
  )
}
