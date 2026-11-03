// Projektor X (fork the-realsitic/tim_projektor): our own navigation entries.
//
// Upstream's lists stay untouched apart from one spread each — `navItems` in
// layouts/Base.astro and `TABS` in islands/ProjectNav.tsx — so syncing with
// TAJD/projektor only ever conflicts on those two lines. Add new entries here,
// never in the upstream lists. House rules: wiki page "Projektor X: Strategie und
// Hausregeln" in project PX.

/** A tab in the per-project tab bar (ProjectNav). Same shape as upstream's TABS. */
export interface XProjectTab {
	label: string;
	path: string;
}

/**
 * A sidebar entry (Base.astro). `icon` reuses one of upstream's sidebar icons; the
 * union mirrors Base.astro's `NavIcon` so an unknown icon fails type-check.
 */
export interface XSidebarItem {
	href: string;
	label: string;
	icon: "projects" | "my-issues" | "groups" | "tokens";
}

/** Appended after upstream's project tabs. */
export const xProjectTabs: readonly XProjectTab[] = [{ label: "Tree", path: "/x/tree" }];

/** Appended after upstream's sidebar entries. Empty until we add a workspace-wide page. */
export const xSidebarItems: readonly XSidebarItem[] = [];
