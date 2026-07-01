import { deleteAllKittyImages, deleteKittyImage } from "@earendil-works/pi-tui";

type OverlayCompositeTui = {
	compositeLineAt?: (baseLine: string, overlayLine: string, startCol: number, overlayWidth: number, totalWidth: number) => string;
	render?: (width: number) => string[];
	terminal?: { write?: (data: string) => void };
	previousKittyImageIds?: Set<number>;
	__piSkillSelectorImageOverlayPatch?: boolean;
	__piSkillSelectorOriginalRender?: (width: number) => string[];
	__piSkillSelectorImageSuppressionDepth?: number;
};

const KITTY_IMAGE_SEQUENCE_PATTERN = /\u001b_G([\s\S]*?)\u001b\\/g;

function extractKittyImageIds(line: string): number[] {
	const ids: number[] = [];
	for (const match of line.matchAll(KITTY_IMAGE_SEQUENCE_PATTERN)) {
		const control = match[1]?.split(";", 1)[0] ?? "";
		const id = control
			.split(",")
			.map((part) => part.trim())
			.find((part) => part.startsWith("i="))
			?.slice(2);
		const numericId = Number(id);
		if (Number.isInteger(numericId) && numericId > 0) ids.push(numericId);
	}
	return ids;
}

function isTerminalImageLine(line: string): boolean {
	return line.includes("\u001b_G") || line.includes("\u001b]1337;File=") || line.includes("\u001bPq");
}

function blankTerminalImageLines(lines: string[], width: number): string[] {
	return lines.map((line) => isTerminalImageLine(line) ? " ".repeat(width) : line);
}

/**
 * Delete visible Kitty/iTerm-like inline images before rendering the overlay.
 */
export function clearVisibleTerminalImagesForOverlay(tui: OverlayCompositeTui): void {
	tui.terminal?.write?.(deleteAllKittyImages());
	tui.previousKittyImageIds?.clear();
}

/**
 * Temporarily blank image lines while the overlay is visible.
 *
 * Returns a restore function that should be called when the overlay closes.
 */
export function suppressTerminalImagesForOverlay(tui: OverlayCompositeTui): () => void {
	clearVisibleTerminalImagesForOverlay(tui);

	if (typeof tui.render !== "function") return () => {};

	tui.__piSkillSelectorImageSuppressionDepth = (tui.__piSkillSelectorImageSuppressionDepth ?? 0) + 1;
	if (!tui.__piSkillSelectorOriginalRender) {
		tui.__piSkillSelectorOriginalRender = tui.render.bind(tui);
		tui.render = (width) => blankTerminalImageLines(tui.__piSkillSelectorOriginalRender?.(width) ?? [], width);
	}

	let restored = false;
	return () => {
		if (restored) return;
		restored = true;
		tui.__piSkillSelectorImageSuppressionDepth = Math.max(0, (tui.__piSkillSelectorImageSuppressionDepth ?? 1) - 1);
		if (tui.__piSkillSelectorImageSuppressionDepth > 0) return;
		if (tui.__piSkillSelectorOriginalRender) {
			tui.render = tui.__piSkillSelectorOriginalRender;
			tui.__piSkillSelectorOriginalRender = undefined;
		}
	};
}

/**
 * Patch Pi's overlay compositor so terminal image rows do not bleed through.
 */
export function patchTuiImageOverlayComposite(tui: OverlayCompositeTui): void {
	clearVisibleTerminalImagesForOverlay(tui);

	if (tui.__piSkillSelectorImageOverlayPatch || typeof tui.compositeLineAt !== "function") return;

	const originalCompositeLineAt = tui.compositeLineAt.bind(tui);
	tui.compositeLineAt = (baseLine, overlayLine, startCol, overlayWidth, totalWidth) => {
		if (!isTerminalImageLine(baseLine)) {
			return originalCompositeLineAt(baseLine, overlayLine, startCol, overlayWidth, totalWidth);
		}

		const deleteSequences = extractKittyImageIds(baseLine).map((id) => deleteKittyImage(id)).join("");
		if (deleteSequences) tui.terminal?.write?.(deleteSequences);

		return originalCompositeLineAt(" ".repeat(totalWidth), overlayLine, startCol, overlayWidth, totalWidth);
	};
	tui.__piSkillSelectorImageOverlayPatch = true;
}

export type { OverlayCompositeTui };
