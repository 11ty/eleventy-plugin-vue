---
layout: layout.njk
test: HELLO
---
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
</div>