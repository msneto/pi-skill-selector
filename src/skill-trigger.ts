import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { decodeKittyPrintable } from "@earendil-works/pi-tui";

export function getDollarShortcutQuery(data: string): string | null {
	if (data.startsWith("$")) return data.slice(1);
	return decodeKittyPrintable(data) === "$" ? "" : null;
}

function getEditorText(ctx: ExtensionContext): string | null {
	if (typeof ctx.ui.getEditorText !== "function") return null;

	try {
		return ctx.ui.getEditorText();
	} catch {
		return null;
	}
}

export function isEditorEmpty(ctx: ExtensionContext): boolean {
	return getEditorText(ctx) === "";
}

export function shouldOpenDollarShortcut(ctx: ExtensionContext, lastKeyWasSpace: boolean): boolean {
	const editorText = getEditorText(ctx);
	return editorText === null ? lastKeyWasSpace : editorText === "" || /\s$/.test(editorText);
}
