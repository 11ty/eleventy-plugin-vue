<template>
  <div id="child"></div>
</template>
<style>
#child { color: green; }
</style>
<script>
import grandchild from "./grandchild.vue";

export default {
  props: {},
  components: {
    grandchild,
  }
}
</script>