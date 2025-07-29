class RssServiceBackground {
  constructor() {
    this.fallbackProxy = 'https://api.allorigins.win/raw?url=';
  }

  async fetchRssFeed(feedUrl) {
    try {
      // Intentar primero con el background script
      if (chrome && chrome.runtime) {
        const response = await this.fetchViaBackground(feedUrl);
        if (response.success) {
          return this.parseRssXml(response.data);
        }
      }
      
      // Fallback al proxy público
      return await this.fetchViaProxy(feedUrl);
    } catch (error) {
      console.error('Error fetching RSS feed:', error);
      throw new Error(`Error loading el feed RSS: ${error.message}`);
    }
  }

  async fetchViaBackground(feedUrl) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'fetchRss', url: feedUrl },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  async fetchViaProxy(feedUrl) {
    const proxyUrl = `${this.fallbackProxy}${encodeURIComponent(feedUrl)}`;
    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'User-Agent': 'Mozilla/5.0 (compatible; RSSReader/1.0)'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const xmlText = await response.text();
    return this.parseRssXml(xmlText);
  }

  parseRssXml(xmlString) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
      
      const items = [];
      const itemNodes = xmlDoc.querySelectorAll('item');
      
      itemNodes.forEach((item, index) => {
        if (index < 10) { // Limitar a 10 artículos
          const title = item.querySelector('title')?.textContent || '';
          const link = item.querySelector('link')?.textContent || '';
          const description = item.querySelector('description')?.textContent || '';
          const pubDate = item.querySelector('pubDate')?.textContent || '';
          
          items.push({
            title: this.cleanText(title),
            link: this.cleanText(link),
            description: this.cleanText(description),
            pubDate: this.formatDate(pubDate),
            id: index
          });
        }
      });

      return {
        title: xmlDoc.querySelector('channel > title')?.textContent || 'BBC News',
        description: xmlDoc.querySelector('channel > description')?.textContent || '',
        items: items
      };
    } catch (error) {
      console.error('Error parsing RSS XML:', error);
      throw new Error('Error al procesar el feed RSS');
    }
  }

  cleanText(text) {
    if (!text) return '';
    // Remover CDATA y HTML tags
    return text
      .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
      .replace(/<[^>]*>/g, '')
      .trim();
  }

  formatDate(dateString) {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return dateString;
    }
  }
}

export default RssServiceBackground; 