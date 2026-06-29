# Project learnings

- discovery: `SkillInvocationMessageComponent` reads global theme state; direct renderer tests must call `initTheme()` first or the theme proxy throws. source: codebase; scope: project-wide; persist: Skill; next: initialize theme before standalone renderer assertions.
- discovery: renderer theme-state is process-global; to verify the uninitialized-theme failure path, run the renderer in a fresh Bun process instead of the shared test process. source: codebase; scope: project-wide; persist: Skill; next: isolate that regression test with a child process.
- discovery: expanded custom skill cards render the skill name and copied content, so assertions should target the references line or name instead of expecting a markdown heading. source: codebase; scope: project-wide; persist: Skill; next: use the references text for expanded renderer checks.
- discovery: `formatSkillPickerPreview` now renders row selection with a `[ ]` token, so preview assertions should include the checkbox text after stripping ANSI. source: codebase; scope: project-wide; persist: Skill; next: keep preview snapshots aligned with the picker row format.
