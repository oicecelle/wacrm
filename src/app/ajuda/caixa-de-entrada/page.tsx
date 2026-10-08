import Link from "next/link";

export const metadata = { title: "Como funciona a Caixa de Entrada" };

export default function AjudaCaixaDeEntradaPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed text-foreground">
      <h1 className="mb-4 text-2xl font-semibold">Como funciona a Caixa de Entrada</h1>

      <h2 className="mt-6 mb-2 text-lg font-semibold">Mensagens novas</h2>
      <p>
        Tudo que chega ou sai pelo WhatsApp conectado aparece aqui na hora, inclusive o que você
        escreve direto pelo celular. Mensagens enviadas pelo sistema e pelo celular ficam na mesma
        conversa, sem repetir.
      </p>

      <h2 className="mt-6 mb-2 text-lg font-semibold">Mensagens antigas</h2>
      <p>
        Ao conectar o número, o sistema importa o histórico que o WhatsApp entrega, que costuma
        cobrir os últimos dias. Para ver mais para trás numa conversa, use{" "}
        <strong>Carregar mensagens anteriores</strong> no topo dela. O WhatsApp não garante entregar
        todo o histórico, então conversas muito antigas podem vir incompletas.
      </p>

      <h2 className="mt-6 mb-2 text-lg font-semibold">Etiquetas do WhatsApp e Tags do CRM</h2>
      <p>
        <strong>Etiquetas do WhatsApp</strong> são as do WhatsApp Business no celular e ficam
        sincronizadas com ele. <strong>Tags do CRM</strong> são só do sistema e servem para
        filtros, automações e disparos. Uma não substitui a outra.
      </p>

      <h2 className="mt-6 mb-2 text-lg font-semibold">Aviso de WhatsApp desconectado</h2>
      <p>
        O aviso aparece quando a conexão com o número caiu. Antes de mostrá-lo, o sistema confere
        com o provedor. Se o aviso persistir, reconecte em Configurações.
      </p>

      <p className="mt-8">
        <Link href="/inbox" className="text-primary underline">
          Voltar para a Caixa de Entrada
        </Link>
      </p>
    </main>
  );
}
