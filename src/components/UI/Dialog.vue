<template>
  <div
    class="containerDialog"
    :class="{'show' : show}"
    @click="closeModal"
  >
    <div 
      class="dialog"
      :class="{'show' : show}"
      @click.stop
    >
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
      <div class="nav">
        <slot name="nav">
        </slot>
      </div>
      <slot></slot>
    </div>
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
      }
    },
  }
</script>

<style scoped>
.containerDialog {
  position: absolute;
  top: 0;
  right: 0;
  width: 0%;
  height: 100vh;
  background-color: transparent;
  overflow: hidden;
  box-sizing: border-box;
  transition: .3s ease-in-out background, 1s ease-in-out width;
}

.containerDialog.show {
  width: 100%;
  background-color: rgba(0, 0, 0, .4);
  transition: 3s ease-in-out background, .6s ease-in-out width;
}

.dialog {
  width: 100%;
  min-width: 250px;
  max-width: 490px;
  height: calc(100% - .8rem);
  position: absolute;
  right: -400px;
  background-color: var(--bg-color);
  color: var(--text-color);
  border-radius: .6rem;
  padding: .3rem;
  margin: .4rem 0;
  transition: 1s ease-in-out;
  display: flex;
  flex-direction: column;
  gap: .5rem;
}

.dialog.show {
  right: .4rem;
}

.header {
  display: flex;
  flex-direction: column;
  padding: 1rem 0;
  background-image: url('https://images.unsplash.com/photo-1482192505345-5655af888cc4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3MzY2MDh8MHwxfHJhbmRvbXx8fHx8fHx8fDE3NDYwNTMxMDR8&ixlib=rb-4.0.3&q=80&w=1080');
  background-size: cover;
  background-position: center;
  padding: .5rem;
  border-radius: .4rem;
  height: 100%;
  min-height: 20px;
  max-height: 200px;
  position: relative;
}

.header > button {
  place-self: end;
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
}

.icon {
  position: absolute;
  bottom: -50px;
  left: 20px;
  width: 94px;
  height: 94px;
  background-color: var(--green);
  color: white;
  border-radius: .4rem;
  display: flex;
  justify-content: center;
  align-items: center;
}

.nav {
  width: 100%;
  min-width: 20px;
  max-width: 330px;
  align-self: end;
}

</style>
