import rssCacheService from './RssCacheService.js';

const AVAILABLE_FEEDS = [
  {
    name: 'BBC News',
    url: 'https://feeds.bbci.co.uk/news/rss.xml',
    icon: '🇬🇧',
    color: '#1e3a8a',
    description: 'Noticias internacionales',
  },
  {
    name: 'Astian',
    url: 'https://astian.org/rss',
    icon: '🚀',
    color: '#4ecdc4',
    description: 'Tecnologia y desarrollo',
  },
  {
    name: 'Mozilla',
    url: 'https://blog.mozilla.org/feed/',
    icon: '🦊',
    color: '#ff7139',
    description: 'Web abierta y privacidad',
  },
  {
    name: 'GitHub',
    url: 'https://github.blog/feed/',
    icon: '🐙',
    color: '#24292e',
    description: 'Desarrollo y codigo',
  },
];

export function getAvailableFeeds() {
  return AVAILABLE_FEEDS;
}

export function getFeedColor(feeds, index) {
  return feeds[index]?.color || '#4ecdc4';
}

export async function fetchFeedPayload(feedUrl, forceRefresh = false) {
  return rssCacheService.getFeed(feedUrl, forceRefresh);
}

export function parseFeedPayload(feedPayload) {
  return {
    feedTitle: feedPayload?.feed?.title || 'RSS',
    feedItems: Array.isArray(feedPayload?.items) ? feedPayload.items : [],
  };
}

export function truncateFeedText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
}
