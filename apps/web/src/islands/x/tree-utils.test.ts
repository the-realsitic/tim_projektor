import { describe, expect, it } from "vitest";
import type { Issue } from "../board-utils";
import {
	buildTree,
	countNodes,
	defaultExpandedIds,
	expandableIds,
	filterOpen,
	progressPercent,
	type TreeNode,
} from "./tree-utils";

function issue(id: string, overrides: Partial<Issue> = {}): Issue {
	return {
		id,
		number: Number(id.replace(/\D/g, "")) || 1,
		title: `Issue ${id}`,
		priority: "none",
		assignee_id: null,
		assignee_name: null,
		parent_id: null,
		project_key: "PX",
		project_name: "Projektor X",
		type_key: "task",
		type_name: "Task",
		status_id: "st-todo",
		status_key: "todo",
		status_name: "Todo",
		status_category: "todo",
		sprint_id: null,
		updated_at: 0,
		created_at: 0,
		...overrides,
	};
}

const done = { status_category: "done", status_key: "done", status_name: "Done" } as const;
const cancelled = {
	status_category: "cancelled",
	status_key: "cancelled",
	status_name: "Cancelled",
} as const;

function ids(nodes: readonly TreeNode[]): string[] {
	return nodes.map((n) => n.issue.id);
}

describe("buildTree", () => {
	it("nests children under parents across more than two levels", () => {
		const tree = buildTree([
			issue("i1", { type_key: "initiative" }),
			issue("e2", { type_key: "epic", parent_id: "i1" }),
			issue("s3", { type_key: "story", parent_id: "e2" }),
			issue("t4", { parent_id: "s3" }),
		]);
		expect(ids(tree)).toEqual(["i1"]);
		const epic = tree[0].children[0];
		expect(epic.issue.id).toBe("e2");
		expect(epic.depth).toBe(1);
		expect(epic.children[0].children[0].issue.id).toBe("t4");
		expect(epic.children[0].children[0].depth).toBe(3);
	});

	it("shows children of non-epic parents (upstream only lists them for epics)", () => {
		const tree = buildTree([
			issue("i1", { type_key: "initiative" }),
			issue("e2", { type_key: "epic", parent_id: "i1" }),
		]);
		expect(ids(tree[0].children)).toEqual(["e2"]);
	});

	it("keeps orphans whose parent is not in the result as roots", () => {
		const tree = buildTree([issue("t1", { parent_id: "elsewhere" }), issue("t2")]);
		expect(ids(tree)).toEqual(["t1", "t2"]);
	});

	it("sorts siblings by type, then by number", () => {
		const tree = buildTree([
			issue("t5"),
			issue("e9", { type_key: "epic" }),
			issue("t3"),
			issue("x1", { type_key: "custom" }),
			issue("i7", { type_key: "initiative" }),
		]);
		expect(ids(tree)).toEqual(["i7", "e9", "t3", "t5", "x1"]);
	});

	it("survives a parent cycle without looping and without losing issues", () => {
		const tree = buildTree([issue("a1", { parent_id: "b2" }), issue("b2", { parent_id: "a1" })]);
		expect(countNodes(tree)).toBe(2);
	});

	it("treats a self-parented issue as a root", () => {
		expect(ids(buildTree([issue("a1", { parent_id: "a1" })]))).toEqual(["a1"]);
	});
});

describe("progress", () => {
	it("counts all descendants, excludes cancelled from the total", () => {
		const [root] = buildTree([
			issue("i1", { type_key: "initiative" }),
			issue("e2", { type_key: "epic", parent_id: "i1" }),
			issue("t3", { parent_id: "e2", ...done }),
			issue("t4", { parent_id: "e2" }),
			issue("t5", { parent_id: "e2", ...cancelled }),
		]);
		// e2 (open) + t3 (done) + t4 (open); t5 cancelled is not counted.
		expect(root.progress).toEqual({ done: 1, total: 3 });
		expect(root.children[0].progress).toEqual({ done: 1, total: 2 });
	});

	it("gives leaves no progress and rounds percentages", () => {
		const [leaf] = buildTree([issue("t1")]);
		expect(leaf.progress).toEqual({ done: 0, total: 0 });
		expect(progressPercent(leaf.progress)).toBe(0);
		expect(progressPercent({ done: 1, total: 3 })).toBe(33);
	});
});

describe("filterOpen", () => {
	const issues = [
		issue("e1", { type_key: "epic", ...done }),
		issue("t2", { parent_id: "e1" }),
		issue("e3", { type_key: "epic", ...done }),
		issue("t4", { parent_id: "e3", ...done }),
		issue("t5", { ...cancelled }),
	];

	it("keeps a closed parent that still has open work, drops closed subtrees", () => {
		const filtered = filterOpen(buildTree(issues));
		expect(ids(filtered)).toEqual(["e1"]);
		expect(ids(filtered[0].children)).toEqual(["t2"]);
	});

	it("does not change progress figures", () => {
		const full = buildTree(issues);
		const filtered = filterOpen(full);
		expect(filtered[0].progress).toEqual(full[0].progress);
	});
});

describe("expansion helpers", () => {
	const tree = buildTree([
		issue("i1", { type_key: "initiative" }),
		issue("e2", { type_key: "epic", parent_id: "i1" }),
		issue("t3", { parent_id: "e2" }),
		issue("t4"),
	]);

	it("expands only top-level nodes with children by default", () => {
		expect([...defaultExpandedIds(tree)]).toEqual(["i1"]);
	});

	it("lists every node with children for expand-all", () => {
		expect([...expandableIds(tree)].sort()).toEqual(["e2", "i1"]);
	});
});
