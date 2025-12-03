import { defineStore } from "pinia";
import useTabStore from "./useTabStore";

const useWidgets = defineStore("widgets", {
  state: () => ({
    widgets: [],
    state: true,
  }),

  actions: {
    loadWidgets() {
      const wid = localStorage.getItem('widgets')
      if (!wid) {
        const setting = useTabStore();
        this.widgets = [
          // Logo centrado arriba
          {
            id: 4,
            x: 5,
            y: 0,
            w: 2,
            h: 2,
            name: "logo",
            component: "Logo",
            local: true,
          },
          // Widget de búsqueda centrado
          {
            id: 1,
            x: 3,
            y: 2,
            w: 6,
            h: 1,
            name: "search",
            component: "ZSearchWidget",
            local: false,
          },
          // Widget de notas/marcadores a la izquierda
          {
            id: 5,
            x: 0,
            y: 3,
            w: 6,
            h: 5,
            name: "marked",
            component: "ZMarkedWidget",
            local: false,
            props: {
              theme: setting.theme,
              small: true,
              useStorage: true,
            },
          },
          // RSS News principal a la derecha
          {
            id: 6,
            x: 6,
            y: 3,
            w: 6,
            h: 5,
            name: "rss-news",
            component: "RssWidget",
            local: true,
          },
          // Astian News abajo ancho completo
          {
            id: 7,
            x: 0,
            y: 8,
            w: 12,
            h: 4,
            name: "astian-news",
            component: "AstianRssWidget",
            local: true,
          },
        ];
      }
    },

    updateWidget(widget) {
      const data = this.widgets.map((item) => {
        if (item.id == widget.id) {
          item.x = widget.x;
          item.y = widget.y;
          item.w = widget.w;
          item.h = widget.h;
        }
        return item;
      });
      this.widgets = data;
    },

    changeState() {
      this.state = !this.state;
    },
  },

  persist: {
    enable: true,
    storage: localStorage,
  },
});

export default useWidgets;
