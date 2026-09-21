"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red/destructive styling on the confirm button — the default,
   *  since this component exists mainly to replace window.confirm()
   *  calls guarding delete actions. Pass false for a neutral
   *  confirmation that isn't destructive. */
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Replaces window.confirm() — the browser's native dialog can't be
 * styled, shows the raw domain name ("app.leadpluz.com diz"), and
 * looks jarring next to the rest of the app. Same yes/no shape, just
 * rendered as one of our own dialogs.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = true,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={
                destructive
                  ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
                  : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
              }
            >
              <AlertTriangle className="h-4.5 w-4.5" />
            </div>
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription className="pt-1">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-border text-foreground hover:bg-muted"
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
