import { ArrowForwardIcon as ArrowRight } from '@/components/platform-shell/icons'
import { SidebarLink } from '@/components/platform-shell/SidebarLink'
import { Stage, Window } from '@/components/platform-landing/primitives'
import { PageSpread, type SpreadPage } from '@/components/platform-ui/page-spread'

/**
 * Starting points as a gallery wall: each a tall tile on the landing page's
 * grain stage, showing the pages it makes or a small window naming it, with
 * its name and where it lives on the tile's shade.
 */
export function ResourceCards({
  items,
}: {
  items: {
    title: string
    description: string
    href: string
    scope: string
    /** The pages this starting point makes, drawn as a numbered spread. */
    pages?: SpreadPage[]
    /** Whether the spread shows a slot for another page. */
    add?: boolean
  }[]
}) {
  return (
    <ul className="create-gallery">
      {items.map((item, index) => (
        <li className="create-tile group" key={item.title}>
          <span aria-hidden="true" className="create-tile-media is-stage">
            <Stage className="size-full rounded-none pb-10" variant={index}>
              {item.pages ? (
                <PageSpread add={item.add} pages={item.pages} />
              ) : (
                <Window
                  className="w-[80%]"
                  meta={<ArrowRight size={14} aria-hidden="true" />}
                  title={item.scope.split(' · ')[0]}
                >
                  <span className="block px-4 py-5 text-start">
                    <span className="mt-2 line-clamp-4 block text-xs leading-relaxed text-[#9a9a9a]">
                      {item.description}
                    </span>
                  </span>
                </Window>
              )}
            </Stage>
          </span>
          <span className="create-tile-label">
            <span>{item.title}</span>
            <span>{item.scope}</span>
          </span>
          <SidebarLink
            className="create-tile-link"
            href={item.href}
            aria-label={`${item.title}. ${item.description}`}
            title={item.description}
          />
        </li>
      ))}
    </ul>
  )
}
