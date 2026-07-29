export const MIDORI_SEARCH_BASE_URL = 'https://astiango.com/'

export const MIDORI_SEARCH_CONTEXT = Object.freeze({
  client: 'midoritab',
  omnibar: '1',
  qbc: '1',
})

export function buildMidoriSearchUrl(query) {
  const url = new URL(MIDORI_SEARCH_BASE_URL)

  url.searchParams.set('client', MIDORI_SEARCH_CONTEXT.client)
  url.searchParams.set('omnibar', MIDORI_SEARCH_CONTEXT.omnibar)
  url.searchParams.set('q', String(query ?? '').trim())
  url.searchParams.set('qbc', MIDORI_SEARCH_CONTEXT.qbc)

  return url.toString()
}
