/**
 * The page each Home starter makes, drawn small on its tile the way a
 * document hub shows a template's first sheet: a styled screenshot, a post,
 * a campaign calendar, a release turned into posts, a wall of templates.
 * Decorative; the tile's title names it.
 */
export type StarterKind = 'visual' | 'post' | 'campaign' | 'automate' | 'templates'

function Lines({ widths }: { widths: string[] }) {
  return (
    <span className="grid gap-[5px]">
      {widths.map((width, index) => (
        <span key={index} className="block h-[3px] rounded-full bg-black/10" style={{ width }} />
      ))}
    </span>
  )
}

/** A tiny browser window, the shape every screenshot template frames. */
function Window({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`block overflow-hidden rounded-[5px] shadow-[0_6px_16px_-6px_rgba(0,0,0,0.45)] ${dark ? 'bg-[#141414]' : 'bg-white'}`}
    >
      <span
        className={`flex gap-[3px] px-[6px] py-[5px] ${dark ? 'bg-white/5' : 'bg-black/[0.04]'}`}
      >
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="size-[4px] rounded-full bg-current opacity-25" />
        ))}
      </span>
      <span className="grid gap-[4px] px-[8px] py-[7px]">
        <span
          className={`block h-[5px] w-[70%] rounded-full ${dark ? 'bg-white/80' : 'bg-black/75'}`}
        />
        <span
          className={`block h-[3px] w-[50%] rounded-full ${dark ? 'bg-white/30' : 'bg-black/20'}`}
        />
        <span className="mt-[3px] grid grid-cols-3 gap-[3px]">
          {[0, 1, 2].map((cell) => (
            <span
              key={cell}
              className={`block h-[12px] rounded-[2px] ${dark ? 'bg-white/10' : 'bg-black/[0.06]'}`}
            />
          ))}
        </span>
      </span>
    </span>
  )
}

export function StarterArt({ kind }: { kind: StarterKind }) {
  if (kind === 'templates')
    return (
      <span className="home-art-collage" aria-hidden="true">
        <span className="bg-[linear-gradient(140deg,#ff7a45,#e8452c)] text-white">
          <b>Launch</b>
          <i>day</i>
        </span>
        <span className="bg-[linear-gradient(160deg,#c9b8ff,#7b61ff)] p-[14%]">
          <Window />
        </span>
        <span className="bg-[#1d4d3a] text-[#d7f5c7]">
          <b>SHIPPED</b>
        </span>
        <span className="bg-[linear-gradient(160deg,#fde7c9,#f4b98a)] p-[14%]">
          <Window dark />
        </span>
      </span>
    )
  return (
    <span className="home-starter-sheet" aria-hidden="true">
      {kind === 'visual' ? (
        <>
          <b className="home-art-title">Launch hero</b>
          <span className="home-art-meta">16:9 · Screenshot</span>
          <span className="mt-[8px] block rounded-[6px] bg-[radial-gradient(120%_90%_at_20%_10%,#d9ccff,#8f74ff_55%,#4b33c9)] px-[12%] pt-[10%] pb-[12%]">
            <Window />
          </span>
        </>
      ) : kind === 'post' ? (
        <>
          <b className="home-art-title">New post</b>
          <span className="home-art-meta">Draft · Today</span>
          <span className="mt-[9px] flex items-center gap-[5px]">
            <span className="size-[12px] rounded-full bg-[linear-gradient(135deg,#ffb36b,#ff6b6b)]" />
            <span className="block h-[3px] w-[38%] rounded-full bg-black/25" />
          </span>
          <span className="mt-[7px] block">
            <Lines widths={['96%', '88%', '92%', '54%']} />
          </span>
          <span className="mt-[8px] block h-[26px] rounded-[4px] bg-[linear-gradient(135deg,#e8eefc,#cddcfb)]" />
        </>
      ) : kind === 'campaign' ? (
        <>
          <b className="home-art-title">Spring launch</b>
          <span className="home-art-meta">Campaign · 12 posts</span>
          <span className="mt-[9px] grid grid-cols-7 gap-[3px]">
            {Array.from({ length: 21 }, (_, day) => (
              <span
                key={day}
                className={`block aspect-square rounded-[2px] ${
                  [3, 8, 10, 15].includes(day)
                    ? day === 10
                      ? 'bg-[#ff6b4a]'
                      : 'bg-[#8f74ff]'
                    : 'bg-black/[0.06]'
                }`}
              />
            ))}
          </span>
          <span className="mt-[8px] block">
            <Lines widths={['80%', '58%']} />
          </span>
        </>
      ) : (
        <>
          <b className="home-art-title">When a release ships</b>
          <span className="home-art-meta">Workflow · Automatic</span>
          <span className="mt-[9px] flex items-center gap-[5px]">
            <span className="rounded-full bg-[#1d4d3a] px-[6px] py-[2px] text-[0.4375rem] font-semibold text-[#d7f5c7]">
              v2.4.0
            </span>
            <span className="h-px flex-1 bg-black/15" />
          </span>
          <span className="mt-[7px] grid gap-[4px]">
            {['#8f74ff', '#ff8a5c', '#3fa7ff'].map((color) => (
              <span
                key={color}
                className="flex items-center gap-[5px] rounded-[4px] bg-black/[0.035] px-[5px] py-[4px]"
              >
                <span className="size-[7px] rounded-full" style={{ background: color }} />
                <span className="block h-[3px] flex-1 rounded-full bg-black/15" />
              </span>
            ))}
          </span>
        </>
      )}
    </span>
  )
}
