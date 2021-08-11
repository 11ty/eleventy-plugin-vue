const test = require("ava");
const path = require("path");
const { InlineCodeManager } = require("@11ty/eleventy-assets");
const EleventyVue = require("../EleventyVue");

function getEvInstance() {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache");
	ev.setInputDir("src");
	ev.setIncludesDir("components");
	return ev;
}

test("Directories", t => {
	let ev = getEvInstance();
	t.is(ev.cacheDir, ".cache");
	t.is(ev.inputDir, path.join(process.cwd(), "src"));
	t.is(ev.includesDir, path.join(process.cwd(), "src/components"));
	t.is(ev.isIncludeFile(path.join(ev.includesDir, "test.vue")), true);
	t.is(ev.isIncludeFile(path.join(ev.inputDir, "test.vue")), false);
});

test("Relative Directories", t => {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache");
	ev.setInputDir("src");
	ev.setIncludesDir("../components");
	ev.setLayoutsDir("../layouts");

	t.is(ev.inputDir, path.join(process.cwd(), "src"));
	t.is(ev.includesDir, path.join(process.cwd(), "components"));
	t.is(ev.layoutsDir, path.join(process.cwd(), "layouts"));
	t.deepEqual(Array.from(ev.ignores), [
		path.join(process.cwd(), "components/**"),
	]);
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
	t.is(ev.getLocalVueFilePath(path.join(ev.inputDir, "press", "press-release.vue?rollup-plugin-vue=styles.0.css")), "./src/press/press-release.vue");
});

test("Vue SFC Render", async t => {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache/vue-test-a");
	ev.setInputDir("test/stubs-a");
	ev.setIncludesDir("_includes");

	let files = await ev.findFiles();
	let bundle = await ev.getBundle(files);
	let output = await ev.write(bundle);

	ev.createVueComponents(output);
	t.is(output.length, 9);

	let component = ev.getComponent("./test/stubs-a/data.vue");
	t.is(await ev.renderComponent(component, {
		page: {
			url: "/some-url/"
		}
	}), `<div><p>/some-url/</p><p>HELLO</p><div id="child"></div></div>`);
});

test("Vue SFC Render (one input file)", async t => {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache/vue-test-b");
	ev.setInputDir("test/stubs-b");
	ev.setIncludesDir("_includes");

	let inputFile = path.join(process.cwd(), "test/stubs-b/data.vue");
	let files = [inputFile];
	let bundle = await ev.getBundle(files);
	let output = await ev.write(bundle);

	ev.createVueComponents(output);
	t.is(output.length, 9);

	let component = ev.getComponent("./test/stubs-b/data.vue");

	t.is(await ev.renderComponent(component, {
		page: {
			url: "/some-url/"
		}
	}), `<div><p>/some-url/</p><p>HELLO</p><div id="child"></div></div>`);
});

test("Vue SFC CSS", async t => {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache/vue-test-c");
	ev.setInputDir("test/stubs-c");
	ev.setIncludesDir("_includes");

	let cssMgr = new InlineCodeManager();
	ev.setCssManager(cssMgr);

	let files = await ev.findFiles();
	let bundle = await ev.getBundle(files);
	let output = await ev.write(bundle);

	ev.createVueComponents(output);
	t.is(output.length, 9);

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

	t.is(cssMgr.getCodeForUrl("/data/"), `/* _includes/grandchild.js Component */
#grandchild { color: yellow;
}
/* _includes/child.js Component */
#child { color: green;
}
/* data.js Component */
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
	ev.setIncludesDir("_includes");

	let cssMgr = new InlineCodeManager();
	ev.setCssManager(cssMgr);

	let inputFile = path.join(process.cwd(), "test/stubs-d/data.vue");
	let files = [inputFile];
	let bundle = await ev.getBundle(files);
	let output = await ev.write(bundle);

	ev.createVueComponents(output);
	t.is(output.length, 9);

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

	t.is(cssMgr.getCodeForUrl("/data/"), `/* _includes/grandchild.js Component */
#grandchild { color: yellow;
}
/* _includes/child.js Component */
#child { color: green;
}
/* data.js Component */
body {
	background-color: blue;
}
body {
	background-color: pink;
}`);
	
});

test("Vue SFC CSS (one component, no children) Issue #10", async t => {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache/vue-test-e");
	ev.setInputDir("test/stubs-e");
	ev.setIncludesDir("_includes");

	let cssMgr = new InlineCodeManager();
	ev.setCssManager(cssMgr);

	let bundle = await ev.getBundle();
	let output = await ev.write(bundle);

	ev.createVueComponents(output);

	t.is(ev.getCSSForComponent("./test/stubs-e/data.vue"), `body {
	background-color: blue;
}`);

	let componentName = ev.getJavaScriptComponentFile("./test/stubs-e/data.vue");
	cssMgr.addComponentForUrl(componentName, "/data/");

	t.is(cssMgr.getCodeForUrl("/data/"), `/* data.js Component */
body {
	background-color: blue;
}`);
	
});

test.skip("Vue as Layout file (Issue #26)", async t => {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache/vue-test-layout");
	ev.setInputDir("test/stubs-layout");
	ev.setIncludesDir("_includes", true);
	t.deepEqual(Array.from(ev.ignores), []);

	let files = await ev.findFiles();
	t.is(files.length, 2);

	let bundle = await ev.getBundle(files);
	let output = await ev.write(bundle);

	ev.createVueComponents(output);

	let component = ev.getComponent("./test/stubs-layout/page.vue");

	t.is(await ev.renderComponent(component, {
		page: {
			url: "/some-url/"
		}
	}), `<html lang="en">
	<title></title>
	<div data-server-rendered="true">Child content</div>
</html>`);
});

test("Vue SFC Data Leak", async t => {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache/vue-data-leak");
	ev.setInputDir("test/stubs-data-leak");

	let files = await ev.findFiles();
	let bundle = await ev.getBundle(files);
	let output = await ev.write(bundle);
	ev.createVueComponents(output);
	t.is(output.length, 3);

	let component = ev.getComponent("./test/stubs-data-leak/index.vue");

	let data = {
		events: [
			{a: 1, b: 2},
			{c: 3, d: 4},
		]
	};

	t.is(await ev.renderComponent(component, data), `<div>[{"a":1,"b":2},{"c":3,"d":4}]</div>`);
	t.is(await ev.renderComponent(component, data), `<div>[{"a":1,"b":2},{"c":3,"d":4}]</div>`);
	t.is(await ev.renderComponent(component, data), `<div>[{"a":1,"b":2},{"c":3,"d":4}]</div>`);
});

test("Vue SFC CSS postcss Plugin", async t => {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache/vue-test-postcss");
	ev.setInputDir("test/stubs-postcss");
	ev.setIncludesDir("_includes");

	ev.setRollupOptions({
		external: ["testtesttest"]
	});

	ev.setRollupPluginVueOptions({
		postcssPlugins: [
			require("postcss-nested")
		]
	});

	let rollupOptions = ev.getMergedRollupOptions();
	t.deepEqual(rollupOptions.external, [
		"vue",
		"@vue/server-renderer",
		"testtesttest"
	]);
	t.is(rollupOptions.plugins.length, 2);

	let cssMgr = new InlineCodeManager();
	ev.setCssManager(cssMgr);

	let files = await ev.findFiles();
	let bundle = await ev.getBundle(files);
	let output = await ev.write(bundle);

	ev.createVueComponents(output);
	t.is(output.length, 3);

	t.is(ev.getCSSForComponent("./test/stubs-postcss/data.vue"), `body {
	background-color: blue;
}
body {
		color: black;
}`);

	let componentName = ev.getJavaScriptComponentFile("./test/stubs-postcss/data.vue");
	cssMgr.addComponentForUrl(componentName, "/data/");

	t.is(cssMgr.getCodeForUrl("/data/"), `/* data.js Component */
body {
	background-color: blue;
}
body {
		color: black;
}`);
	
});