import { EmptyState } from "@ember/ui";

/**
 * Stands in for a screen until it is built. It says so plainly, so a client never mistakes it for
 * the finished product. Each build step replaces one of these with the real screen.
 */
export function RoutePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <EmptyState
      title={`${title} isn't built yet`}
      description={`${description} It arrives in a later build step.`}
    />
  );
}
