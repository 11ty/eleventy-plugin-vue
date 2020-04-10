<template>
<header>
	header
	<!-- <div v-html="getUrl()"></div> -->
	<slot></slot>
</header>
</template>
<script>
export default {
	data: function() {
		return {
			localData: "localDataValue"
		}
	}
}
</script>

<custom-block></custom-block>