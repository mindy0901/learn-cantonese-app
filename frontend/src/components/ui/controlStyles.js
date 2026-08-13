import { cn } from "../../lib/cn.js";

const controlShellClass = "box-border m-0 shrink-0 rounded-lg border border-border bg-card";

/** Standard 44px field shell — inputs, selects. */
export const controlBoxClass = cn(controlShellClass, "h-11 min-h-11 py-0");

/** Standard 44px button shell — matches Button size="md". */
export const controlButtonClass = cn(
    controlShellClass,
    "inline-flex h-11 min-h-11 items-center justify-center px-5 py-0",
);

export const uiSelectClass = cn(
    controlBoxClass,
    "px-4 pr-9 text-sm leading-10 text-foreground outline-none cursor-pointer transition-colors focus:border-primary/25",
);

export const uiInputClass = cn(
    controlBoxClass,
    "w-full px-4 text-sm leading-6 text-foreground outline-none transition-colors focus:border-primary/25 py-3",
);

export const uiTextareaClass = cn(
    "box-border m-0 w-full rounded-lg border border-border bg-card px-3.5 py-2.5",
    "text-sm text-foreground outline-none transition-colors focus:border-primary/25 resize-y",
);

export const uiIconButtonClass = cn(
    controlShellClass,
    "inline-flex size-9 min-h-9 min-w-9 shrink-0 items-center justify-center p-0 gap-0",
    "text-base leading-normal shadow-sm",
    "text-foreground transition-colors hover:border-primary/25 hover:bg-primary/10",
    "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
);

export const uiControlRowClass = "flex flex-wrap items-center gap-2";

/** Compact icon/emoji button — tables, modals, flags. */
export const uiCompactIconButtonClass =
    "inline-flex items-center justify-center border-0 bg-transparent p-0 leading-normal";

export const uiModalCloseButtonClass = cn(
    uiCompactIconButtonClass,
    "size-8 text-2xl text-muted-foreground rounded-md hover:bg-background",
);
