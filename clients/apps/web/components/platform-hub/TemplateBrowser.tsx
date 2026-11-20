'use client'

import dynamic from 'next/dynamic'

const TemplateCatalog = dynamic(() => import('./TemplateCatalog'), {
  loading: () => (
    <p role="status" className="text-sm text-muted-foreground">
      Loading template previews…
    </p>
  ),
})

export function TemplateBrowser() {
  return <TemplateCatalog />
}

const TemplateStripLazy = dynamic(
  () => import('./TemplateCatalog').then((catalog) => catalog.TemplateStrip),
  { loading: () => <div className="create-gallery min-h-80" aria-hidden="true" /> }
)

/** A wall of templates to start from, loaded with the catalog's previews. */
export function TemplateHighlights() {
  return <TemplateStripLazy />
}
