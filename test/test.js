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

test("Can use relative path for cache directory", t => {
	let ev = getEvInstance();
	ev.setCacheDir(".cache");
	t.truthy(ev.workingDir);
	t.is(ev.getFullCacheDir(), path.join(ev.workingDir, ".cache"));
});

test("Can use absolute path for cache directory", t => {
	let ev = getEvInstance();
	ev.setCacheDir("/tmp");
	t.is(ev.getFullCacheDir(), "/tmp");
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
	ev.setCacheDir(".cache/vue-test-a");
	ev.setInputDir("test/stubs-a");
	ev.setIncludesDir("test/stubs-a/_includes");

	let files = await ev.findFiles();
	let bundle = await ev.getBundle(files);
	let output = await ev.write(bundle);

	ev.createVueComponents(output);
	t.is(output.length, 7);

	let component = ev.getComponent("./test/stubs-a/data.vue");

	t.is(await ev.renderComponent(component, {
		page: {
			url: "/some-url/"
		}
	}), `<div data-server-rendered="true"><p>/some-url/</p> <p>HELLO</p> <div id="child"></div></div>`);
});

test("Vue SFC Render (one input file)", async t => {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache/vue-test-b");
	ev.setInputDir("test/stubs-b");
	ev.setIncludesDir("test/stubs-b/_includes");

	let inputFile = path.join(process.cwd(), "test/stubs-b/data.vue");
	let files = [inputFile];
	let bundle = await ev.getBundle(files);
	let output = await ev.write(bundle);

	ev.createVueComponents(output);
	t.is(output.length, 7);

	let component = ev.getComponent("./test/stubs-b/data.vue");

	t.is(await ev.renderComponent(component, {
		page: {
			url: "/some-url/"
		}
	}), `<div data-server-rendered="true"><p>/some-url/</p> <p>HELLO</p> <div id="child"></div></div>`);
});

test("Vue SFC CSS", async t => {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache/vue-test-c");
	ev.setInputDir("test/stubs-c");
	ev.setIncludesDir("test/stubs-c/_includes");

	let cssMgr = new InlineCodeManager();
	ev.setCssManager(cssMgr);

	let files = await ev.findFiles();
	let bundle = await ev.getBundle(files);
	let output = await ev.write(bundle);

	ev.createVueComponents(output);
	t.is(output.length, 7);

	t.is(ev.getCSSForComponent("./test/stubs-c/data.vue"), `body {
	background-color: blue;
}
body {
	background-color: pink;
}`);

	t.is(ev.getCSSForComponent("./test/stubs-c/_includes/child.vue"), `#child { color: green;
}`);

	let componentName = ev.getJavaScriptComponentFile("./test/stubs-c/data.vue");
	cssMgr.addComponentForUrl(componentName, "/data/");

	t.is(cssMgr.getCodeForUrl("/data/"), `/* test/stubs-c/_includes/grandchild.js Component */
#grandchild { color: yellow;
}
/* test/stubs-c/_includes/child.js Component */
#child { color: green;
}
/* test/stubs-c/data.js Component */
body {
	background-color: blue;
}
body {
	background-color: pink;
}`);
	
});

test("Vue SFC CSS (one input file)", async t => {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache/vue-test-d");
	ev.setInputDir("test/stubs-d");
	ev.setIncludesDir("test/stubs-d/_includes");

	let cssMgr = new InlineCodeManager();
	ev.setCssManager(cssMgr);

	let inputFile = path.join(process.cwd(), "test/stubs-d/data.vue");
	let files = [inputFile];
	let bundle = await ev.getBundle(files);
	let output = await ev.write(bundle);

	ev.createVueComponents(output);
	t.is(output.length, 7);

	t.is(ev.getCSSForComponent("./test/stubs-d/data.vue"), `body {
	background-color: blue;
}
body {
	background-color: pink;
}`);

	t.is(ev.getCSSForComponent("./test/stubs-d/_includes/child.vue"), `#child { color: green;
}`);

	let componentName = ev.getJavaScriptComponentFile("./test/stubs-d/data.vue");
	cssMgr.addComponentForUrl(componentName, "/data/");

	t.is(cssMgr.getCodeForUrl("/data/"), `/* test/stubs-d/_includes/grandchild.js Component */
#grandchild { color: yellow;
}
/* test/stubs-d/_includes/child.js Component */
#child { color: green;
}
/* test/stubs-d/data.js Component */
body {
	background-color: blue;
}
body {
	background-color: pink;
}`);
	
});
