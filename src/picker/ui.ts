import { Input, Key, fuzzyFilter, matchesKey, truncateToWidth, visibleWidth, type Component, type Focusable } from "@earendil-works/pi-tui";

import type { PickerItem, PickerMode } from "./api.ts";

/** Theme surface used by picker rendering helpers. */
export type PickerThemeBg = "selectedBg" | "userMessageBg" | "customMessageBg" | "toolPendingBg" | "toolSuccessBg" | "toolErrorBg";

/** Theme adapter passed from Pi into picker rendering. */
export type PickerTheme = {
	bold(text: string): string;
	fg(color: string, text: string): string;
	bg?(color: PickerThemeBg, text: string): string;
	getBgAnsi?(color: PickerThemeBg): string;
	getColorMode?(): "truecolor" | "256color";
};

type Rgb = { r: number; g: number; b: number };

/** Minimum width used by the picker card layout. */
export const PICKER_PANEL_MIN_WIDTH = 44;
/** Maximum width used by the picker card layout. */
export const PICKER_PANEL_MAX_WIDTH = 58;

/** Input for the generic bordered panel formatter. */
export type PickerPanelOptions = {
	width: number;
	title: string;
	subtitle: string;
	body: string[];
	footer: string;
	styleSurface: (text: string) => string;
	styleBorder: (text: string) => string;
	styleAccentBorder: (text: string) => string;
	styleTitle: (text: string) => string;
	styleMuted: (text: string) => string;
};

/** Extra options for preview rendering helpers. */
export type PickerPreviewOptions = {
	title?: string;
	footer?: string;
	maxVisible?: number;
	selectedValues?: readonly unknown[];
};

function fitVisible(text: string, width: number): string {
	return truncateToWidth(text, Math.max(width, 0), "…");
}

function parseTruecolorBg(ansi: string | undefined): Rgb | null {
	const match = ansi?.match(/\u001b\[48;2;(\d+);(\d+);(\d+)m/);
	if (!match) return null;
	return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

function luminance(color: Rgb): number {
	return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
}

function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
	return {
		r: Math.round(from.r + (to.r - from.r) * amount),
		g: Math.round(from.g + (to.g - from.g) * amount),
		b: Math.round(from.b + (to.b - from.b) * amount),
	};
}

function truecolorFg(color: Rgb, text: string): string {
	return `\u001b[38;2;${color.r};${color.g};${color.b}m${text}\u001b[39m`;
}

function safeBg(theme: PickerTheme, color: PickerThemeBg, text: string): string {
	try {
		return theme.bg?.(color, text) ?? text;
	} catch {
		return text;
	}
}

function cardBorderStyle(theme: PickerTheme, surface: PickerThemeBg): (text: string) => string {
	const surfaceRgb = theme.getColorMode?.() === "truecolor" ? parseTruecolorBg(theme.getBgAnsi?.(surface)) : null;
	if (!surfaceRgb) return (text) => theme.fg("border", text);

	const target = luminance(surfaceRgb) > 0.55 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
	const border = mixRgb(surfaceRgb, target, 0.45);
	return (text) => truecolorFg(border, text);
}

function panelBorderLine(
	left: string,
	label: string,
	right: string,
	width: number,
	styleBorder: (text: string) => string,
	styleLabel: (text: string) => string,
): string {
	const safeLabel = fitVisible(label, Math.max(width - 6, 0));
	if (!safeLabel) return styleBorder(`${left}${"─".repeat(Math.max(width - 2, 0))}${right}`);

	const prefix = `${left}─ `;
	const suffixStart = " ";
	const fillWidth = Math.max(width - visibleWidth(prefix) - visibleWidth(safeLabel) - visibleWidth(suffixStart) - visibleWidth(right), 0);
	const suffix = `${suffixStart}${"─".repeat(fillWidth)}${right}`;
	return `${styleBorder(prefix)}${styleLabel(safeLabel)}${styleBorder(suffix)}`;
}

function panelRow(content: string, width: number, styleBorder: (text: string) => string, styleContent: (text: string) => string): string {
	const innerWidth = Math.max(width - 4, 0);
	const visible = truncateToWidth(content, innerWidth, "…");
	const padding = " ".repeat(Math.max(innerWidth - visibleWidth(visible), 0));
	return `${styleBorder("│ ")}${styleContent(visible)}${padding}${styleBorder(" │")}`;
}

/**
 * Render a bordered card using the picker's theme-aware layout rules.
 *
 * @example
 * ```ts
 * const lines = formatPickerPanel({
 *   width: 50,
 *   title: "Picker",
 *   subtitle: "3 items",
 *   body: ["Search", "> sk"],
 *   footer: "enter select",
 *   styleSurface: (s) => s,
 *   styleBorder: (s) => s,
 *   styleAccentBorder: (s) => s,
 *   styleTitle: (s) => s,
 *   styleMuted: (s) => s,
 * });
 * ```
 */
export function formatPickerPanel(options: PickerPanelOptions): string[] {
	const width = Math.max(Math.floor(options.width), PICKER_PANEL_MIN_WIDTH);
	const rows = [
		panelBorderLine("╭", options.title, "╮", width, options.styleAccentBorder, options.styleTitle),
		panelRow(options.subtitle, width, options.styleBorder, options.styleMuted),
		panelBorderLine("├", "", "┤", width, options.styleBorder, options.styleBorder),
		...options.body.map((line) => panelRow(line, width, options.styleBorder, (text) => text)),
		panelBorderLine("╰", options.footer, "╯", width, options.styleAccentBorder, options.styleMuted),
	];

	return rows.map(options.styleSurface);
}

/**
 * Backward-compatible alias for the skill selector preview/card renderer.
 *
 * Prefer {@link formatPickerPanel} for new picker code.
 */
export function formatSkillPickerPanel(options: PickerPanelOptions): string[] {
	return formatPickerPanel(options);
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, max));
}

function padVisible(text: string, width: number): string {
	return `${text}${" ".repeat(Math.max(width - visibleWidth(text), 0))}`;
}

function identityText(text: string): string {
	return text;
}

function truncateLinesToWidth(lines: string[], width: number): string[] {
	return lines.map((line) => truncateToWidth(line, width, ""));
}

function createPickerPanelStyles(theme: PickerTheme, styled: boolean) {
	const surface = "toolPendingBg" as const;
	const border = styled ? cardBorderStyle(theme, surface) : identityText;

	return {
		styleSurface: styled ? (text: string) => safeBg(theme, surface, text) : identityText,
		styleBorder: border,
		styleAccentBorder: border,
		styleTitle: styled ? (text: string) => theme.fg("accent", theme.bold(text)) : identityText,
		styleMuted: styled ? (text: string) => theme.fg("muted", text) : identityText,
	};
}

function formatPickerRow<T>(
	item: PickerItem<T>,
	width: number,
	selected: boolean,
	chosen: boolean,
	theme: PickerTheme,
): string {
	const status = chosen ? "[x]" : "[ ]";
	const nameWidth = Math.max(width - 7, 1);
	const rawLabel = fitVisible(item.label, nameWidth);
	const row = padVisible(`  ${status} ${rawLabel}`, width);
	const selectedRow = selected ? theme.fg("accent", `› ${row.slice(2)}`) : row;
	return selected && theme.bg ? theme.bg("selectedBg", selectedRow) : selectedRow;
}

function formatSelectedItemDescription<T>(item: PickerItem<T> | undefined, width: number, theme: PickerTheme): string[] {
	if (!item) return [];
	const description = item.description ?? "";
	return description ? ["", theme.fg("dim", fitVisible(description, width))] : [];
}

/**
 * Fuzzy-filter picker items by label and description.
 */
export function filterPickerItems<T>(items: readonly PickerItem<T>[], query: string): PickerItem<T>[] {
	return fuzzyFilter([...items], query, (item) => `${item.label} ${item.description ?? ""}`.trim());
}

function formatPickerRows<T>(
	items: readonly PickerItem<T>[],
	selectedIndex: number,
	width: number,
	theme: PickerTheme,
	selectedValues: Set<T>,
	maxVisible: number,
): string[] {
	if (items.length === 0) {
		return [theme.fg("warning", "  No matching items")];
	}

	const visibleCount = Math.min(items.length, maxVisible);
	const normalizedSelectedIndex = clamp(selectedIndex, 0, items.length - 1);
	const startIndex = clamp(normalizedSelectedIndex - Math.floor(visibleCount / 2), 0, Math.max(items.length - visibleCount, 0));
	const endIndex = Math.min(startIndex + visibleCount, items.length);
	const rows = items.slice(startIndex, endIndex).map((item, offset) => {
		const index = startIndex + offset;
		return formatPickerRow(item, width, index === normalizedSelectedIndex, selectedValues.has(item.value), theme);
	});

	if (items.length > visibleCount) {
		rows.push(theme.fg("dim", `  ${normalizedSelectedIndex + 1}/${items.length}`));
	}

	rows.push(...formatSelectedItemDescription(items[normalizedSelectedIndex], width, theme));
	return rows;
}

function renderPickerCard(
	width: number,
	title: string,
	subtitle: string,
	body: string[],
	footer: string,
	theme: PickerTheme,
	styled: boolean,
): string[] {
	const panelWidth = clamp(Math.floor(width), PICKER_PANEL_MIN_WIDTH, PICKER_PANEL_MAX_WIDTH);
	return formatPickerPanel({
		width: panelWidth,
		title,
		subtitle,
		body,
		footer,
		...createPickerPanelStyles(theme, styled),
	});
}

function plainPickerTheme(): PickerTheme {
	return {
		bold: identityText,
		fg: (_color, text) => text,
		bg: (_color, text) => text,
		getColorMode: () => "256color",
	};
}

/**
 * Render a searchable picker preview for snapshots or static help text.
 *
 * @example
 * ```ts
 * const preview = formatPickerPreview(items, "git", 58, 0, theme, {
 *   title: "Issues",
 *   footer: "enter select",
 * });
 * ```
 */
export function formatPickerPreview<T>(
	items: readonly PickerItem<T>[],
	query: string,
	width = PICKER_PANEL_MAX_WIDTH,
	selectedIndex = 0,
	theme?: PickerTheme,
	options?: PickerPreviewOptions,
): string[] {
	const filtered = filterPickerItems(items, query);
	const panelWidth = clamp(Math.floor(width), PICKER_PANEL_MIN_WIDTH, PICKER_PANEL_MAX_WIDTH);
	const bodyWidth = Math.max(panelWidth - 4, 1);
	const queryLabel = query ? `matching "${query}"` : "type to filter";
	const title = options?.title ?? "Picker";
	const footer = options?.footer ?? "tab/enter select · ↑↓ move · esc";
	const selectedValues = new Set<T>(options?.selectedValues as readonly T[] | undefined);
	const body = truncateLinesToWidth(["Search", `> ${query}`, "", ...formatPickerRows(filtered, selectedIndex, bodyWidth, theme ?? plainPickerTheme(), selectedValues, options?.maxVisible ?? 8)], bodyWidth);

	return renderPickerCard(panelWidth, title, `${filtered.length}/${items.length} · ${queryLabel}`, body, footer, theme ?? plainPickerTheme(), Boolean(theme));
}

/**
 * Return true when a key should confirm the current picker selection.
 *
 * Both Enter and Tab are treated as confirmation keys.
 */
export function isPickerConfirmKey(data: string): boolean {
	return matchesKey(data, Key.enter) || matchesKey(data, Key.tab);
}

/**
 * Interactive picker overlay component.
 *
 * Supports single-select and multi-select flows, keyboard navigation, and
 * fuzzy filtering against the provided items.
 */
export class PickerListComponent<T> implements Component, Focusable {
	private readonly input = new Input();
	private query: string;
	private filtered: PickerItem<T>[];
	private selectedIndex = 0;
	private selectedValues = new Set<T>();
	private _focused = false;

	/**
	 * Create an interactive picker list component.
	 *
	 * The component is usually hosted by {@link openPickerOverlay}.
	 */
	constructor(
		private readonly items: readonly PickerItem<T>[],
		initialQuery: string,
		private readonly theme: PickerTheme,
		private readonly done: (value: readonly T[] | T | null) => void,
		private readonly mode: PickerMode,
		private readonly title = "Picker",
		private readonly footer = "tab/enter select · ↑↓ move · esc",
		private readonly maxVisible = 8,
	) {
		this.query = initialQuery;
		this.input.setValue(initialQuery);
		this.filtered = filterPickerItems(items, initialQuery);
	}

	get focused() {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = value;
	}

	/** Render the picker for the provided terminal width. */
	render(width: number): string[] {
		const panelWidth = clamp(Math.floor(width), PICKER_PANEL_MIN_WIDTH, PICKER_PANEL_MAX_WIDTH);
		const bodyWidth = Math.max(panelWidth - 4, 1);
		const queryLabel = this.query ? `matching "${this.query}"` : "type to filter";
		const body = truncateLinesToWidth([
			this.theme.fg("dim", "Search"),
			...this.input.render(bodyWidth),
			"",
			...formatPickerRows(this.filtered, this.selectedIndex, bodyWidth, this.theme, this.selectedValues, this.maxVisible),
		], bodyWidth);

		return renderPickerCard(panelWidth, this.title, `${this.filtered.length}/${this.items.length} · ${queryLabel}`, body, this.footer, this.theme, true);
	}

	/** Handle keyboard input while the picker has focus. */
	handleInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			this.done(null);
			return;
		}

		if (matchesKey(data, Key.tab)) {
			if (this.mode === "multi") {
				this.toggleCurrentItem();
				return;
			}
			this.selectCurrentItem();
			return;
		}

		if (matchesKey(data, Key.up)) {
			this.moveSelection(-1);
			return;
		}

		if (matchesKey(data, Key.down)) {
			this.moveSelection(1);
			return;
		}

		if (isPickerConfirmKey(data)) {
			this.selectCurrentItem();
			return;
		}

		this.input.handleInput(data);
		const nextQuery = this.input.getValue();
		if (nextQuery !== this.query) {
			this.query = nextQuery;
			this.filtered = filterPickerItems(this.items, this.query);
			this.selectedIndex = 0;
		}
	}

	/** Clear cached editor state after theme or layout changes. */
	invalidate(): void {
		this.input.invalidate();
	}

	private moveSelection(delta: number): void {
		if (this.filtered.length === 0) return;
		this.selectedIndex = (this.selectedIndex + delta + this.filtered.length) % this.filtered.length;
	}

	private toggleCurrentItem(): void {
		if (this.mode !== "multi") return;
		const item = this.filtered[this.selectedIndex];
		if (!item || item.disabled) return;
		if (this.selectedValues.has(item.value)) this.selectedValues.delete(item.value);
		else this.selectedValues.add(item.value);
	}

	private selectCurrentItem(): void {
		const item = this.filtered[this.selectedIndex];
		if (!item || item.disabled) return;

		if (this.mode === "multi") {
			const selected = [...this.selectedValues];
			if (selected.length === 0) {
				selected.push(item.value);
			}
			this.done(selected);
			return;
		}

		this.done(item.value);
	}
}
