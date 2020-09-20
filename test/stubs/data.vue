<template>
	<div>
		<p v-html="page.url"></p>
		<p v-html="test"></p>
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
export default {
	data: () => {
		return {
			layout: "layout.njk",
			test: "HELLO"
		};
	}
}
</script>