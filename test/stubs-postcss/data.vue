<template>
	<div>
		<p v-html="page.url"></p>
		<p v-html="test"></p>
	</div>
</template>
<style>
body {
	background-color: blue;
	& {
		color: black;
	}
}
</style>
<script>
export default {
	data: () => {
		return {
			layout: "layout.njk",
			test: "HELLO"
		};
	},
	components: {
	}
}
</script>