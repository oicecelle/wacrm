"use client";

import { useCallback, useState } from "react";
import { HelpCircle, MessageSquareText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { HELP_LINKS } from "@/lib/help-links";
import {
  INBOX_NOTICE_POINTS,
  INBOX_NOTICE_TITLE,
  acknowledgeInboxNotice,
  hasAcknowledgedInboxNotice,
} from "@/lib/whatsapp/inbox-notice";

const storage = () => (typeof window === "undefined" ? null : window.localStorage);

/**
 * Controls the "how your inbox works" notice shown when a number gets
 * connected. `show()` opens it only if this account hasn't already
 * clicked "Entendi" (remembered per account, in this browser).
 */
export function useInboxConnectionNotice() {
  const { accountId } = useAuth();
  const [open, setOpen] = useState(false);

  const show = useCallback(() => {
    if (!hasAcknowledgedInboxNotice(storage(), accountId)) setOpen(true);
  }, [accountId]);

  const acknowledge = useCallback(() => {
    acknowledgeInboxNotice(storage(), accountId);
    setOpen(false);
  }, [accountId]);

  // Closing with Esc / a click outside is NOT "I understood": it hides the
  // notice for now without remembering anything, so it comes back next time.
  const dismiss = useCallback(() => setOpen(false), []);

  return { open, show, acknowledge, dismiss };
}

/**
 * The notice itself. Two ways out: "Entendi" (remembers it, closes) and
 * "Tirar dúvida" (opens the help page in a new tab and leaves the notice
 * as it is — a question isn't the same as having understood).
 */
export function InboxConnectionNotice({
  open,
  onAcknowledge,
  onDismiss,
}: {
  open: boolean;
  onAcknowledge: () => void;
  onDismiss: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDismiss()}>
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageSquareText className="h-4.5 w-4.5" />
            </div>
            <DialogTitle>{INBOX_NOTICE_TITLE}</DialogTitle>
          </div>
          <DialogDescription className="sr-only">Resumo de como a Caixa de Entrada funciona depois de conectar o WhatsApp.</DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 text-sm text-muted-foreground">
          {INBOX_NOTICE_POINTS.map((p) => (
            <li key={p.title}>
              <span className="font-semibold text-foreground">{p.title}</span> {p.text}
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button
            variant="outline"
            className="border-border text-foreground hover:bg-muted"
            render={<a href={HELP_LINKS.inbox} target="_blank" rel="noopener noreferrer" />}
          >
            <HelpCircle className="h-4 w-4" />
            Tirar dúvida
          </Button>
          <Button onClick={onAcknowledge}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
