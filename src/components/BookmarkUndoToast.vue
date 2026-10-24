<template>
  <UndoToast :entry="entry" :copy="copy" @undo="$emit('undo')" @dismiss="$emit('dismiss')" />
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';
import { getWidgetCopy } from '../i18n/widget-copy.js';
import UndoToast from './UndoToast.vue';

export default {
  name: 'BookmarkUndoToast',
  components: { UndoToast },
  props: { entry: { type: Object, default: null } },
  emits: ['undo', 'dismiss'],
  data() {
    return { i18n: useI18nStore() };
  },
  computed: {
    copy() {
      return getWidgetCopy(this.i18n.locale).dataSafety;
    },
  },
};
</script>
