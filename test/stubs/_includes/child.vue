<template>
  <div id="child"><span>Test</span></div>
</template>
<style>
#child { color: green; }
</style>
<script>
import grandchild from "./grandchild.vue";

export default {
  props: {},
  components: {}
}
</script>