import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions } from "@earendil-works/pi-tui";

/** Picker behavior mode.
 *
 * `single` means one value is returned.
 * `multi` means the picker may return multiple values and must use overlay UI.
 */
export type PickerMode = "single" | "multi";

/** UI presentation for single-select pickers.
 *
 * Example: `inline` for editor dropdowns, `overlay` for a centered picker.
 */
export type PickerPresentation = "inline" | "overlay";

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
 * Loads and adapts picker items for a given context.
 *
 * `load()` can fetch from disk, memory, git, network, or any other source.
 * `toItem()` converts the domain object into a display item.
 */
export interface PickerSource<T> {
	load(ctx: ExtensionContext, query: string, signal: AbortSignal): Promise<readonly T[]>;
	toItem(ctx: ExtensionContext, value: T): PickerItem<T>;
}

/** Common picker configuration shared by single and multi-select flows. */
export interface PickerBaseConfig<T> {
	/** Trigger used to decide when the picker opens. */
	trigger: PickerTrigger;
	/** Source of candidate values. */
	source: PickerSource<T>;
	/** Maximum rows visible in the picker body. */
	maxVisible?: number;
}

/**
 * Single-select picker configuration.
 *
 * @example
 * ```ts
 * const config: SinglePickerConfig<string> = {
 *   mode: "single",
 *   presentation: "inline",
 *   trigger: matchToken("@"),
 *   source,
 *   insert: (value) => value,
 * };
 * ```
 */
export interface SinglePickerConfig<T> extends PickerBaseConfig<T> {
	mode: "single";
	presentation?: PickerPresentation;
	insert(value: T): string;
}

/**
 * Multi-select picker configuration.
 *
 * Multi-select is intentionally overlay-only so the user can confirm a set of
 * values before insertion.
 */
export interface MultiPickerConfig<T> extends PickerBaseConfig<T> {
	mode: "multi";
	presentation: "overlay";
	insert(values: readonly T[]): string;
}

/** Union of supported picker configurations. */
export type PickerConfig<T> = SinglePickerConfig<T> | MultiPickerConfig<T>;

/**
 * Result type for a picker configuration.
 *
 * - single-select -> one value
 * - multi-select -> readonly array of values
 */
export type PickerResult<T, C extends PickerConfig<T>> = C extends MultiPickerConfig<T> ? readonly T[] : T;

/**
 * Runtime picker adapter.
 *
 * This is the Pi-facing abstraction that can open an overlay and optionally
 * expose an autocomplete provider.
 */
export interface Picker<T, C extends PickerConfig<T>> {
	/**
	 * Open the overlay picker.
	 *
	 * @example
	 * ```ts
	 * const picked = await picker.openOverlay(ctx, { query: "git" });
	 * ```
	 */
	openOverlay(ctx: ExtensionContext, options?: { query?: string }): Promise<PickerResult<T, C> | null>;
	/**
	 * Expose the picker through Pi's autocomplete pipeline.
	 */
	asAutocompleteProvider(current: AutocompleteProvider): AutocompleteProvider;
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
export function matchToken(prefix: string, pattern = /([A-Za-z0-9][A-Za-z0-9_-]*)$/): PickerTrigger {
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

export type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions };
