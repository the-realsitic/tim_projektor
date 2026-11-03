// Projektor X: pure helpers for the issue tree (/x/tree). No DOM, no fetch — so the
// tree rules are unit-tested on their own (tree-utils.test.ts).
import type { Issue } from "../board-utils";

export interface TreeProgress {
	/** Descendants in a `done` status. */
	done: number;
	/** Descendants that count towards progress: everything except `cancelled`. */
	total: number;
}

export interface TreeNode {
	issue: Issue;
	children: TreeNode[];
	depth: number;
	/** Over ALL descendants (not just direct children), so an initiative shows real progress. */
	progress: TreeProgress;
}

/**
 * Type order within one parent: bigger containers first, then by issue number. Upstream
 * ships no fixed hierarchy (initiative is a workspace-defined type), so unknown types sort
 * after the known ones rather than being rejected.
 */
const TYPE_RANK: Record<string, number> = {
	initiative: 0,
	epic: 1,
	story: 2,
	task: 3,
	bug: 4,
};
const UNKNOWN_TYPE_RANK = 5;

function typeRank(issue: Issue): number {
	return TYPE_RANK[issue.type_key ?? ""] ?? UNKNOWN_TYPE_RANK;
}

function compareIssues(a: Issue, b: Issue): number {
	return typeRank(a) - typeRank(b) || a.number - b.number;
}

export function isDone(issue: Issue): boolean {
	return issue.status_category === "done";
}

export function isCancelled(issue: Issue): boolean {
	return issue.status_category === "cancelled";
}

/** Neither done nor cancelled. */
export function isOpen(issue: Issue): boolean {
	return !isDone(issue) && !isCancelled(issue);
}

/**
 * Build the forest for one project's issues.
 *
 * - Roots are issues without a parent, plus orphans whose parent isn't in `issues`
 *   (a parent in another project, or one the caller can't see). Dropping them would
 *   silently hide work, which is exactly what this view exists to prevent.
 * - A parent cycle can't come from the API (max depth is enforced server-side), but a
 *   corrupt row must not hang the page: an issue already on the current path is not
 *   descended into again, and issues reachable only through a cycle become roots.
 */
export function buildTree(issues: readonly Issue[]): TreeNode[] {
	const byId = new Map(issues.map((i) => [i.id, i]));
	const childrenOf = new Map<string, Issue[]>();
	const roots: Issue[] = [];

	for (const issue of issues) {
		const parentId = issue.parent_id;
		if (parentId && parentId !== issue.id && byId.has(parentId)) {
			const list = childrenOf.get(parentId);
			if (list) list.push(issue);
			else childrenOf.set(parentId, [issue]);
		} else {
			roots.push(issue);
		}
	}

	const placed = new Set<string>();

	function build(issue: Issue, depth: number, path: Set<string>): TreeNode {
		placed.add(issue.id);
		const nextPath = new Set(path).add(issue.id);
		const children = (childrenOf.get(issue.id) ?? [])
			.filter((c) => !nextPath.has(c.id))
			.sort(compareIssues)
			.map((c) => build(c, depth + 1, nextPath));
		return { issue, children, depth, progress: sumProgress(children) };
	}

	const forest = roots.sort(compareIssues).map((r) => build(r, 0, new Set()));

	// Anything not reached from a root sits on a parent cycle: surface it as a root.
	const unplaced = issues.filter((i) => !placed.has(i.id)).sort(compareIssues);
	for (const issue of unplaced) {
		if (!placed.has(issue.id)) forest.push(build(issue, 0, new Set()));
	}
	return forest;
}

function sumProgress(children: readonly TreeNode[]): TreeProgress {
	let done = 0;
	let total = 0;
	for (const child of children) {
		done += child.progress.done;
		total += child.progress.total;
		if (!isCancelled(child.issue)) total += 1;
		if (isDone(child.issue)) done += 1;
	}
	return { done, total };
}

/**
 * Keep open issues and every ancestor needed to reach them. A closed parent with open
 * children stays (otherwise the open work would float without context); a closed leaf
 * or a fully closed subtree goes. Progress figures are left as computed on the full
 * tree, so hiding closed work never makes a node look less finished than it is.
 */
export function filterOpen(nodes: readonly TreeNode[]): TreeNode[] {
	const result: TreeNode[] = [];
	for (const node of nodes) {
		const children = filterOpen(node.children);
		if (isOpen(node.issue) || children.length > 0) result.push({ ...node, children });
	}
	return result;
}

/** Ids of every node that has children — what "expand all" opens. */
export function expandableIds(nodes: readonly TreeNode[]): Set<string> {
	const ids = new Set<string>();
	const walk = (list: readonly TreeNode[]) => {
		for (const node of list) {
			if (node.children.length > 0) {
				ids.add(node.issue.id);
				walk(node.children);
			}
		}
	};
	walk(nodes);
	return ids;
}

/**
 * Initial expansion: open the top level only. With initiatives at the root that shows
 * their epics; with epics at the root it shows their stories — one level of detail
 * either way, without unfolding a whole project at once.
 */
export function defaultExpandedIds(nodes: readonly TreeNode[]): Set<string> {
	return new Set(nodes.filter((n) => n.children.length > 0).map((n) => n.issue.id));
}

/** Number of nodes in the (possibly filtered) forest. */
export function countNodes(nodes: readonly TreeNode[]): number {
	return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

/** Whole-number percentage, 0 when there is nothing to count. */
export function progressPercent(progress: TreeProgress): number {
	return progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
}
