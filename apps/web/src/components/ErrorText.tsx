import { CircleAlert } from "lucide-react";

export function ErrorText({ error }: { error: string | null }) {
  return error === null ? null : (
    <p
      role="alert"
      className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      <CircleAlert className="size-4 shrink-0" />
      {error}
    </p>
  );
}
