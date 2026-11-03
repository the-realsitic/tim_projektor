// IssueTree island — mock-fetch tests (same pattern as EpicList.test.tsx).
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetProjectStoreForTests } from "../../lib/project-context";
import type { Issue } from "../board-utils";
import IssueTree from "./IssueTree";

function issue(id: string, number: number, overrides: Partial<Issue> = {}): Issue {
	return {
		id,
		number,
		title: `Title ${id}`,
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

const ISSUES: Issue[] = [
	issue("i1", 1, { type_key: "initiative", type_name: "Initiative", title: "Initiative One" }),
	issue("e2", 2, { type_key: "epic", type_name: "Epic", parent_id: "i1", title: "Epic Two" }),
	issue("t3", 3, {
		parent_id: "e2",
		title: "Done Task",
		status_category: "done",
		status_key: "done",
		status_name: "Done",
	}),
	issue("t4", 4, { parent_id: "e2", title: "Open Task", priority: "high" }),
];

function mockFetch(issues: readonly Issue[] | "error" = ISSUES) {
	const fetchMock = vi.fn().mockImplementation((url: string) => {
		const u = String(url);
		if (u.includes("/api/projects")) {
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve([{ id: "p1", key: "PX", name: "Projektor X", slug: "px" }]),
			});
		}
		if (u.includes("/api/issues")) {
			if (issues === "error") {
				return Promise.resolve({
					ok: false,
					status: 500,
					json: () => Promise.resolve({ error: "boom" }),
					text: () => Promise.resolve("boom"),
				});
			}
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: issues }) });
		}
		return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

beforeEach(() => {
	__resetProjectStoreForTests();
	history.replaceState(null, "", "/x/tree?projectId=p1");
	localStorage.clear();
});

describe("IssueTree", () => {
	it("loads the whole project in one listing and shows the top level expanded", async () => {
		const fetchMock = mockFetch();
		render(<IssueTree />);
		expect(await screen.findByText("Initiative One")).toBeTruthy();
		// Default expansion: the initiative is open, so its epic is visible …
		expect(screen.getByText("Epic Two")).toBeTruthy();
		// … but the epic is collapsed, so its tasks are not.
		expect(screen.queryByText("Open Task")).toBeNull();

		const issueCalls = fetchMock.mock.calls
			.map((c) => String(c[0]))
			.filter((u) => u.includes("/api/issues"));
		expect(issueCalls).toHaveLength(1);
		expect(issueCalls[0]).toContain("project=p1");
	});

	it("shows progress over all descendants on the initiative", async () => {
		mockFetch();
		render(<IssueTree />);
		await screen.findByText("Initiative One");
		// Descendants of i1: e2 (open), t3 (done), t4 (open) → 1 of 3.
		expect(screen.getByRole("progressbar", { name: "1 of 3 done" })).toBeTruthy();
		expect(screen.getByRole("progressbar", { name: "1 of 2 done" })).toBeTruthy();
	});

	it("expands and collapses a node, and expand/collapse all", async () => {
		mockFetch();
		render(<IssueTree />);
		await screen.findByText("Epic Two");

		fireEvent.click(screen.getByRole("button", { name: "Expand PX-2" }));
		expect(screen.getByText("Open Task")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Collapse PX-2" }));
		expect(screen.queryByText("Open Task")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
		expect(screen.getByText("Open Task")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
		expect(screen.queryByText("Epic Two")).toBeNull();
	});

	it("hides closed issues with 'Open only'", async () => {
		mockFetch();
		render(<IssueTree />);
		await screen.findByText("Initiative One");
		fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
		expect(screen.getByText("Done Task")).toBeTruthy();

		fireEvent.click(screen.getByLabelText("Open only"));
		expect(screen.queryByText("Done Task")).toBeNull();
		expect(screen.getByText("Open Task")).toBeTruthy();
		expect(screen.getByText("3 of 4 issues")).toBeTruthy();
	});

	it("links titles to the existing issue page", async () => {
		mockFetch();
		render(<IssueTree />);
		const link = await screen.findByText("Initiative One");
		expect(link.closest("a")?.getAttribute("href")).toBe("/projects/PX/issues/1/initiative-one");
	});

	it("shows an empty state for a project without issues", async () => {
		mockFetch([]);
		render(<IssueTree />);
		expect(await screen.findByText("No issues yet")).toBeTruthy();
	});

	it("shows an error when the issue listing fails", async () => {
		mockFetch("error");
		render(<IssueTree />);
		expect(await screen.findByText(/Failed to load issues/)).toBeTruthy();
	});
});
