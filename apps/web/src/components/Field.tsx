import { useId, type ReactElement, cloneElement } from "react";
import { Label } from "@/components/ui/label";

/** Label + control + hint. The control gets the generated id. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id} className="text-xs font-semibold text-muted-foreground">
        {label}
      </Label>
      {cloneElement(children, { id })}
      {hint !== undefined && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
