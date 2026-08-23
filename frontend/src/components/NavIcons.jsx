/**
 * SVG navigation icons — thay thế emoji trong header nav.
 * Mỗi icon là một React component nhận className và size.
 */

function iconProps(className, size = 20) {
    return {
        className,
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
    };
}

export function IconWordBank({ className, size }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
    );
}

export function IconGrammar({ className, size }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <path d="M4 7h6" />
            <path d="M4 12h12" />
            <path d="M4 17h4" />
            <path d="M18 7l-1.5 5l2.75 2" />
            <circle cx="16.5" cy="16" r="1.5" />
        </svg>
    );
}

export function IconFlashcard({ className, size }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <rect x="2" y="4" width="14" height="16" rx="2" />
            <path d="M16 8h4v12a2 2 0 01-2 2H8" />
            <polyline points="16,4 22,10" />
            <path d="M7 11h4" />
            <path d="M7 15h2" />
        </svg>
    );
}

export function IconHanChars({ className, size }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <path d="M5 3v18" />
            <path d="M19 3v18" />
            <path d="M12 3v18" />
            <path d="M3 7h18" />
            <path d="M3 15h18" />
        </svg>
    );
}

export function IconRadicals({ className, size }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            {/* Grid of radicals — center cell highlighted */}
            <rect x="3" y="3" width="8" height="8" rx="1" />
            <rect x="13" y="3" width="8" height="8" rx="1" />
            <rect x="3" y="13" width="8" height="8" rx="1" />
            <rect x="13" y="13" width="8" height="8" rx="1" />
            <path d="M12 2v3" />
            <path d="M22 12h-3" />
            <path d="M12 19v3" />
            <path d="M2 12h3" />
        </svg>
    );
}

export function IconPinyin({ className, size }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M12 5 14.8 8 12 11 9.2 8z" />
            <path d="M7.5 15h9" />
            <path d="M7.5 18h5.5" />
        </svg>
    );
}

export function IconJyutping({ className, size }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M7 8l2.5 3L12 8" />
            <path d="M12 8l2.5 3L17 8" />
            <path d="M9.5 11l-1 6" />
            <path d="M14.5 11l-1 6" />
        </svg>
    );
}

export function IconLookup({ className, size }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5l5 5" />
            <path d="M8 8h6" />
            <path d="M8 12h4" />
            <path d="M8 14h3" />
        </svg>
    );
}

/* ── Action icons dùng trong dropdown menu (•••) ── */

export function IconViewDetail({ className, size = 16 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

export function IconEdit({ className, size = 16 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
    );
}

export function IconTrash({ className, size = 16 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
        </svg>
    );
}

export function IconMoveTo({ className, size = 16 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <polyline points="13 17 18 12 13 7" />
            <polyline points="6 17 11 12 6 7" />
        </svg>
    );
}

/* ── General UI icons ── */

export function IconStar({ className, size = 20 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
    );
}

export function IconClose({ className, size = 20 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}

export function IconBlock({ className, size = 16 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
    );
}

export function IconMonitor({ className, size = 16 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
    );
}

export function IconScan({ className, size = 20 }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
        >
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
            <line x1="7" y1="12" x2="17" y2="12" />
        </svg>
    );
}

export function IconMenu({ className, size = 20 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
    );
}

export function IconInfo({ className, size = 16 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    );
}

export function IconGlobe({ className, size = 16 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        </svg>
    );
}

export function IconSpeech({ className, size = 16, ...rest }) {
    const p = iconProps(className, size);
    return (
        <svg {...p} {...rest}>
            <path d="M2 10v3a4 4 0 004 4h2l4 4V3l-4 4H6a4 4 0 00-4 4z" />
            <path d="M17 11a4 4 0 000-8" />
            <path d="M19 8a6 6 0 010 8" />
        </svg>
    );
}

export function IconChevronDown({ className, size = 16 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <polyline points="6 9 12 15 18 9" />
        </svg>
    );
}

export function IconChevronRight({ className, size = 16 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <polyline points="9 18 15 12 9 6" />
        </svg>
    );
}

export function IconPlus({ className, size = 16 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    );
}

export function IconPlaylistAdd({ className, size = 16 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="14" y2="18" />
            <circle cx="18" cy="18" r="3" />
            <line x1="18" y1="16.5" x2="18" y2="19.5" />
            <line x1="16.5" y1="18" x2="19.5" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
    );
}

export function IconMinus({ className, size = 16 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    );
}

export function IconBook({ className, size = 16 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            <line x1="8" y1="7" x2="16" y2="7" />
            <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
    );
}

export function IconVocab({ className, size = 16 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
    );
}

export function IconPalette({ className, size = 20 }) {
    const p = iconProps(className, size);
    return (
        <svg {...p}>
            <path d="M12 22a10 10 0 110-20c2.5 0 3 1.2 3 2.4 0 1.6-1.4 1.9-1.4 3 0 1 .8 1.6 2.4 1.6 2.9 0 4-2.3 4-4.6A10 10 0 0112 22z" />
            <circle cx="7.5" cy="10.5" r="1.2" />
            <circle cx="12" cy="7.5" r="1.2" />
            <circle cx="16.5" cy="10.5" r="1.2" />
        </svg>
    );
}
