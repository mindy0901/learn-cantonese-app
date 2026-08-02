import Markdown from "react-markdown";

const markdownComponents = {
    p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold text-text-h">{children}</strong>,
    em: ({ children }) => <em className="italic text-text-muted">{children}</em>,
    ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
    ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    code: ({ children, className }) => {
        const isInline = !className;
        if (isInline) {
            return (
                <code className="rounded bg-accent/10 px-1.5 py-0.5 text-[0.8125rem] font-mono text-accent">
                    {children}
                </code>
            );
        }
        return (
            <pre className="my-2 rounded-lg bg-bg/80 border border-border p-3 overflow-x-auto">
                <code className="text-[0.8125rem] font-mono text-text">{children}</code>
            </pre>
        );
    },
    blockquote: ({ children }) => (
        <blockquote className="my-1 border-l-2 border-accent/40 pl-3 text-text-muted italic">
            {children}
        </blockquote>
    ),
    hr: () => <hr className="my-2 border-border" />,
    h1: ({ children }) => <h1 className="text-base font-semibold text-text-h mt-2 mb-1">{children}</h1>,
    h2: ({ children }) => <h2 className="text-sm font-semibold text-text-h mt-2 mb-1">{children}</h2>,
    h3: ({ children }) => <h3 className="text-[0.8125rem] font-semibold text-text-h mt-1.5 mb-0.5">{children}</h3>,
    a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2 hover:text-accent-hover">
            {children}
        </a>
    ),
};

export default function MarkdownText({ children, className = "" }) {
    if (!children || typeof children !== "string") return null;
    return (
        <div className={className}>
            <Markdown components={markdownComponents}>{children}</Markdown>
        </div>
    );
}
