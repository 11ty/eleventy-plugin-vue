const test = require("ava");
const AssetManager = require("../src/AssetManager");

test("getComponentNameFromPath", t => {
	t.is(AssetManager.getComponentNameFromPath("hi.js", ".js"), "hi");
	t.is(AssetManager.getComponentNameFromPath("test/hi.js", ".js"), "hi");
	t.is(AssetManager.getComponentNameFromPath("sdlfjslkd/test/hi-2.js", ".js"), "hi-2");
});

test("Relationships", t => {
	let mgr = new AssetManager();
	mgr.addComponentRelationship("parent.js", "child.js");
	t.deepEqual(mgr.componentRelationships, {"parent.js": new Set(["child.js"])});

	mgr.init();
	mgr.addComponentRelationship("parent.js", "child.js", ".js");
	t.deepEqual(mgr.componentRelationships, {"parent": new Set(["child"])});
});

test("Duplicate Relationships", t => {
	let mgr = new AssetManager();
	mgr.addComponentRelationship("parent.js", "child.js", ".js");
	mgr.addComponentRelationship("parent.js", "child.js", ".js");
	mgr.addComponentRelationship("parent.js", "test.js", ".js");

	t.deepEqual(mgr.componentRelationships, {"parent": new Set(["child", "test"])});
});

test("Relationships roll into final component list", t => {
	let mgr = new AssetManager();
	mgr.addComponentForUrl("parent", "/");
	mgr.addComponentRelationship("parent.js", "child.js", ".js");
	mgr.addComponentRelationship("aunt.js", "cousin.js", ".js");

	t.deepEqual(mgr.getComponentListForUrl("/"), ["parent", "child"]);

	mgr.addComponentForUrl("cousin", "/");
	t.deepEqual(mgr.getComponentListForUrl("/"), ["parent", "child", "cousin"]);

	mgr.addComponentForUrl("aunt", "/");
	t.deepEqual(mgr.getComponentListForUrl("/"), ["parent", "child", "cousin", "aunt"]);
});

test("Relationships roll into final component list (sibling/child)", t => {
	let mgr = new AssetManager();
	mgr.addComponentForUrl("parent", "/");
	mgr.addComponentRelationship("parent.js", "child.js", ".js");
	mgr.addComponentRelationship("parent.js", "sibling.js", ".js");

	t.deepEqual(mgr.getComponentListForUrl("/"), ["parent", "child", "sibling"]);
});