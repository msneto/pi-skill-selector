import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import type { PickerItem, PickerMode } from "./api.ts";
import { patchTuiImageOverlayComposite, suppressTerminalImagesForOverlay, type OverlayCompositeTui } from "./images.ts";
import { PickerListComponent } from "./ui.ts";

/** Options for the overlay picker host. */
export type PickerOverlayOptions = {
	/** Picker mode. Multi-select should pass `"multi"`. */
	mode: PickerMode;
	/** Initial query prefilled into the search box. */
	initialQuery?: string;
	/** Panel title shown in the top border. */
	title?: string;
	/** Footer hint text. */
	footer?: string;
	/** Overlay width in columns. */
	width?: number;
	/** Maximum overlay height in rows. */
	maxHeight?: number;
	/** Maximum rows visible inside the list. */
	maxVisible?: number;
};

/**
 * Open a picker in Pi's centered overlay UI.
 *
 * @example
 * ```ts
 * const picked = await openPickerOverlay(ctx, items, {
 *   mode: "multi",
 *   title: "Skills",
 *   initialQuery: "git",
 * });
 * ```
 */
export async function openPickerOverlay<T>(
	ctx: ExtensionContext,
	items: readonly PickerItem<T>[],
	options: PickerOverlayOptions,
): Promise<readonly T[] | T | null> {
	let restoreImageRendering = () => {};
	const width = options.width ?? 58;
	const maxHeight = options.maxHeight ?? 18;
	const title = options.title ?? "Picker";
	const footer = options.footer ?? "tab/enter select · ↑↓ move · esc";
	const initialQuery = options.initialQuery ?? "";
	const maxVisible = options.maxVisible ?? 8;

	try {
		return await ctx.ui.custom<readonly T[] | T | null>(
			(tui, theme, _keybindings, done) => {
				const imageSafeTui = tui as unknown as OverlayCompositeTui;
				patchTuiImageOverlayComposite(imageSafeTui);
				restoreImageRendering = suppressTerminalImagesForOverlay(imageSafeTui);
				return new PickerListComponent(items, initialQuery, theme, (result) => {
					restoreImageRendering();
					done(result);
				}, options.mode, title, footer, maxVisible);
			},
			{
				overlay: true,
				overlayOptions: {
					anchor: "center",
					width,
					maxHeight,
				},
			},
		);
	} finally {
		restoreImageRendering();
	}
}
