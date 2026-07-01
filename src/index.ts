import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { installDollarSkillShortcut, openSkillPicker } from "./skill-selector.ts";
import { installSkillInvocationMessageRenderer, installSubmittedSkillMessageHandler, insertSelectedSkillsAtPromptStart } from "./skills.ts";

export * from "./picker/index.ts";
export * from "./skill-selector.ts";
export {
	clearSkillCache,
	discoverSkills,
	filterSkills,
	formatSelectedSkillsPrompt,
	getCachedSkills,
	installSkillInvocationMessageRenderer,
	installSubmittedSkillMessageHandler,
	insertSelectedSkillsAtPromptStart,
	skillPromptInsertion,
	type SkillEntry,
} from "./skills.ts";

export default function extension(pi: ExtensionAPI): void {
	installSkillInvocationMessageRenderer(pi);
	installSubmittedSkillMessageHandler(pi);

	pi.on("session_start", (_event, ctx) => {
		installDollarSkillShortcut(ctx);
	});

	pi.registerCommand("skill-selector", {
		description: "Fuzzy-pick skills and insert $tokens into the prompt",
		handler: async (args, ctx) => {
			const skillNames = await openSkillPicker(ctx, args.trim());
			if (skillNames) {
				insertSelectedSkillsAtPromptStart(ctx, skillNames);
			}
		},
	});
}
