import { defineStore } from "pinia";

const useUserStore = defineStore("user", {
  state: () => ({
    isLoggedIn: false,
  }),

  actions: {
    setLoggedIn() {
      this.isLoggedIn = true;
    },
    logout() {
      this.isLoggedIn = false;
    },
  },

  persist: {
    enable: true,
    storage: localStorage,
  },
});

export default useUserStore;