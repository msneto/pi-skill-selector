import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { decodeKittyPrintable } from "@earendil-works/pi-tui";

export function getDollarShortcutQuery(data: string): string | null {
	if (data.startsWith("$")) return data.slice(1);
	return decodeKittyPrintable(data) === "$" ? "" : null;
}

export function isEditorEmpty(ctx: ExtensionContext): boolean {
	if (typeof ctx.ui.getEditorText !== "function") return false;

	try {
		return ctx.ui.getEditorText() === "";
	} catch {
		return false;
	}
}

export function shouldOpenDollarShortcut(ctx: ExtensionContext, lastKeyWasSpace: boolean): boolean {
	return lastKeyWasSpace || isEditorEmpty(ctx);
}
