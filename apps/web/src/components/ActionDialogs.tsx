import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "./Field";

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Asks for a date (payment, encaissement) before running the action. */
export function DateDialog({
  trigger,
  title,
  description,
  label,
  confirm,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  label: string;
  confirm: string;
  onConfirm: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(todayIso());
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(day);
            setOpen(false);
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-serif">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <Field label={label}>
            <Input
              type="date"
              required
              value={day}
              onChange={(e) => {
                setDay(e.target.value);
              }}
            />
          </Field>
          <DialogFooter>
            <Button type="submit">{confirm}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmation before an irreversible action (delete). */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirm,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirm: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false);
            }}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
          >
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
