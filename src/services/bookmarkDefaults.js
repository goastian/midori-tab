import { stableId } from './itemIds.js';

export const DEFAULT_CATEGORIES = ['Personal', 'Travel', 'Web3'];
const LEGACY_DEFAULT_BOOKMARKS = {
  Personal: [
    { title: 'Support Midori', url: 'https://astian.org/community', domain: 'astian.org' },
    { title: 'Amazon', url: 'https://amzn.to/47IiNIO', domain: 'amazon.com' },
    { title: 'AliExpress', url: 'https://s.click.aliexpress.com/e/_Dlf1B1R/', domain: 'aliexpress.com' },
    { title: 'eBay', url: 'https://ebay.us/gW9r3z/', domain: 'ebay.com' },
    { title: 'Temu', url: 'https://temu.to/k/gxr990d7ytg', domain: 'temu.com' },
  ],
  Travel: [
    { title: 'Kayak', url: 'https://www.kayak.com/in?a=kan_318921_594075&lc=en&url=%2Fflights/', domain: 'kayak.com' },
    { title: 'Kayak Hotels', url: 'https://www.kayak.com/in?a=kan_318921_594075&lc=en&url=%2Fhotels', domain: 'kayak.com' },
    { title: 'Kayak Cars', url: 'https://www.kayak.com/in?a=kan_318921_594075&lc=en&url=%2Fcars', domain: 'kayak.com' },
    { title: 'Trip', url: 'https://www.trip.com/?Allianceid=4479273&SID=57814702&trip_sub1=astian&trip_sub3=D20537295', domain: 'trip.com' },
  ],
  Web3: [
    { title: 'MiWallet', url: 'https://midoriwallet.com', domain: 'midoriwallet.com' },
    { title: 'Buy USDC', url: 'https://midoriwallet.com/page/comprar-stablecoins' },
    { title: 'Sell USDC', url: 'https://midoriwallet.com/page/vender-stablecoins' },
  ],
};

export const DEFAULT_BOOKMARKS = Object.fromEntries(DEFAULT_CATEGORIES.map(category => [category, []]));

export function cloneDefaults() {
  return Object.fromEntries(DEFAULT_CATEGORIES.map(category => [category, []]));
}

export function bookmarkCategories(saved = []) {
  return [...new Set([...DEFAULT_CATEGORIES, ...(Array.isArray(saved) ? saved : [])
    .filter(category => typeof category === 'string' && category.trim())])];
}

export function removeLegacyDefaults(items, category) {
  return (Array.isArray(items) ? items : []).filter(item => {
    if (!item || typeof item !== 'object') return false;
    if (item.updatedAt || Number(item.rev || 1) > 1 || item.conflictOf) return true;
    const legacy = Object.entries(LEGACY_DEFAULT_BOOKMARKS).flatMap(([name, list]) =>
      list.map((bookmark, index) => ({ ...bookmark, id: `default-${name}-${index}`, category: name })));
    return !legacy.some(bookmark => bookmark.title === item.title && bookmark.url === item.url
      && (item.id === bookmark.id || ((!item.id || item.id === stableId('b', `${category}|${item.url}`, new Map())) && bookmark.category === category)));
  });
}

export function migrateDefaultBookmarks(raw) {
  return Object.fromEntries(Object.entries(raw || {}).map(([category, items]) => [category, removeLegacyDefaults(items, category)]));
}
