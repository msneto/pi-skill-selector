/** Picker behavior mode.
 *
 * `single` means one value is returned.
 * `multi` means the picker may return multiple values and must use overlay UI.
 */
export type PickerMode = "single" | "multi";

/**
 * Result of matching a trigger against text before the cursor.
 */
export interface PickerMatch {
	/** Text that should be replaced by the picker result. */
	prefix: string;
	/** Normalized query extracted from the trigger. */
	query: string;
}

/**
 * Defines when a picker should open.
 *
 * Implementations usually inspect the text before the cursor and return the
 * replacement prefix plus the current query.
 *
 * @example
 * ```ts
 * const trigger: PickerTrigger = matchToken("$");
 * ```
 */
export interface PickerTrigger {
	match(beforeCursor: string): PickerMatch | null;
}

/**
 * A selectable item shown by a picker.
 *
 * @template T - The underlying value returned when the item is chosen.
 */
export interface PickerItem<T = unknown> {
	/** Value returned to the caller. */
	value: T;
	/** Primary label shown in the list. */
	label: string;
	/** Optional secondary text shown under or beside the label. */
	description?: string;
	/** Optional preview text used by richer UIs. */
	preview?: string;
	/** Set to true to keep the item visible but not selectable. */
	disabled?: boolean;
}

/**
 * Build a trigger that opens when the cursor is directly after a prefix.
 *
 * @example
 * ```ts
 * const trigger = matchPrefix("$");
 * // "hello $" -> { prefix: "$", query: "" }
 * ```
 */
export function matchPrefix(prefix: string): PickerTrigger {
	return {
		match(beforeCursor: string): PickerMatch | null {
			if (!beforeCursor.endsWith(prefix)) return null;
			return { prefix, query: "" };
		},
	};
}

/**
 * Build a trigger that matches a token after a prefix.
 *
 * Useful for syntax like `$skill`, `@file`, or `#issue-123`.
 *
 * @example
 * ```ts
 * const trigger = matchToken("$");
 * // "use $sk" -> { prefix: "$sk", query: "sk" }
 * ```
 */
export function matchToken(prefix: string, pattern = /^([A-Za-z0-9][A-Za-z0-9_-]*)?$/): PickerTrigger {
	return {
		match(beforeCursor: string): PickerMatch | null {
			const triggerIndex = beforeCursor.lastIndexOf(prefix);
			if (triggerIndex < 0) return null;

			const afterPrefix = beforeCursor.slice(triggerIndex + prefix.length);
			const match = afterPrefix.match(pattern);
			if (!match) return null;

			const query = match[1] ?? "";
			return { prefix: `${prefix}${query}`, query };
		},
	};
}

