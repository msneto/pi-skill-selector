import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import type {
	ExtensionAPI,
	ExtensionContext,
	MessageRenderOptions,
	ParsedSkillBlock,
	Theme,
} from "@earendil-works/pi-coding-agent";
import {
	Container,
	fuzzyFilter,
	Image,
	Spacer,
	type Component,
} from "@earendil-works/pi-tui";
import { SkillInvocationMessageComponent, UserMessageComponent } from "@earendil-works/pi-coding-agent";

/**
 * Skill discovery, prompt expansion, and Pi message glue.
 *
 * This module is the skill-specific layer above the reusable picker code.
 * It knows how to find `SKILL.md` files, expand selected skills into Pi's
 * XML-like skill blocks, and render collapsed skill invocation messages.
 */

/** A discovered Pi skill plus its provenance. */
export type SkillEntry = {
	name: string;
	description: string;
	filePath: string;
	source: "pi-user" | "agents-user" | "pi-project" | "agents-project";
};

type SkillInvocationMessageDetails = {
	blocks: ParsedSkillBlock[];
	userMessage?: string;
};

type SkillInvocationTextContent = {
	type: "text";
	text: string;
};

type SkillInvocationImageContent = {
	type: "image";
	data: string;
	mimeType: string;
};

type SkillInvocationMessageContent = string | (SkillInvocationTextContent | SkillInvocationImageContent)[];

type SkillInvocationMessage = {
	role: "custom";
	customType: string;
	content: SkillInvocationMessageContent;
	display: boolean;
	details?: SkillInvocationMessageDetails;
	timestamp: number;
};

type SelectedSkillPrompt = {
	content: string;
	details: SkillInvocationMessageDetails;
};

const SKILL_INVOCATION_MESSAGE_TYPE = "skill-selector-invocation";

function readFrontmatter(filePath: string): string | null {
	try {
		const raw = readFileSync(filePath, "utf8");
		return raw.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] ?? null;
	} catch {
		return null;
	}
}

function readFrontmatterField(frontmatter: string | null, field: string): string | null {
	if (!frontmatter) return null;
	const match = frontmatter.match(new RegExp(`^${field}:\\s*(.*)$`, "m"));
	return match?.[1]?.replace(/^["']|["']$/g, "").trim() || null;
}

function collectSkills(root: string, source: SkillEntry["source"]): SkillEntry[] {
	const skills: SkillEntry[] = [];
	if (!existsSync(root)) return skills;

	const visit = (dir: string) => {
		const skillFile = join(dir, "SKILL.md");
		if (existsSync(skillFile)) {
			const frontmatter = readFrontmatter(skillFile);
			const fallbackName = dirname(skillFile).split(/[\\/]/).pop() ?? "skill";
			skills.push({
				name: readFrontmatterField(frontmatter, "name") ?? fallbackName,
				description: readFrontmatterField(frontmatter, "description") ?? "",
				filePath: skillFile,
				source,
			});
			return;
		}

		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}

		for (const entry of entries) {
			if (entry.startsWith(".") || entry === "node_modules") continue;
			visit(join(dir, entry));
		}
	};

	visit(root);
	return skills;
}

function findRepoRoot(startDir: string): string | null {
	let current = resolve(startDir);
	while (true) {
		if (existsSync(join(current, ".git"))) return current;
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

function projectSkillDirs(cwd: string): Array<{ path: string; source: SkillEntry["source"] }> {
	const dirs: Array<{ path: string; source: SkillEntry["source"] }> = [{ path: join(cwd, ".pi", "skills"), source: "pi-project" }];
	const repoRoot = findRepoRoot(cwd);
	let current = resolve(cwd);

	while (true) {
		dirs.push({ path: join(current, ".agents", "skills"), source: "agents-project" });
		if (repoRoot && current === repoRoot) break;
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}

	return dirs;
}

/**
 * Discover skills from the current machine and project tree.
 *
 * Search order:
 * 1. `~/.pi/agent/skills`
 * 2. `~/.agents/skills`
 * 3. `<cwd>/.pi/skills`
 * 4. `<cwd>/.agents/skills` up the tree to the repo root
 *
 * Duplicate names are de-duplicated by first hit.
 *
 * @example
 * ```ts
 * const skills = discoverSkills(process.cwd());
 * ```
 */
export function discoverSkills(cwd: string, home = homedir()): SkillEntry[] {
	const sources: Array<{ path: string; source: SkillEntry["source"] }> = [
		{ path: join(home, ".pi", "agent", "skills"), source: "pi-user" },
		{ path: join(home, ".agents", "skills"), source: "agents-user" },
		...projectSkillDirs(cwd),
	];

	const seen = new Set<string>();
	const skills: SkillEntry[] = [];

	for (const source of sources) {
		for (const skill of collectSkills(source.path, source.source)) {
			if (seen.has(skill.name)) continue;
			seen.add(skill.name);
			skills.push(skill);
		}
	}

	return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Fuzzy-filter skills by name and description.
 *
 * @example
 * ```ts
 * const matches = filterSkills(skills, "git");
 * ```
 */
export function filterSkills(skills: SkillEntry[], query: string): SkillEntry[] {
	return fuzzyFilter(skills, query, (skill) => `${skill.name} ${skill.description}`);
}

function stripFrontmatter(content: string): string {
	return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
}

function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function getUniqueSortedSkills(skillEntries: SkillEntry[]): SkillEntry[] {
	return [...new Map(skillEntries.map((skill) => [skill.name, skill])).values()].sort((a, b) => a.name.localeCompare(b.name));
}

function skillInvocationBlockForEntry(skill: SkillEntry): ParsedSkillBlock {
	const body = stripFrontmatter(readFileSync(skill.filePath, "utf8")).trim();
	return {
		name: skill.name,
		location: skill.filePath,
		content: `References are relative to ${dirname(skill.filePath)}.\n\n${body}`,
		userMessage: undefined,
	};
}

function skillBlockToXml(skillBlock: ParsedSkillBlock): string {
	const name = escapeXml(skillBlock.name);
	const location = escapeXml(skillBlock.location);
	const content = escapeXml(skillBlock.content);
	return `<skill name="${name}" location="${location}">\n${content}\n</skill>`;
}

function buildSelectedSkillsPrompt(skillEntries: SkillEntry[], userText: string): SelectedSkillPrompt {
	const uniqueSkills = getUniqueSortedSkills(skillEntries);
	const skillBlocks = uniqueSkills.map(skillInvocationBlockForEntry);
	const trimmedUserText = userText.trimStart();

	return {
		content: [...skillBlocks.map(skillBlockToXml), trimmedUserText].filter(Boolean).join("\n\n"),
		details: {
			blocks: skillBlocks,
			userMessage: trimmedUserText || undefined,
		},
	};
}

/**
 * Convert a skill name into the prompt token Pi should expand later.
 *
 * @example
 * ```ts
 * skillPromptInsertion("git"); // "$git "
 * ```
 */
export function skillPromptInsertion(skillName: string): string {
	return `$${skillName} `;
}

/**
 * Insert selected skill tokens at the start of the editor text.
 *
 * Falls back to `setEditorText()` when Pi does not expose `pasteToEditor()`.
 *
 * @example
 * ```ts
 * insertSelectedSkillsAtPromptStart(ctx, ["git", "review"]);
 * ```
 */
export function insertSelectedSkillsAtPromptStart(ctx: ExtensionContext, skillNames: string[] | string): void {
	const selectedSkillNames = Array.isArray(skillNames) ? skillNames : [skillNames];
	const insertion = selectedSkillNames.map(skillPromptInsertion).join("");

	if (typeof ctx.ui.pasteToEditor === "function") {
		ctx.ui.pasteToEditor(insertion);
		return;
	}

	if (typeof ctx.ui.setEditorText === "function") {
		const currentText = typeof ctx.ui.getEditorText === "function" ? ctx.ui.getEditorText() : "";
		ctx.ui.setEditorText(`${insertion}${currentText}`);
	}
}

/**
 * Build the exact prompt body Pi should receive after skill expansion.
 *
 * The result contains `<skill ...>` blocks followed by the user's text.
 *
 * @example
 * ```ts
 * const prompt = formatSelectedSkillsPrompt([skill], "write tests");
 * ```
 */
export function formatSelectedSkillsPrompt(skillEntries: SkillEntry[], userText: string): string {
	return buildSelectedSkillsPrompt(skillEntries, userText).content;
}

function resolveSubmittedSkillSelection(text: string, skills: SkillEntry[]): SelectedSkillPrompt | null {
	const skillNames = [...new Set([...text.matchAll(/\$([A-Za-z0-9][A-Za-z0-9_-]*)/g)].map((match) => match[1]))].sort((a, b) => a.localeCompare(b));
	if (skillNames.length === 0) return null;

	const skillLookup = new Map(skills.map((skill) => [skill.name, skill]));
	const matchedSkills = skillNames
		.map((name) => skillLookup.get(name))
		.filter((skill): skill is SkillEntry => Boolean(skill));

	if (matchedSkills.length === 0) return null;
	return buildSelectedSkillsPrompt(matchedSkills, text);
}

function isImageContent(content: SkillInvocationTextContent | SkillInvocationImageContent): content is SkillInvocationImageContent {
	return content.type === "image";
}

function getImageContents(message: SkillInvocationMessage): SkillInvocationImageContent[] {
	if (!Array.isArray(message.content)) return [];
	return message.content.filter(isImageContent);
}

function renderSkillInvocationMessage(
	message: SkillInvocationMessage,
	options: MessageRenderOptions,
	theme: Theme,
): Component | undefined {
	const blocks = message.details?.blocks ?? [];
	const userMessage = message.details?.userMessage;
	const images = getImageContents(message);

	if (blocks.length === 0 && !userMessage && images.length === 0) {
		return undefined;
	}

	const container = new Container();
	let hasRenderedSection = false;

	for (const [index, block] of blocks.entries()) {
		if (hasRenderedSection) {
			container.addChild(new Spacer(1));
		}

		const skillComponent = new SkillInvocationMessageComponent(block);
		skillComponent.setExpanded(options.expanded);
		container.addChild(skillComponent);
		hasRenderedSection = true;

		if (index === blocks.length - 1 && userMessage) {
			container.addChild(new Spacer(1));
		}
	}

	if (userMessage) {
		container.addChild(new UserMessageComponent(userMessage));
		hasRenderedSection = true;
	}

	if (images.length > 0) {
		if (hasRenderedSection) {
			container.addChild(new Spacer(1));
		}

		for (const [index, image] of images.entries()) {
			if (index > 0) {
				container.addChild(new Spacer(1));
			}

			container.addChild(
				new Image(image.data, image.mimeType, {
					fallbackColor: (text: string) => theme.fg("muted", text),
				}),
			);
		}
	}

	return container;
}

/**
 * Register a renderer for collapsed skill invocation messages.
 *
 * This keeps selected skills readable in the transcript and preserves any
 * attached user text or images.
 */
export function installSkillInvocationMessageRenderer(pi: ExtensionAPI): void {
	if (typeof pi.registerMessageRenderer !== "function") {
		return;
	}

	pi.registerMessageRenderer<SkillInvocationMessageDetails>(SKILL_INVOCATION_MESSAGE_TYPE, renderSkillInvocationMessage);
}

/**
 * Convert submitted `$skill` tokens into Pi's skill invocation message shape.
 *
 * This handler runs on raw user input before the model sees the prompt.
 */
export function installSubmittedSkillMessageHandler(pi: ExtensionAPI): void {
	pi.on("input", (event, ctx) => {
		if (event.source === "extension") {
			return { action: "continue" };
		}

		const selectedSkills = resolveSubmittedSkillSelection(event.text, getCachedSkills(ctx.cwd));
		if (!selectedSkills) {
			return { action: "continue" };
		}

		const textContent: SkillInvocationTextContent = { type: "text", text: selectedSkills.content };
		const content = event.images?.length ? [textContent, ...event.images] : selectedSkills.content;

		pi.sendMessage(
			{
				customType: SKILL_INVOCATION_MESSAGE_TYPE,
				content,
				display: true,
				details: selectedSkills.details,
			},
			event.streamingBehavior
				? { triggerTurn: true, deliverAs: event.streamingBehavior }
				: { triggerTurn: true },
		);

		return { action: "handled" };
	});
}

// Cache for discovered skills to avoid repeated disk scans
let cachedSkills: SkillEntry[] | null = null;
let cachedSkillsCwd: string | null = null;

/**
 * Return cached skills for the current working directory.
 *
 * @example
 * ```ts
 * const skills = getCachedSkills(ctx.cwd);
 * ```
 */
export function getCachedSkills(cwd: string, home?: string): SkillEntry[] {
	if (cachedSkills && cachedSkillsCwd === cwd) {
		return cachedSkills;
	}
	cachedSkills = discoverSkills(cwd, home);
	cachedSkillsCwd = cwd;
	return cachedSkills;
}

/** Clear the in-memory skill discovery cache. */
export function clearSkillCache(): void {
	cachedSkills = null;
	cachedSkillsCwd = null;
}
