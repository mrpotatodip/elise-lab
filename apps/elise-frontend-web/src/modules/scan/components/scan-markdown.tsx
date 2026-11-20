import { Markdown, type MarkdownComponents } from "@tanstack/markdown/react";

// -----
// A scan's written report, rendered with TanStack Markdown. The text comes from
// an AI that read untrusted code, so raw HTML stays off (the package default)
// and every link opens outside the app with no opener. The app has no prose
// plugin, so each element takes its look from the design tokens here.
// -----
const components = {
  h1: ({ children, ...props }) => (
    <h2 {...props} className="mt-2 text-xl font-semibold tracking-tight first:mt-0">
      {children}
    </h2>
  ),
  h2: ({ children, ...props }) => (
    <h3 {...props} className="mt-8 border-b pb-2 text-base font-semibold first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children, ...props }) => (
    <h4 {...props} className="mt-6 text-[15px] font-semibold">
      {children}
    </h4>
  ),
  h4: ({ children, ...props }) => (
    <h5 {...props} className="mt-4 text-sm font-semibold">
      {children}
    </h5>
  ),
  p: (props) => <p {...props} className="mt-3 max-w-copy text-sm leading-relaxed" />,
  ul: (props) => <ul {...props} className="mt-3 grid max-w-copy list-disc gap-1.5 pl-5 text-sm leading-relaxed" />,
  ol: (props) => <ol {...props} className="mt-3 grid max-w-copy list-decimal gap-1.5 pl-5 text-sm leading-relaxed" />,
  blockquote: (props) => <blockquote {...props} className="mt-3 max-w-copy border-l-2 pl-4 text-sm leading-relaxed text-muted-foreground" />,
  hr: (props) => <hr {...props} className="my-6" />,
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer nofollow" className="font-medium underline underline-offset-4 hover:text-foreground">
      {children}
    </a>
  ),
  code: (props) => <code {...props} className="rounded bg-muted px-1 py-0.5 font-mono text-[13px] [overflow-wrap:anywhere]" />,
  pre: (props) => <pre {...props} className="mt-3 overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-[13px] leading-relaxed [&_code]:bg-transparent [&_code]:p-0" />,
  table: (props) => (
    <div className="mt-4 overflow-x-auto rounded-md border">
      <table {...props} className="w-full text-left text-sm" />
    </div>
  ),
  th: (props) => <th {...props} className="border-b bg-muted/50 px-3 py-2 align-bottom text-xs font-medium uppercase tracking-wide text-muted-foreground [overflow-wrap:normal] [word-break:normal]" />,
  td: (props) => <td {...props} className="border-b px-3 py-2 align-top leading-relaxed [overflow-wrap:normal] [word-break:normal] [tr:last-child_&]:border-b-0" />,
} satisfies MarkdownComponents;

export function ScanMarkdown({ source }: { source: string }) {
  return (
    <article className="max-h-[70vh] overflow-auto bg-background/50 px-6 py-5">
      <Markdown components={components}>{source}</Markdown>
    </article>
  );
}
