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
<script>

export default {
	components: {}
}
</script>