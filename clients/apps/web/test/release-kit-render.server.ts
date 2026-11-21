import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import sharp from 'sharp'
import { kitRenderRequestSchema } from '../lib/releases/kit-render-schema'
import { renderKitSnapshot } from '../lib/releases/kit-render'
import { watermarkKitPreview } from '../lib/releases/kit-preview'

const request = (document: unknown) =>
  kitRenderRequestSchema.parse({
    organizationId: 'org',
    artifactId: 'artifact',
    snapshot: {
      kind: 'DRAFT',
      sourceId: 'draft',
      revision: '2',
      document: JSON.stringify(document),
      markdown: '',
      outputId: '',
      assets: [],
    },
    assets: {},
    assetPaths: {},
  })

test('frozen Write output preserves qualifiers, marks, tables, links and post separation', async () => {
  const input = request([
    { type: 'post_break', children: [{ text: '' }] },
    {
      id: 'fact',
      type: 'p',
      children: [
        { text: 'Available to paid plans only.', bold: true },
        { type: 'a', url: 'https://example.com/help', children: [{ text: ' Learn more.' }] },
      ],
    },
    {
      type: 'table',
      children: [
        {
          type: 'tr',
          children: [{ type: 'th', children: [{ type: 'p', children: [{ text: 'Limit' }] }] }],
        },
        {
          type: 'tr',
          children: [{ type: 'td', children: [{ type: 'p', children: [{ text: 'Five seats' }] }] }],
        },
      ],
    },
    { type: 'post_break', children: [{ text: '' }] },
    { type: 'p', children: [{ text: 'Second post.' }] },
  ])
  const output = await renderKitSnapshot(input)
  const markdown = Buffer.from(output.body, 'base64').toString()
  assert.match(markdown, /\*\*Available to paid plans only\.\*\*/)
  assert.match(markdown, /https:\/\/example.com\/help/)
  assert.match(markdown, /\| Limit\s+\|/)
  assert.match(markdown, /Five seats/)
  assert.match(markdown, /---|\*\*\*/)
  assert.match(markdown, /Second post/)
  assert.deepEqual(await renderKitSnapshot(input), output)
})

test('draft images require exact pinned bytes and a same-audience bundle file', async () => {
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
    .png()
    .toBuffer()
  const input = request([
    { id: 'picture', type: 'img', url: 'asset:image', children: [{ text: '' }] },
  ])
  input.snapshot.assets = [
    {
      id: 'image',
      objectKey: 'owned',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      byteLength: bytes.length,
      mediaType: 'image/png',
    },
  ]
  input.assets.image = `data:image/png;base64,${bytes.toString('base64')}`
  await assert.rejects(renderKitSnapshot(input), /Include each draft image/)
  input.assetPaths.image = 'sales/screenshot-image.png'
  const output = await renderKitSnapshot(input)
  assert.match(Buffer.from(output.body, 'base64').toString(), /screenshot-image\.png/)
  input.assets.image = `data:image/png;base64,${Buffer.from('changed').toString('base64')}`
  await assert.rejects(renderKitSnapshot(input), /pinned asset changed/)
})

test('draft preview is visibly watermarked without changing retained output bytes', async () => {
  const markdown = Buffer.from('Retained approved text')
  const text = await watermarkKitPreview({
    body: markdown.toString('base64'),
    mediaType: 'text/markdown; charset=utf-8',
  })
  assert.ok(text.content.startsWith(text.watermark))
  const image = await sharp({
    create: { width: 800, height: 400, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer()
  const preview = await watermarkKitPreview({
    body: image.toString('base64'),
    mediaType: 'image/png',
  })
  const output = Buffer.from(preview.content.split(',')[1], 'base64')
  assert.notDeepEqual(output, image)
  assert.equal((await sharp(output).metadata()).width, 800)
  assert.equal(preview.watermark, 'PREVIEW — NOT APPROVED FOR DISTRIBUTION')
})
