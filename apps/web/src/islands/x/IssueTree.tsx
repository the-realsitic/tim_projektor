// Projektor X: hierarchy view of one project — initiative → epic → story/task, every
// level expandable, with progress over all descendants. Read-only; a title opens the
// existing issue page. Page: pages/x/tree.astro, tab registered in x/nav.ts.
import { useEffect, useMemo, useState } from "preact/hooks";
import { useCurrentProject } from "../../lib/project-context";
import { statusDisplayName } from "../../lib/status";
import { issueUrl } from "../../utils/issue-url";
import { fetchAllIssues } from "../../utils/paginate";
import { CATEGORY_COLORS, type Issue } from "../board-utils";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import {
	buildTree,
	countNodes,
	defaultExpandedIds,
	expandableIds,
	filterOpen,
	progressPercent,
	type TreeNode,
} from "./tree-utils";

interface Props {
	workspaceSlug?: string;
}

const INDENT_REM = 1.25;

function useProjectIssues(projectId: string | null, workspaceSlug: string | undefined) {
	const [issues, setIssues] = useState<Issue[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!projectId) return;
		let cancelled = false;
		setLoading(true);
		setError(null);
		// One paged listing for the whole project — the tree is assembled client-side from
		// parent_id, so there is no per-node request waterfall.
		fetchAllIssues<Issue>({ project: projectId }, workspaceSlug)
			.then((items) => {
				if (!cancelled) setIssues(items);
			})
			.catch((e) => {
				if (!cancelled) setError(String(e));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [projectId, workspaceSlug]);

	return { issues, loading, error };
}

function ProgressBar({ node }: { node: TreeNode }) {
	const { done, total } = node.progress;
	if (total === 0) return null;
	const pct = progressPercent(node.progress);
	return (
		<span
			class="inline-flex items-center gap-2 shrink-0 text-xs text-text-muted"
			title={`${done} of ${total} done`}
		>
			<span
				class="block w-16 h-1.5 rounded-full bg-border overflow-hidden"
				role="progressbar"
				aria-label={`${done} of ${total} done`}
				aria-valuemin={0}
				aria-valuemax={total}
				aria-valuenow={done}
			>
				<span class="block h-full bg-accent" style={{ width: `${pct}%` }} />
			</span>
			<span class="tabular-nums">
				{done}/{total}
			</span>
		</span>
	);
}

function TreeRow({
	node,
	expanded,
	onToggle,
}: {
	node: TreeNode;
	expanded: ReadonlySet<string>;
	onToggle: (id: string) => void;
}) {
	const { issue, children, depth } = node;
	const hasChildren = children.length > 0;
	const isExpanded = hasChildren && expanded.has(issue.id);
	const ref = issue.project_key ? `${issue.project_key}-${issue.number}` : `#${issue.number}`;
	const category = issue.status_category ?? "";

	return (
		// Disclosure pattern, not the ARIA tree role: a full `tree` needs roving-tabindex
		// keyboard handling, while a toggle button with aria-expanded plus a real link per
		// row is keyboard- and screen-reader-usable with plain Tab navigation.
		<li class="list-none">
			<div
				class="flex items-center gap-2 py-1.5 pr-2 border-b border-border hover:bg-surface max-sm:flex-wrap"
				style={{ paddingLeft: `${depth * INDENT_REM + 0.25}rem` }}
			>
				{hasChildren ? (
					<button
						type="button"
						class="w-5 h-5 shrink-0 inline-flex items-center justify-center rounded text-text-muted hover:text-text-base"
						aria-label={`${isExpanded ? "Collapse" : "Expand"} ${ref}`}
						aria-expanded={isExpanded}
						onClick={() => onToggle(issue.id)}
					>
						<span aria-hidden="true">{isExpanded ? "▾" : "▸"}</span>
					</button>
				) : (
					<span class="w-5 shrink-0" aria-hidden="true" />
				)}
				<span class="font-mono text-[0.8rem] text-text-muted shrink-0">{ref}</span>
				{issue.type_name && (
					<span class="text-[0.7rem] uppercase tracking-wider text-text-muted shrink-0">
						{issue.type_name}
					</span>
				)}
				<a
					href={issueUrl(issue.project_key, issue.number, issue.title, issue.id)}
					class="flex-1 min-w-0 truncate text-text-base no-underline hover:text-accent"
				>
					{issue.title}
				</a>
				<ProgressBar node={node} />
				<span
					class="text-xs font-medium shrink-0"
					style={{ color: CATEGORY_COLORS[category] ?? undefined }}
				>
					{statusDisplayName(issue.status_name, issue.status_key)}
				</span>
				{issue.priority && issue.priority !== "none" && (
					<Badge
						class="shrink-0"
						style={{
							background: `var(--priority-${issue.priority}-bg)`,
							color: `var(--priority-${issue.priority}-text)`,
						}}
					>
						{issue.priority}
					</Badge>
				)}
			</div>
			{isExpanded && (
				<ul class="m-0 p-0">
					{children.map((child) => (
						<TreeRow key={child.issue.id} node={child} expanded={expanded} onToggle={onToggle} />
					))}
				</ul>
			)}
		</li>
	);
}

export default function IssueTree({ workspaceSlug }: Props) {
	const { project, error: projectError, ready } = useCurrentProject(workspaceSlug);
	const { issues, loading, error } = useProjectIssues(project?.id ?? null, workspaceSlug);
	const [openOnly, setOpenOnly] = useState(false);

	const fullTree = useMemo(() => buildTree(issues), [issues]);
	const tree = useMemo(() => (openOnly ? filterOpen(fullTree) : fullTree), [fullTree, openOnly]);

	// null = "not touched yet": derive the default from the data once it arrives, so the
	// initial expansion is correct without a second render pass on load.
	const [expandedState, setExpanded] = useState<Set<string> | null>(null);
	const expanded = expandedState ?? defaultExpandedIds(fullTree);

	function toggle(id: string) {
		const next = new Set(expanded);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		setExpanded(next);
	}

	if (projectError) return <p class="text-danger-text">{projectError}</p>;
	if (ready && !project) {
		return (
			<EmptyState
				title="No project selected"
				description="Open a project first, then switch to the Tree tab."
			/>
		);
	}
	if (!project || loading) return <p aria-live="polite">Loading…</p>;
	if (error) return <p class="text-danger-text">Failed to load issues: {error}</p>;
	if (issues.length === 0) {
		return <EmptyState title="No issues yet" description="This project has no issues." />;
	}

	return (
		<div>
			<div class="flex items-center gap-2 mb-3 flex-wrap">
				<Button size="sm" variant="outline" onClick={() => setExpanded(expandableIds(fullTree))}>
					Expand all
				</Button>
				<Button size="sm" variant="outline" onClick={() => setExpanded(new Set())}>
					Collapse all
				</Button>
				<label class="inline-flex items-center gap-1.5 text-sm text-text-base ml-2">
					<input
						type="checkbox"
						checked={openOnly}
						onChange={(e) => setOpenOnly((e.target as HTMLInputElement).checked)}
					/>
					Open only
				</label>
				<span class="ml-auto text-xs text-text-muted">
					{countNodes(tree)} of {issues.length} issues
				</span>
			</div>
			{tree.length === 0 ? (
				<EmptyState title="Nothing open" description="Every issue in this project is closed." />
			) : (
				<ul aria-label={`${project.name} issue tree`} class="m-0 p-0 border-t border-border">
					{tree.map((node) => (
						<TreeRow key={node.issue.id} node={node} expanded={expanded} onToggle={toggle} />
					))}
				</ul>
			)}
		</div>
	);
}
