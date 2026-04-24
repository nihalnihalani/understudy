// TRUE-style section header: numbered tag (with rotated diamond) +
// italic display title (amber `<em>` for emphasis) + right-aligned mono meta.

import type { ReactNode } from "react";

interface SectionProps {
  tag: string;
  title: ReactNode;
  meta?: string;
  children: ReactNode;
  id?: string;
}

export function Section({ tag, title, meta, children, id }: SectionProps) {
  return (
    <section id={id} className="border-t border-border-subtle pt-10 pb-2 first:border-t-0 first:pt-0">
      <header className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-x-5 gap-y-2 items-end mb-7">
        <div className="section-tag">{tag}</div>
        <h2 className="section-title">{title}</h2>
        {meta && <div className="section-meta">{meta}</div>}
      </header>
      {children}
    </section>
  );
}
