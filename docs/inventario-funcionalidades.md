# Inventário de Funcionalidades — LeadPluz

Base pra desenhar o onboarding guiado (por LIA ou manual). Pra cada área: o que
faz, do que depende pra funcionar de verdade, e se é essencial no dia 1 ou pode
esperar.

**Legenda de prioridade:**
- 🔴 **Essencial dia 1** — sem isso, o sistema não funciona ou não faz sentido
- 🟡 **Importante primeira semana** — melhora muito a experiência, mas dá pra usar sem
- 🟢 **Pode esperar** — recursos avançados/opcionais

---

## 1. Fundação (nada funciona sem isso)

### 1.1 Conexão do WhatsApp 🔴
**O que é:** conectar a instância (Uazapi ou Meta oficial) que vai mandar/receber mensagem.
**Depende de:** nada — é o primeiro passo.
**Sem isso:** literalmente nada de comunicação funciona — Caixa de Entrada, Agenda
(lembretes), Disparos, Automações, Fluxos, Link na Bio, tudo trava.
**Configuração:** token/credenciais do provedor, número, nome de exibição.

### 1.2 Dados básicos da clínica 🔴
**O que é:** nome, horário de funcionamento, endereço (usado em mensagens/lembretes).
**Depende de:** nada.

### 1.3 Equipe 🔴 (pelo menos o dono)
**O que é:** quem usa o sistema, com que permissão.
**Depende de:** nada pro dono; convite por link pros demais.
**Sem isso:** só o dono consegue logar.

---

## 2. Base operacional (precisa antes de agendar/vender de verdade)

### 2.1 Serviços 🔴
**O que é:** o catálogo de procedimentos/consultas, cada um com duração e preço.
**Depende de:** nada, mas TUDO que envolve agendamento depende disso.
**Por quê é crítico:** a duração do agendamento (manual, por automação, ou por LIA)
vem daqui. Sem serviço cadastrado, cai no padrão de 60min pra tudo — errado na
prática.

### 2.2 Agenda 🔴
**O que é:** o calendário de agendamentos.
**Depende de:** Serviços (duração), Equipe (quem atende), WhatsApp (lembretes).
**Configuração:** horários de trabalho por profissional, bloqueios.

### 2.3 Pipelines / CRM (funil de vendas) 🟡
**O que é:** as etapas do funil (ex: Novo Lead → Qualificado → Agendado → Fechado).
**Depende de:** nada tecnicamente, mas só faz sentido depois que já tem contato
entrando.
**Padrão:** o sistema pode vir com um funil padrão pronto, editável depois.

### 2.4 Campos personalizados e Tags 🟢
**O que é:** campos extra no contato/negócio, e tags pra segmentar.
**Depende de:** nada. Usado depois por Automações, Fluxos, Disparos, Campanhas.

---

## 3. Comunicação (o coração do produto)

### 3.1 Modelos de mensagem 🟡
**O que é:** mensagens salvas e reutilizáveis, com variáveis ({{nome}}, etc), texto/
foto/vídeo/documento em sequência.
**Depende de:** WhatsApp conectado.
**Por quê importa:** Automações, Fluxos, Disparos e Campanhas Agendadas todos
dependem de um Modelo existir antes.

### 3.2 Caixa de Entrada 🔴
**O que é:** onde a equipe conversa com os pacientes.
**Depende de:** WhatsApp conectado. Funciona no dia 1 sem mais nada.

### 3.3 Automações (Regras de Automação) 🟡
**O que é:** "se X acontecer, faça Y" — gatilho por palavra-chave, tag, primeira
mensagem, etc.
**Depende de:** WhatsApp, e Modelos (pras etapas de enviar modelo/foto).
**Onboarding:** provavelmente não é dia 1 — precisa a clínica já ter uma ideia
de que mensagens automáticas quer mandar.

### 3.4 Fluxos de Mensagens 🟢
**O que é:** conversas automáticas com coleta de resposta, condições — mais
estruturado que Automações.
**Depende de:** mesma coisa que Automações, mas é mais avançado — claramente
"pode esperar".

### 3.5 Disparos (Broadcasts) 🟡
**O que é:** mensagem em massa pra uma lista/segmento.
**Depende de:** WhatsApp, Modelos, e ter contatos cadastrados (poucos no dia 1).

### 3.6 Campanhas Agendadas (recorrentes) 🟢
**O que é:** disparo automático recorrente (ex: toda seg-sáb às 15h pra quem tem
tag X).
**Depende de:** Modelos, Tags. Uso mais avançado, vem depois que a clínica já
testou Disparos manuais.

### 3.7 Notificações Automáticas 🟢
**O que é:** lembretes de aniversário, etc — dispara sozinho com base em dados
do contato.
**Depende de:** WhatsApp, um Modelo configurado por tipo de evento.

### 3.8 Link na Bio 🟢
**O que é:** página pública (leadpluz.com/slug) com cards, formulário, etc.
**Depende de:** nada tecnicamente, é autônomo. Claramente opcional/depois.

### 3.9 Portal do Paciente 🟢
**O que é:** área onde o paciente vê histórico, agenda, documentos.
**Depende de:** Agenda, Documentos, Serviços já tendo dado.

---

## 4. Financeiro e documentos

### 4.1 Financeiro 🟡
**O que é:** registro de pagamentos, pacotes de sessão.
**Depende de:** Serviços (pra saber valor), Contatos.

### 4.2 Documentos 🟢
**O que é:** contratos, termos de consentimento, assinatura digital.
**Depende de:** Contatos. Uso mais avançado/depois.

---

## 5. Inteligência e suporte à decisão

### 5.1 Dashboard 🔴 (mas fica vazio até ter dado)
**O que é:** visão geral — agenda do dia, financeiro, pendências.
**Depende de:** tudo o resto gerando dado real.

### 5.2 Relatórios 🟢
**O que é:** métricas mais profundas (funil, desempenho por profissional, etc).
**Depende de:** volume de dado acumulado — não faz sentido no dia 1.

### 5.3 LIA (assistente) 🟡→🔴 (a médio prazo, deveria ser o próprio onboarding)
**O que é:** conversa que cria/edita/consulta qualquer coisa acima.
**Depende de:** WhatsApp configurado (pra saber com quem falar), e minimamente
uma conta criada.
**Visão de longo prazo:** ela PRÓPRIA guia a configuração das áreas acima, em vez
de a pessoa navegar cada tela manualmente.

---

## Sequência de dependência (o que precisa vir antes do quê)

```
WhatsApp conectado
    ↓
Dados da clínica + Equipe (dono)
    ↓
Serviços ──────────────┐
    ↓                  │
Agenda funcional       │
    ↓                  ↓
Pipelines/CRM      Modelos de mensagem
    ↓                  ↓
Contatos chegando  Automações / Disparos / Fluxos
    ↓                  ↓
Financeiro         Campanhas Agendadas / Notificações
    ↓
Relatórios (só faz sentido com dado acumulado)
```

---

## Perguntas em aberto pra decidir juntos

1. **Quem faz o onboarding — a LIA, um assistente humano (você), ou um wizard
   de telas guiadas?** Ou uma combinação (LIA conduz, mas com telas de apoio
   pros passos mais visuais, tipo conectar WhatsApp)?
2. **O que é obrigatório antes da clínica poder "usar de verdade" vs. o que
   pode ficar pendente com um aviso ("configure depois")?**
3. **A LIA deveria ter um "modo onboarding" diferente do modo normal** — mais
   proativa, indo perguntando: "criei sua Agenda, agora vamos cadastrar seus
   Serviços — quais você oferece?"
4. **Quanto tempo é razoável esperar que o onboarding leve?** (isso conecta
   direto com a conversa que tivemos sobre trial/período de teste)
