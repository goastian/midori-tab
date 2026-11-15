export const DEFAULT_CATEGORIES = ['Personal', 'Travel', 'Web3'];
export const DEFAULT_BOOKMARKS = {
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
    { title: 'Midori Wallet', url: 'https://midoriwallet.com', domain: 'midoriwallet.com' },
    { title: 'Buy USDC', url: 'https://midoriwallet.com/page/comprar-stablecoins' },
    { title: 'Sell USDC', url: 'https://midoriwallet.com/page/vender-stablecoins' },
  ],
};

/** Default shortcuts with stable ids, so every New Tab agrees on them before anything is saved. */
export function cloneDefaults() {
  return Object.fromEntries(Object.entries(DEFAULT_BOOKMARKS).map(([category, items]) => [category,
    items.map((item, index) => ({ ...item, id: `default-${category}-${index}`, rev: 1 }))]));
}
