const test = require("ava");
const path = require("path");
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

test("Vue SFC", async t => {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache");
	ev.setInputDir("test/stubs");
	ev.setIncludesDir("test/stubs/components");

	let files = await ev.findFiles("data.vue");
	let bundle = await ev.getBundle(files);
	let output = await ev.write(bundle);

	t.is(output.length, 1);

	let components = [];
	for(let entry of output) {
		let inputPath = ev.getLocalVueFilePath(entry.facadeModuleId);
		ev.addVueToJavaScriptMapping(inputPath, entry.fileName);
		ev.addComponent(inputPath);
		components.push(ev.getComponent(inputPath));
	}

	t.is(await ev.renderComponent(components[0], {
		page: {
			url: "/some-url/"
		}
	}), `<div data-server-rendered="true"><p>/some-url/</p> <p>HELLO</p></div>`);
})
