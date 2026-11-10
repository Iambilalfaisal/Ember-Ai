import type { ReactNode } from "react";

export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className="scroll-mt-20 pb-8">
      <h2 id={`${id}-title`} className="mb-2 text-2xl text-coal">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Component({
  name,
  note,
  children,
}: {
  name: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="pt-6">
      <h3 className="text-lg text-coal">{name}</h3>
      {note ? <p className="mt-1 max-w-[72ch] text-sm text-smoke">{note}</p> : null}
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** One named state of a component, on a line of its own. */
export function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-cinder py-4 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-6">
      <p className="text-detail text-smoke">{label}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
