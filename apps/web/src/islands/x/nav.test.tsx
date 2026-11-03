// Projektor X: our tabs (src/x/nav.ts) are appended to upstream's ProjectNav tabs and
// behave like any other tab — link, active marker, and the More overflow menu. Kept here
// rather than in ProjectNav.test.tsx so upstream's test file stays untouched.
import { fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetProjectStoreForTests } from "../../lib/project-context";
import { xProjectTabs, xSidebarItems } from "../../x/nav";
import ProjectNav from "../ProjectNav";

const PROJECT = { id: "p1", key: "PX", name: "Projektor X", slug: "px" };

function mockFetchProject() {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation((url: string) =>
			Promise.resolve({
				ok: true,
				json: () => Promise.resolve(String(url).endsWith("/api/projects") ? [PROJECT] : PROJECT),
			})
		)
	);
}

let offsetWidthDescriptor: PropertyDescriptor | undefined;
let clientWidthDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
	__resetProjectStoreForTests();
	offsetWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
	clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
});

afterEach(() => {
	if (offsetWidthDescriptor)
		Object.defineProperty(HTMLElement.prototype, "offsetWidth", offsetWidthDescriptor);
	if (clientWidthDescriptor)
		Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidthDescriptor);
});

/** Same layout stub as ProjectNav.test.tsx: jsdom computes no widths on its own. */
function stubNavMeasurements(containerWidth: number, tabWidth: number) {
	Object.defineProperty(HTMLElement.prototype, "clientWidth", {
		configurable: true,
		get(this: HTMLElement) {
			return this.getAttribute("aria-label") === "Project sections" ? containerWidth : 0;
		},
	});
	Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
		configurable: true,
		get(this: HTMLElement) {
			return this.querySelector?.("a")?.textContent?.trim() ? tabWidth : 0;
		},
	});
}

describe("Projektor X navigation", () => {
	it("registers the Tree tab and no sidebar entries yet", () => {
		expect(xProjectTabs).toEqual([{ label: "Tree", path: "/x/tree" }]);
		expect(xSidebarItems).toEqual([]);
	});

	it("renders the Tree tab after upstream's tabs, linking to /x/tree", async () => {
		window.history.pushState({}, "", "/issues?id=p1");
		mockFetchProject();
		stubNavMeasurements(2000, 80);
		render(<ProjectNav />);
		await screen.findByText("Projektor X");

		const links = screen
			.getAllByRole("link")
			.filter((a) => a.closest("[aria-label='Project sections']"))
			.map((a) => a.textContent?.trim());
		expect(links.at(-1)).toBe("Tree");
		expect(links).toContain("Feedback");
		expect(screen.getByRole("link", { name: "Tree" }).getAttribute("href")).toBe("/x/tree");
	});

	it("marks the Tree tab active on /x/tree", async () => {
		window.history.pushState({}, "", "/x/tree?projectId=p1");
		mockFetchProject();
		stubNavMeasurements(2000, 80);
		render(<ProjectNav />);
		await screen.findByText("Projektor X");
		expect(screen.getByRole("link", { name: "Tree" }).getAttribute("aria-current")).toBe("page");
		expect(screen.getByRole("link", { name: "Issues" }).getAttribute("aria-current")).toBeNull();
	});

	it("moves the Tree tab into the More menu when the nav is narrow", async () => {
		window.history.pushState({}, "", "/x/tree?projectId=p1");
		mockFetchProject();
		stubNavMeasurements(340, 90);
		render(<ProjectNav />);
		await screen.findByText("Projektor X");

		expect(screen.queryByRole("link", { name: "Tree" })).toBeNull();
		const more = screen.getByRole("button", { name: /more/i });
		expect(more.getAttribute("aria-current")).toBe("true");
		fireEvent.click(more);
		expect(screen.getByRole("menuitem", { name: "Tree" }).getAttribute("aria-current")).toBe(
			"page"
		);
	});
});
