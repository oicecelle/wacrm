import Link from "next/link";
import { FileQuestion, Home, MessageCircle } from "lucide-react";

const SUPPORT_WHATSAPP = "5521990525962";

export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <FileQuestion className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-lg font-bold text-foreground">Página não encontrada</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          A página que você tentou abrir não existe ou foi movida. Desculpe pelo transtorno.
        </p>
      </div>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <Link
          href="/agenda"
          className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
        >
          <Home className="h-4 w-4" />
          Voltar ao início
        </Link>
        <a
          href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent("Olá! Caí numa página que não existe no sistema. Poderia me ajudar?")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          Falar com o suporte
        </a>
      </div>
    </div>
  );
}
