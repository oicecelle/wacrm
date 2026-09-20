import Link from "next/link";
import { FileQuestion, Home, MessageCircle } from "lucide-react";

const SUPPORT_WHATSAPP = "5521990525962";

export default function RootNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-white px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100">
        <FileQuestion className="h-7 w-7 text-neutral-400" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-lg font-bold text-neutral-800">Página não encontrada</h1>
        <p className="max-w-sm text-sm text-neutral-500">
          O endereço que você tentou abrir não existe ou foi movido. Desculpe pelo transtorno.
        </p>
      </div>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
        >
          <Home className="h-4 w-4" />
          Página inicial
        </Link>
        <a
          href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent("Olá! Caí numa página que não existe no sistema. Poderia me ajudar?")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          Falar com o suporte
        </a>
      </div>
    </div>
  );
}
