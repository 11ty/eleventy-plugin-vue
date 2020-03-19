<!--DATA: {{ greeting }} URL method: {{ url("/test/") }}-->
<template>
<div class="parent">
	<child></child>
</div>
</template>

<style>
.parent {
	font-weight: 400;
}
</style>

<style scoped>
.parent {
	font-weight: 700;
}
</style>

<script>
import childComponent from "./child.vue";

export default {
	data: function() {
		return {
			greeting: "Hello"
		};
	},
	components: {
		child: childComponent
	}
};
</script>