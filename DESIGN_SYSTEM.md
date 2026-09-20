# Design System — LeadPluz

Levantado a partir do que já é dominante no próprio código (não inventado do
zero) — a ideia é que tudo novo siga isso, e que o que já existe vá
convergindo pra cá aos poucos, sem quebrar nada de uma vez.

**Regra de ouro: sempre usar os tokens de cor/tema, nunca cor do Tailwind
direto.** O sistema já tem modo claro/escuro e um seletor de cor de destaque
(Configurações → Aparência). Uma cor "direta" como `bg-blue-600` ou
`border-neutral-200` ignora os dois — é por isso que algumas telas mudam de
cor com o tema e outras não. Isso é achado real: `bg-primary` aparece 153
vezes no código contra 92 de `bg-blue-600` fazendo a mesma coisa visualmente
hoje (porque a cor padrão do sistema é azul), mas só o primeiro respeita o
tema.

## Cores (sempre via token)

| Uso | Classe | Nunca use |
|---|---|---|
| Fundo de página | `bg-background` | `bg-white`, `bg-neutral-50` |
| Fundo de card | `bg-card` | `bg-white` |
| Fundo de área neutra (dentro de um card) | `bg-muted` | `bg-neutral-50`, `bg-neutral-100` |
| Texto principal | `text-foreground` | `text-neutral-900`, `text-neutral-800` |
| Texto secundário/legenda | `text-muted-foreground` | `text-neutral-500`, `text-neutral-400` |
| Borda padrão | `border-border` | `border-neutral-200` |
| Ação primária (botão, ícone ativo) | `bg-primary` / `text-primary` | `bg-blue-600`, `text-blue-600` |
| Texto sobre `bg-primary` | `text-primary-foreground` | `text-white` |
| Destrutivo (excluir, erro) | `bg-destructive` / `text-destructive` | `bg-rose-600`, `text-red-600` |
| Sucesso | `text-emerald-600` / `bg-emerald-500/10` | — (ok usar direto; não é um token de tema, é semântico) |
| Alerta | `text-amber-600` / `bg-amber-500/10` | — (idem) |

Cores semânticas (sucesso/alerta/perigo) podem seguir com Tailwind direto —
são intencionalmente fixas (verde é sempre "bom", independente do tema). O
que não pode ser hardcoded é tudo que representa "cor de marca" ou "texto/
fundo neutro".

## Tipografia

| Elemento | Classe |
|---|---|
| Título de página (h1) | `text-2xl font-black tracking-tight text-foreground` |
| Subtítulo de página | `text-sm text-muted-foreground` |
| Título de seção dentro da página | `text-xs font-black uppercase tracking-wider text-muted-foreground` |
| Título de card | `text-sm font-bold text-foreground` |
| Corpo de texto | `text-sm text-foreground` |
| Texto pequeno/legenda | `text-xs text-muted-foreground` |
| Rótulo de formulário | `text-xs font-bold text-muted-foreground` (ou `font-medium`, ambos ok) |

## Espaçamento e bordas

| Elemento | Classe |
|---|---|
| Card padrão | `rounded-xl border border-border bg-card p-5 shadow-xs` |
| Card grande/destaque (hero, modal grande) | `rounded-2xl` |
| Botão, input, select, dropdown fechado | `rounded-lg` |
| Badge/pill/chip | `rounded-full` |
| Diálogo (Dialog) | `rounded-xl`, padding `p-6` (padrão do componente compartilhado) |
| Espaço entre seções verticais | `space-y-4` a `space-y-6` |
| Espaço entre itens de uma lista/grid | `gap-3` a `gap-4` |

## Sombras

| Uso | Classe |
|---|---|
| Card em repouso | `shadow-xs` (é o padrão — mais sutil que parece) |
| Elemento flutuante (dropdown, popover) | `shadow-lg` |
| Modal/diálogo | `shadow-md` a `shadow-2xl` conforme o tamanho |

## Ícones

- Tamanho padrão: `h-4 w-4`. Em contexto denso (linha de tabela, chip): `h-3.5 w-3.5`.
- Cor padrão: `text-muted-foreground`, vira `text-primary` só quando o ícone
  representa a ação principal do botão/estado ativo.
- Biblioteca: sempre `lucide-react` — nunca misturar com outra biblioteca de
  ícones.

## Botões

```
Primário:    bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg
Secundário:  border border-border bg-card text-foreground hover:bg-muted rounded-lg
Destrutivo:  bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg
Fantasma:    text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg (sem borda/fundo em repouso)
```

## Dropdowns e selects

- `<select>` nativo: sempre `rounded-lg border border-border bg-muted px-2 py-1.5 text-sm`.
- Menus suspensos customizados (`DropdownMenuContent`, `Select` da biblioteca de
  componentes): já usam `rounded-xl` por padrão — não sobrescrever.

## O que fazer com isso ao criar algo novo

Antes de estilizar um elemento novo, primeiro veja se ele se encaixa numa
linha da tabela acima. Se sim, usa a classe exata daqui. Se não tiver
certeza de qual se aplica, o card padrão (`rounded-xl border border-border
bg-card p-5 shadow-xs`) e o botão primário acima cobrem a grande maioria dos
casos.

## Conversão concluída

As conversões que ficaram pendentes aqui (bordas, textos, fundos de card) já
foram feitas em todas as telas internas do painel — 984 ocorrências no
total. Páginas públicas (link na bio, portal do paciente, login, landing)
ficaram de fora de propósito, já que não seguem o tema claro/escuro do
painel — podem continuar com cor fixa sem problema.

Se aparecer cor fixa nova em código futuro, é só seguir a tabela acima na
hora de escrever, não vai precisar de outra rodada de conversão em massa.
