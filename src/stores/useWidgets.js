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
        console.log(setting.theme);
        this.widgets = [
          {
            id: 1,
            x: 4,
            y: 11,
            w: 4,
            h: 1,
            name: "search",
            component: "ZSearchWidget",
            local: false,
          },
          {
            id: 2,
            x: 11,
            y: 0,
            w: 1,
            h: 1,
            name: "setting",
            component: "BSetting",
            local: true,
          },
          {
            id: 4,
            x: 0,
            y: 0,
            w: 3,
            h: 2,
            name: "logo",
            component: "Logo",
            local: true,
          },
          {
            id: 5,
            x: 0,
            y: 2,
            w: 7,
            h: 5,
            name: "marked",
            component: "ZMarkedWidget",
            local: false,
            props: {
              theme: setting.theme,
              small: true
            },
          },
          {
            id: 6,
            x: 8,
            y: 0,
            w: 4,
            h: 6,
            name: "rss-news",
            component: "RssWidget",
            local: true,
          },
          {
            id: 7,
            x: 0,
            y: 7,
            w: 4,
            h: 5,
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
