<template>
	<div>
		<p v-html="page.url"></p>
		<p v-html="test"></p>
	</div>
</template>

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