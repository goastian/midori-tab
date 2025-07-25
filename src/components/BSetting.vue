<template>
  <Button
    @click="tabStore.updateState"
    icon="material-symbols-light:settings-outline-rounded" 
    iconSize="1.4rem"
    class="bg"
    bound
  />
</template>

<script>
import useTabStore from '../stores/useTabStore.js';
import Button from '../components/UI/Button.vue';
export default {
  data() {
    return {
      tabStore: useTabStore(),
    }
  },

  components: {
    Button,
  }
}
</script>