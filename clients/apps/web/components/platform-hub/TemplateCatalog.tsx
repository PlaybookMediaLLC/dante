'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { CategoryIcon, CloseIcon } from '@/components/platform-shell/icons'
import { Stage } from '@/components/platform-landing/primitives'
import { SidebarLink } from '@/components/platform-shell/SidebarLink'
import { useNearViewport } from '@/components/design/DocumentPreview'
import { ImageTemplatePreview } from '@/components/templates/ImageTemplateGallery'
import { AnimatedTemplatePreview } from '@/components/templates/AnimatedTemplateGallery'
import { RecipePreview } from '@/components/canvas-workspace/RecipePreview'
import { StoreTemplatePreview } from '@/components/store-screenshots/StoreTemplatePreview'
import { WorkflowTemplatePreview } from '@/components/workflows/WorkflowTemplatePreview'
import { DesignTemplatePreview } from '@/components/design/DesignTemplatePreview'
import { designTemplates } from '@/lib/design/templates'
import { IMAGE_TEMPLATES } from '@/lib/templates/image-templates'
import { ANIMATED_TEMPLATES } from '@/lib/animation/templates'
import { CANVAS_RECIPES, canvasRecipeSchema } from '@/lib/canvas/recipes'
import { STORE_SCREENSHOTS } from '@/lib/platform/navigation'
import { BUILT_IN_TEMPLATES, type StoreTemplate } from '@/lib/store-screenshots/templates'
import { listSavedTemplates } from '@/lib/store-screenshots/persistence/library'
import { WORKFLOW_TEMPLATES } from '@/lib/workflows/templates'

const CATEGORIES = [
  'Screenshots',
  'Animated',
  'Layouts & presets',
  'Canvas',
  'Store screenshots',
  'Workflows',
] as const

function PreviewCard({
  name,
  description,
  href,
  action,
  text = false,
  children,
}: {
  name: string
  description: string
  href: string
  action: string
  /** The preview is words, not a picture: the tile grows to fit them. */
  text?: boolean
  children: ReactNode
}) {
  const [ref, near] = useNearViewport<HTMLDivElement>()
  return (
    <li className={text ? 'create-tile is-text' : 'create-tile'}>
      <div ref={ref} role="img" aria-label={`Preview of ${name}`} className="create-tile-media">
        {near ? (
          <div aria-hidden="true">{children}</div>
        ) : (
          <span className="text-xs text-foreground/40">Preview loads as you scroll</span>
        )}
      </div>
      <div className="create-tile-label">
        <h3 className="truncate">{name}</h3>
        <p>{description}</p>
      </div>
      <SidebarLink
        aria-label={`${action}: ${name}`}
        href={href}
        title={description}
        className="create-tile-link"
      />
    </li>
  )
}

/** A wall of screenshot templates for Create's front page, opening the same editor. */
export function TemplateStrip({ count = 10 }: { count?: number }) {
  return (
    <ul className="create-gallery">
      {IMAGE_TEMPLATES.slice(0, count).map((template) => (
        <PreviewCard
          key={template.preset.id}
          name={template.preset.name}
          description={template.preset.description}
          href={newScreenshotFrom(template.preset.id)}
          action="Use template"
        >
          <ImageTemplatePreview template={template} />
        </PreviewCard>
      ))}
    </ul>
  )
}

const HIDE_HOME_TEMPLATES = 'shots:home-templates-hidden'

/**
 * Home's "Start with a template" row: a few screenshot templates on soft
 * tiles and the way to all of them. The × hides it on this browser.
 */
export function HomeTemplates() {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem(HIDE_HOME_TEMPLATES) === '1') setHidden(true)
    } catch {
      // Storage blocked: the row shows.
    }
  }, [])
  if (hidden) return null
  return (
    <section aria-labelledby="home-templates" className="platform-home">
      <div className="home-eyebrow flex items-center gap-1">
        <h2 id="home-templates">Start with a template</h2>
        <Button
          type="button"
          variant="custom"
          size={null}
          aria-label="Hide templates"
          className="grid size-6 place-items-center rounded-full hover:bg-foreground/[0.06] hover:text-foreground"
          onClick={() => {
            setHidden(true)
            try {
              localStorage.setItem(HIDE_HOME_TEMPLATES, '1')
            } catch {
              // Storage blocked: hidden for this visit only.
            }
          }}
        >
          <CloseIcon className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      <ul className="home-starters">
        {IMAGE_TEMPLATES.slice(0, 4).map((template) => (
          <li key={template.preset.id}>
            <SidebarLink
              href={newScreenshotFrom(template.preset.id)}
              className="home-starter group"
            >
              <span className="home-starter-tile home-template-tile" aria-hidden="true">
                <span className="home-template-preview">
                  <ImageTemplatePreview template={template} />
                </span>
              </span>
              <span className="home-starter-title">{template.preset.name}</span>
              <span className="home-starter-detail">Screenshot template</span>
            </SidebarLink>
          </li>
        ))}
        <li>
          <SidebarLink href="/create?view=templates" className="home-starter group">
            <span className="home-starter-tile home-starter-collage" aria-hidden="true">
              {[0, 1, 2, 3].map((variant) => (
                <Stage key={variant} className="size-full rounded-lg" variant={variant + 2}>
                  {null}
                </Stage>
              ))}
              <span className="home-starter-collage-icon">
                <CategoryIcon size={16} />
              </span>
            </span>
            <span className="home-starter-title">Browse all templates</span>
            <span className="home-starter-detail">Finished looks for your next visual.</span>
          </SidebarLink>
        </li>
      </ul>
    </section>
  )
}

/** A new screenshot that opens with this template applied (ProjectLoader). */
const newScreenshotFrom = (id: string) => `/editor?start=new&template=${encodeURIComponent(id)}`

/** Shared catalog. Screenshot and Canvas templates open applied; the rest open their editor. */
export default function TemplateCatalog() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Screenshots')
  const [saved, setSaved] = useState<StoreTemplate[]>([])
  const [localError, setLocalError] = useState(false)
  useEffect(() => {
    if (category !== 'Store screenshots') return
    let cancelled = false
    listSavedTemplates().then(
      (items) => {
        if (!cancelled) {
          setSaved(items)
          setLocalError(false)
        }
      },
      () => {
        if (!cancelled) setLocalError(true)
      }
    )
    return () => {
      cancelled = true
    }
  }, [category])
  return (
    <section aria-label="Template previews" className="space-y-5">
      <div className="platform-tabs" role="group" aria-label="Template categories">
        {CATEGORIES.map((item) => (
          <Button
            key={item}
            variant="custom"
            size={null}
            aria-current={category === item ? 'page' : undefined}
            aria-pressed={category === item}
            className={
              category === item
                ? 'platform-tab text-foreground'
                : 'platform-tab text-muted-foreground hover:text-foreground'
            }
            onClick={() => setCategory(item)}
            type="button"
          >
            {item}
          </Button>
        ))}
      </div>
      <p className="text-[13px] text-muted-foreground">
        Use template opens a new screenshot or Canvas with that template applied. Animated, store
        and workflow templates are chosen again in their editor. Browsing never changes your saved
        work.
      </p>
      {category === 'Store screenshots' ? (
        <p className="text-sm text-muted-foreground">
          Built-in templates and templates saved on this browser.
        </p>
      ) : null}
      {localError && category === 'Store screenshots' ? (
        <p role="alert" className="text-sm text-destructive">
          Saved templates could not load. Built-in templates are still available. Reopen this
          category to retry.
        </p>
      ) : null}
      <ul key={category} className="create-gallery">
        {category === 'Screenshots'
          ? IMAGE_TEMPLATES.map((template) => (
              <PreviewCard
                key={template.preset.id}
                name={template.preset.name}
                description={template.preset.description}
                href={newScreenshotFrom(template.preset.id)}
                action="Use template"
              >
                <ImageTemplatePreview template={template} />
              </PreviewCard>
            ))
          : null}
        {category === 'Animated'
          ? ANIMATED_TEMPLATES.map((template) => (
              <PreviewCard
                key={template.id}
                name={template.name}
                description={template.description}
                href="/editor?start=new"
                action="Open editor"
              >
                <AnimatedTemplatePreview template={template} active={false} />
              </PreviewCard>
            ))
          : null}
        {category === 'Layouts & presets'
          ? designTemplates
              .filter((template) => template.kind !== 'editor-template')
              .map((template) => (
                <PreviewCard
                  key={template.id}
                  name={template.name}
                  description={template.description}
                  href={newScreenshotFrom(template.id)}
                  action="Use template"
                >
                  <DesignTemplatePreview id={template.id} />
                </PreviewCard>
              ))
          : null}
        {category === 'Canvas'
          ? canvasRecipeSchema.options.map((recipe) => (
              <PreviewCard
                key={recipe}
                name={CANVAS_RECIPES[recipe].name}
                description={CANVAS_RECIPES[recipe].description}
                href={`/canvas/new?start=template&recipe=${recipe}`}
                action="Use template"
              >
                <RecipePreview recipe={recipe} />
              </PreviewCard>
            ))
          : null}
        {category === 'Store screenshots'
          ? [...BUILT_IN_TEMPLATES, ...saved].map((template) => (
              <PreviewCard
                key={template.id}
                name={template.name}
                description={template.description}
                href={STORE_SCREENSHOTS.href}
                action="Open studio"
              >
                <StoreTemplatePreview template={template} />
              </PreviewCard>
            ))
          : null}
        {category === 'Workflows'
          ? WORKFLOW_TEMPLATES.map((template) => (
              <PreviewCard
                key={template.id}
                name={template.name}
                description={template.description}
                href={`/workflows/new?template=${template.id}`}
                action="Use template"
                text
              >
                <WorkflowTemplatePreview template={template} />
              </PreviewCard>
            ))
          : null}
      </ul>
    </section>
  )
}
