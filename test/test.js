const test = require("ava");
const path = require("path");
const { InlineCodeManager } = require("@11ty/eleventy-assets");
const EleventyVue = require("../EleventyVue");

function getEvInstance() {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache");
	ev.setInputDir("src");
	ev.setIncludesDir("src/components");
	return ev;
}

test("Directories", t => {
	let ev = getEvInstance();
	t.is(ev.cacheDir.endsWith(".cache"), true);
	t.is(ev.inputDir.endsWith("src"), true);
	t.is(ev.includesDir.endsWith("src/components"), true);
	t.is(ev.isIncludeFile(path.join(ev.includesDir, "test.vue")), true);
	t.is(ev.isIncludeFile(path.join(ev.inputDir, "test.vue")), false);
});

test("getLocalVueFilePath", t => {
	let ev = getEvInstance();
	t.is(ev.getLocalVueFilePath(path.join(ev.inputDir, "test.vue")), "./src/test.vue");
	t.is(ev.getLocalVueFilePath(path.join(ev.includesDir, "test.vue")), "./src/components/test.vue");
	t.is(ev.getLocalVueFilePath(path.join(ev.inputDir, "test.vue?query=param")), "./src/test.vue");
	t.is(ev.getLocalVueFilePath(path.join(ev.includesDir, "test.vue?query=param")), "./src/components/test.vue");
});

test("Vue SFC Render", async t => {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache/vue-test");
	ev.setInputDir("test/stubs");
	ev.setIncludesDir("test/stubs/components");

	let files = await ev.findFiles();
	let bundle = await ev.getBundle(files);
	let output = await ev.write(bundle);

	ev.createVueComponents(output);

	t.is(output.length, 4);

	let component = ev.getComponent("./test/stubs/data.vue");

	t.is(await ev.renderComponent(component, {
		page: {
			url: "/some-url/"
		}
	}), `<div><p>/some-url/</p><p>HELLO</p><div id="child"></div></div>`);
});

test("Vue SFC CSS", async t => {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache/vue-test");
	ev.setInputDir("test/stubs");
	ev.setIncludesDir("test/stubs/components");

	let cssMgr = new InlineCodeManager();
	ev.setCssManager(cssMgr);

	let files = await ev.findFiles();
	let bundle = await ev.getBundle(files);
	let output = await ev.write(bundle);

	ev.createVueComponents(output);

	t.is(output.length, 4);

	t.is(ev.getCSSForComponent("./test/stubs/data.vue"), `body {
	background-color: blue;
}
body {
	background-color: pink;
}`);

	t.is(ev.getCSSForComponent("./test/stubs/_includes/child.vue"), `#child { color: green; }`);

	let componentName = ev.getJavaScriptComponentFile("./test/stubs/data.vue");
	cssMgr.addComponentForUrl(componentName, "/data/");

	t.is(cssMgr.getCodeForUrl("/data/"), `/* grandchild.js Component */
#grandchild { color: yellow; }
/* child.js Component */
#child { color: green; }
/* data.js Component */
body {
	background-color: blue;
}
body {
	background-color: pink;
}`);
	
});
