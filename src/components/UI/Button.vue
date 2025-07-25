<template>
  <button
    :class="[
        { 'flat' : flat },
        { 'bound' : bound },
        { 'bounded' : bounded },
        { 'w-full' : wFull },
        { 'transparent' : noBg}
      ]
      
    "
    :style="[
      { 'font-size' : size },
      { 'color' : color}
    ]"
  >
    <Icon :icon="icon" v-if="iconLeft" :style="{ 'font-size' : iconSize }" />
    {{ title }}
    <Icon :icon="icon" v-if="icon && !iconLeft" :width="iconSize" :height="iconSize" />
  </button>
</template>

<script>
  import { Icon } from '@iconify/vue';
  export default {
    data() {
      return {

      }
    },

    components: {
      Icon,
    },

    props: {
      title: {
        type: String,
        required: false,
      },
      bound: {
        type: Boolean,
        default: false,
      },
      bounded: {
        type: Boolean,
        default: false
      },
      flat: {
        type: Boolean,
        default: false
      },
      iconLeft: {
        type: Boolean,
        required: false,
        default: false
      },
      iconRight: {
        type: Boolean,
        default: false,
      },
      icon: {
        type: String,
      },
      size: {
        type: String,
      },
      iconSize: {
        type: String
      },
      wFull: {
        type: Boolean,
        default: false,
      },
      noBg: {
        type: Boolean,
        default: false,
      },
      color: String
    },

    methods: {

    },
  }
</script>

<style scoped>
button {
  cursor: pointer;
  border: none;
  padding: .5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: .5rem;
  transition: .5s ease-in-out background;
}

.w-full {
  width: 100%;
}

.bound {
  border-radius: .2rem;
}

.bounded {
  border-radius: 50%;
}

.flat {
  padding: 0;
  line-height: 0;
  background-color: transparent;
}
</style>
