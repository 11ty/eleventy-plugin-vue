<template>
<header>
	header
	<!-- <div v-html="getUrl()"></div> -->
	<slot></slot>
</header>
</template>
<script>
export default {
	data: {
		localData: "localDataValue"
	}
}
</script>