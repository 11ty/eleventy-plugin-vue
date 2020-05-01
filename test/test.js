const test = require("ava");
const path = require("path");
const EleventyVue = require("../EleventyVue");

function getEvInstance() {
	let ev = new EleventyVue();
	ev.setCacheDir(".cache");
	ev.setInputDir("src", "components");
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