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
    { title: 'Midori Wallet', url: 'https://wallet.astian.org', domain: 'wallet.astian.org' },
    { title: 'P2P.me', url: 'https://app.p2p.me/recommend?address=0xB3082b37cC95a9d4e6B1aEC19719a00c37D47597&nonce=215422&signature=0x161f733dab2a16e55bc8b2000a2a22be178c884d932916cf62a72c96154c059c163b749bd522672fbb7dccefa56f9127c14c7d747335ddbb10d65cc2ed33344f1b', domain: 'p2p.me' },
  ],
};

export function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_BOOKMARKS));
}
