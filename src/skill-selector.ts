import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey } from "@earendil-works/pi-tui";
import { getCachedSkills, insertSelectedSkills, type SkillEntry } from "./skills.ts";
import { openPickerOverlay } from "./picker/overlay.ts";
import type { PickerItem } from "./picker/api.ts";
import { formatPickerPreview, isPickerConfirmKey, type PickerTheme } from "./picker/ui.ts";
import { getDollarShortcutQuery, shouldOpenDollarShortcut } from "./skill-trigger.ts";

/**
 * Skill-selector glue.
 *
 * This module is intentionally skill-specific. It adapts the reusable picker
 * primitives under `src/picker/` to Pi skills: discovery, overlay selection,
 * `$` shortcut handling, and prompt insertion.
 */

/**
 * Return true when the skill picker should confirm the current selection.
 *
 * This accepts both Enter and Tab to match the current overlay behavior.
 *
 * @example
 * ```ts
 * isSkillPickerConfirmKey("\r"); // true
 * isSkillPickerConfirmKey("\t"); // true
 * isSkillPickerConfirmKey("a");   // false
 * ```
 */
export function isSkillPickerConfirmKey(data: string): boolean {
	return isPickerConfirmKey(data);
}

function toSkillItems(skills: readonly SkillEntry[]): PickerItem<string>[] {
	return skills.map((skill) => ({
		value: skill.name,
		label: skill.name,
		description: skill.description || skill.source,
	}));
}

/**
 * Render a skill-picker snapshot for tests, docs, or static previews.
 *
 * @example
 * ```ts
 * const lines = formatSkillPickerPreview(skills, "git", 58);
 * ```
 */
export function formatSkillPickerPreview(skills: SkillEntry[], query: string, width = 58, selectedIndex = 0, theme?: PickerTheme): string[] {
	return formatPickerPreview(toSkillItems(skills), query, width, selectedIndex, theme, {
		title: "Skills",
		footer: "tab/enter select · ↑↓ move · esc",
	});
}

/**
 * Open the multi-select skill overlay and return the selected skill names.
 *
 * @example
 * ```ts
 * const names = await openSkillPicker(ctx, "git");
 * if (names) ctx.ui.notify(names.join(", "));
 * ```
 */
export async function openSkillPicker(ctx: ExtensionContext, initialQuery = ""): Promise<string[] | null> {
	const skills = getCachedSkills(ctx.cwd);
	if (skills.length === 0) {
		ctx.ui.notify("No Pi skills found", "warning");
		return null;
	}

	const selected = await openPickerOverlay(ctx, toSkillItems(skills), {
		mode: "multi",
		initialQuery,
		title: "Skills",
		footer: "tab toggle · enter accept · ↑↓ move · esc",
		width: 58,
		maxHeight: 18,
		maxVisible: 8,
	});

	if (!selected) return null;

	if (Array.isArray(selected)) {
		return [...selected];
	}

	return [selected as string];
}

/**
 * Install the raw terminal `$` shortcut.
 *
 * When the user types `$` at the start of a prompt (or right after a space),
 * this opens the skill overlay and pastes the selected tokens back into the
 * editor.
 *
 * @example
 * ```ts
 * pi.on("session_start", (_event, ctx) => installDollarSkillShortcut(ctx));
 * ```
 */
export function installDollarSkillShortcut(ctx: ExtensionContext): void {
	let pickerOpen = false;
	let lastKeyWasSpace = true;

	ctx.ui.onTerminalInput?.((data: string) => {
		if (pickerOpen) {
			return undefined;
		}

		const isSpace = matchesKey(data, Key.space) || matchesKey(data, Key.enter);
		const initialQuery = getDollarShortcutQuery(data);

		if (initialQuery === null) {
			lastKeyWasSpace = isSpace;
			return undefined;
		}

		if (!shouldOpenDollarShortcut(ctx, lastKeyWasSpace)) {
			lastKeyWasSpace = isSpace;
			return undefined;
		}

		pickerOpen = true;
		void openSkillPicker(ctx, initialQuery)
			.then((skillNames) => {
				if (skillNames) {
					insertSelectedSkills(ctx, skillNames);
					lastKeyWasSpace = true;
				}
			})
			.finally(() => {
				pickerOpen = false;
			});

		return { consume: true };
	});
}
