<template>
  <div
    class="containerDialog"
    :class="{'show' : show}"
    @click="closeModal"
  ></div>
    <div 
      class="dialog"
      :class="{'show' : show}"
      @click.stop
    >
    <div class="container-header">
      <div class="header">
        <div class="title">
          <h2>{{ title}}</h2>
        </div>
        <Button
        @click="closeModal"
        icon="iconamoon:close-thin"
        class="text-color"
        size="22px"
        flat
        bound
        />
        <div class="icon">
          <Icon :icon="icon"  width="80" height="80" />
        </div>
      </div>
    </div>

      <div class="nav">
        <slot name="nav">
        </slot>
      </div>
      <slot></slot>
    </div>
</template>

<script>
  import Button from './Button.vue';
  import { Icon } from '@iconify/vue';
  export default {
    emits: ['open'],
    props: {
      show: {
        type: Boolean,
        required: true
      },
      title: {
        type: String,
        required: true
      },
      icon: {
        type: String
      }
    },

    components: {
      Button,
      Icon
    },

    methods: {
      closeModal() {
        this.$emit('open')
      },

      openModel() {
        this.$emit('open')
      }
    },
  }
</script>

<style scoped>
.containerDialog {
  position: fixed;
  top: 0;
  right: 0;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  box-sizing: border-box;
  font-size: 14px;
  background-color: rgba(0, 0, 0, 0);
  opacity: 0;
  transition: background-color 0.3s ease, opacity 0.3s ease;
  visibility: hidden;
}

.containerDialog.show {
  visibility: visible;
  opacity: 1;
  background-color: rgba(10, 10, 10, .4);
}

.dialog {
  width: 100%;
  min-width: 250px;
  max-width: 400px;
  height: calc(100% - .8rem);
  position: fixed;
  right: -400px;
  background-color: var(--bg-blur);
  backdrop-filter: blur(10px) saturate(180%);
  -webkit-backdrop-filter: blur(10px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: var(--text-color);
  border-radius: 1rem;
  margin: .4rem 0;
  transition: 1s;
  display: flex;
  flex-direction: column;
  gap: .5rem;
}

.dialog.show {
  right: .4rem;
}

.container-header {
  padding: .3rem;
  height:180px;
}

.header {
  display: flex;
  flex-direction: column;
  padding: 1rem 0;
  background-image: url('https://images.unsplash.com/photo-1482192505345-5655af888cc4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3MzY2MDh8MHwxfHJhbmRvbXx8fHx8fHx8fDE3NDYwNTMxMDR8&ixlib=rb-4.0.3&q=80&w=1080');
  background-size: cover;
  background-position: center;
  border-radius: .8rem;
  height: 100%;
  position: relative;
}

.header > button {
  position: absolute;
  top: 10px;
  right: 10px;
}

.title {
  width: 150px;
  height: 50px;
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  margin: auto;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--bg-blur);
  backdrop-filter: blur(.2rem);
  border-radius: .4rem;
}

.title > h2 {
  font-size: 1rem;
  font-weight: 500;
}

.icon {
  position: absolute;
  bottom: -50px;
  left: 20px;
  width: 94px;
  height: 94px;
  background-color: var(--green);
  color: white;
  border-radius: .8rem;
  display: flex;
  justify-content: center;
  align-items: center;
}

.nav {
  width: 100%;
  min-width: 20px;
  max-width: 260px;
  align-self: end;
  margin-right: .3rem;
}

</style>
