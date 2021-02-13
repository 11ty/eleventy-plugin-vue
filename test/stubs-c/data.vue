<template>
	<div>
		<p v-html="page.url"></p>
		<p v-html="test"></p>
		<child/>
	</div>
</template>
<style>
body {
	background-color: blue;
}
</style>
<style>
body {
	background-color: pink;
}
</style>
<script>
import child from "./_includes/child.vue";

export default {
	data: () => {
		return {
			layout: "layout.njk",
			test: "HELLO"
		};
	},
	components: {
		child
	}
}
</script>