<template>
	<div>
		HELLO WE ARE VUEING
		Current page url: <p v-html="page.url"></p>
		URL method: {{ url("hi") }}
		<div v-html="test"></div>
		<noDiv></noDiv>
		<myHeader>
			<noDiv></noDiv>
		</myHeader>
		<hi></hi>
		<otherHi></otherHi>
		<script></script>
		<!-- <p v-html="getUrl()"></p> -->
	</div>
</template>

<script>
import noDiv from "./_includes/noDiv.vue";
import myHeader from "./_includes/myHeader.vue";
import hi from "./_includes/subdir/hi.vue";
import otherHi from "./_includes/anothersubdir/hi.vue";

export default {
	data: () => {
		return {
			layout: "layout.njk",
			test: "HELLO",
			permalink: "/testing/testing/"
		};
	},
	components: {
		noDiv,
		myHeader,
		hi,
		otherHi
	}
}
</script>