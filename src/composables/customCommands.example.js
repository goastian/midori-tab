/**
 * EJEMPLO: Cómo agregar comandos personalizados
 * 
 * Este archivo muestra cómo puedes extender el sistema de comandos
 * con tus propias aplicaciones y servicios favoritos.
 * 
 * Para usar:
 * 1. Copia este archivo y renómbralo a customCommands.js
 * 2. Agrega tus comandos personalizados
 * 3. Importa y usa en useCommands.js
 */

export const customCommands = [
  // Ejemplo 1: Comando simple que abre una URL
  {
    id: 'mi-app',
    name: 'Mi Aplicación',
    description: 'Abrir mi aplicación favorita',
    keywords: ['app', 'favorita', 'personal'],
    icon: '🚀',
    action: () => window.open('https://mi-app.com', '_blank'),
    category: 'utilities',
  },

  // Ejemplo 2: Comando con múltiples palabras clave
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    description: 'Abrir ChatGPT',
    keywords: ['chatgpt', 'gpt', 'ai', 'openai', 'chat', 'inteligencia artificial'],
    icon: '🤖',
    action: () => window.open('https://chat.openai.com', '_blank'),
    category: 'productivity',
  },

  // Ejemplo 3: Comando que ejecuta lógica personalizada
  {
    id: 'random-quote',
    name: 'Frase Aleatoria',
    description: 'Mostrar una frase motivacional',
    keywords: ['frase', 'quote', 'motivación', 'inspiración'],
    icon: '💭',
    action: () => {
      const quotes = [
        'El éxito es la suma de pequeños esfuerzos repetidos día tras día.',
        'La única forma de hacer un gran trabajo es amar lo que haces.',
        'No cuentes los días, haz que los días cuenten.',
        'El futuro pertenece a quienes creen en la belleza de sus sueños.',
      ];
      const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
      alert(randomQuote);
    },
    category: 'utilities',
  },

  // Ejemplo 4: Comando con búsqueda integrada
  {
    id: 'youtube-search',
    name: 'Buscar en YouTube',
    description: 'Buscar videos en YouTube',
    keywords: ['youtube', 'video', 'buscar'],
    icon: '🎥',
    action: () => {
      const query = prompt('¿Qué quieres buscar en YouTube?');
      if (query) {
        window.open(`https://youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank');
      }
    },
    category: 'social',
  },

  // Ejemplo 5: Comando para tu dashboard personal
  {
    id: 'dashboard',
    name: 'Mi Dashboard',
    description: 'Abrir mi dashboard personal',
    keywords: ['dashboard', 'panel', 'control'],
    icon: '📊',
    action: () => window.open('https://mi-dashboard.com', '_blank'),
    category: 'productivity',
  },

  // Ejemplo 6: Comando para herramientas de desarrollo
  {
    id: 'localhost',
    name: 'Localhost',
    description: 'Abrir servidor local',
    keywords: ['localhost', 'local', 'dev', 'desarrollo'],
    icon: '🔧',
    action: () => {
      const port = prompt('¿En qué puerto está tu servidor? (default: 3000)', '3000');
      window.open(`http://localhost:${port}`, '_blank');
    },
    category: 'development',
  },

  // Ejemplo 7: Comando con acción en la misma pestaña
  {
    id: 'google-search',
    name: 'Buscar en Google',
    description: 'Buscar en Google (misma pestaña)',
    keywords: ['google', 'buscar', 'search'],
    icon: '🔍',
    action: () => {
      const query = prompt('¿Qué quieres buscar?');
      if (query) {
        window.location.href = `https://google.com/search?q=${encodeURIComponent(query)}`;
      }
    },
    category: 'utilities',
  },

  // Ejemplo 8: Comando para redes sociales específicas
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Abrir Instagram',
    keywords: ['instagram', 'ig', 'fotos', 'social'],
    icon: '📷',
    action: () => window.open('https://instagram.com', '_blank'),
    category: 'social',
  },

  // Ejemplo 9: Comando para herramientas de diseño
  {
    id: 'coolors',
    name: 'Coolors',
    description: 'Generador de paletas de colores',
    keywords: ['coolors', 'colores', 'paleta', 'diseño'],
    icon: '🎨',
    action: () => window.open('https://coolors.co', '_blank'),
    category: 'design',
  },

  // Ejemplo 10: Comando para música
  {
    id: 'spotify',
    name: 'Spotify',
    description: 'Abrir Spotify Web Player',
    keywords: ['spotify', 'música', 'music', 'player'],
    icon: '🎵',
    action: () => window.open('https://open.spotify.com', '_blank'),
    category: 'social',
  },
];

/**
 * CATEGORÍAS DISPONIBLES:
 * - productivity: Productividad
 * - communication: Comunicación
 * - development: Desarrollo
 * - design: Diseño
 * - social: Redes Sociales
 * - utilities: Utilidades
 */

/**
 * ICONOS SUGERIDOS:
 * 
 * Productividad: ⚡ 📝 ✅ 📊 🎯 📈 💼 🗂️
 * Comunicación: 💬 📧 📞 💌 🗨️ 📱 ☎️
 * Desarrollo: 💻 🔧 ⚙️ 🛠️ 🔨 🖥️ 👨‍💻
 * Diseño: 🎨 🖌️ ✏️ 🖍️ 🎭 🌈 🖼️
 * Social: 🌐 👥 🤝 📱 💭 🗣️ 👋
 * Utilidades: 🛠️ 🔍 📁 📂 🗃️ 🔐 🔑
 */

export default customCommands;
