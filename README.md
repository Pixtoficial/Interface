# Pixt IA - AutoHub

Interface completa com backend Node.js + SQLite e frontend single-file (React via Babel/CDN).

## Pré-requisitos

- Node.js 18 ou superior — baixe em https://nodejs.org/

Para verificar: abra o **PowerShell** ou **CMD** e rode:

```bash
node --version
npm --version
```

## Como rodar (Windows)

Abra o PowerShell na pasta `interface pixt` e:

```powershell
cd backend
npm install
npm run seed
npm start
```

Você verá:

```
[Pixt IA] Backend rodando em http://localhost:3001
[Pixt IA] Frontend: http://localhost:3001/index.html
[Pixt IA] API:      http://localhost:3001/api/health
```

Abra no navegador: **http://localhost:3001/index.html**

> Atalho: o arquivo `iniciar.bat` na raiz roda tudo automaticamente — basta dar duplo clique.

## Credenciais demo

- **E-mail:** `admin@pixt.ia`
- **Senha:** `12345678`

Você também pode criar uma nova conta na aba "Registar" da tela de login.

## O que está funcional

### Login & Sessão
- Autenticação real com JWT (token persistido em `localStorage`)
- Registro de novas contas
- Validação de sessão na inicialização (logout automático em token expirado)
- Logout completo

### Navegação
- Sidebar com **trocador de agente** (clique no nome do agente no topo)
- Cada agente exibe os menus específicos (Vendas+, LeadFlow, Booker, ExpertAI, Custom)
- Breadcrumb e header com indicador de status
- Botão de refresh global

### Visão Geral (Overview)
- Métricas calculadas em tempo real do banco de dados
- Hero metric varia por agente (receita, leads, eventos, docs, workflows)
- Cards de interações, conversas, leads ativos, eventos
- Toggle "Automação On/Off" persistido

### Pipeline / CRM (Vendas+ e LeadFlow)
- **Drag-and-drop** entre as 5 colunas (Novos, Em Atendimento, Sem Resposta, Humano, Fechado)
- Stage atualizado no servidor a cada drop (atualização otimista)
- Criar novo lead via modal (nome, empresa, score, valor, tag, cor, estágio)
- Excluir lead (com confirmação)
- Contagem por coluna em tempo real

### Conversas (Inbox)
- Lista de conversas espelhadas com busca
- Selecionar conversa carrega histórico de mensagens
- Enviar mensagem como humano
- Resposta automática da IA (heurística por palavras-chave)
- Criar/excluir conversa
- Badge de intenção (Compra, Objeção, Interesse)

### Faturas (Vendas+)
- Listar, criar, alternar Pago/Pendente, excluir
- Modal de criação com gateway e status

### Agenda (Booker)
- Visão semanal com 5 dias
- Eventos da IA vs pessoais (cores diferentes)
- Criar/excluir eventos

### Base RAG (ExpertAI)
- Upload de documentos (registra metadata no banco)
- Listar documentos indexados
- Excluir documentos

### Builder Visual (Custom)
- Listar workflows com etapas
- Habilitar/desabilitar workflow (toggle)
- Executar workflow (gera log no servidor)
- Criar/excluir workflows com etapas customizadas

### Execuções & Logs (Custom)
- Histórico das últimas 100 execuções de todos os workflows
- Status, duração, log, timestamp

### Configurações
- Canais WhatsApp (multi, com on/off por canal)
- Script & instruções
- Qtd. de linhas
- Lembretes (apenas para Booker)
- Presença digital (Site, Instagram, LinkedIn)
- Botão "Guardar Ajustes Operacionais" persiste tudo

## Arquitetura

```
interface pixt/
├── index.html          ← Frontend (React via Babel/CDN, single file)
├── README.md           ← Este arquivo
├── iniciar.bat         ← Atalho para Windows
└── backend/
    ├── package.json
    ├── server.js       ← Express server (porta 3001)
    ├── db.js           ← SQLite + schema
    ├── seed.js         ← Dados iniciais
    ├── middleware/
    │   └── auth.js     ← JWT
    ├── routes/
    │   ├── auth.js
    │   ├── agents.js
    │   ├── leads.js
    │   ├── conversations.js
    │   ├── invoices.js
    │   ├── events.js
    │   ├── rag.js
    │   ├── workflows.js
    │   ├── settings.js
    │   └── stats.js
    └── data/
        └── pixt.db     ← Banco SQLite (criado automaticamente)
```

## API REST (resumo)

Todos os endpoints (exceto `/auth/login`, `/auth/register`, `/health`) exigem header `Authorization: Bearer <token>`.

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/auth/register` | Criar conta |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Usuário atual |
| GET | `/api/agents` | Lista de agentes |
| PATCH | `/api/agents/:slug/toggle` | Liga/desliga agente |
| GET | `/api/leads?agent=X` | Lista leads |
| POST | `/api/leads` | Criar lead |
| PATCH | `/api/leads/:id` | Atualizar (mover stage, etc.) |
| DELETE | `/api/leads/:id` | Excluir |
| GET | `/api/conversations?agent=X` | Lista conversas |
| GET | `/api/conversations/:id/messages` | Mensagens |
| POST | `/api/conversations/:id/messages` | Enviar mensagem |
| GET | `/api/invoices?agent=X` | Faturas |
| POST | `/api/invoices` | Criar fatura |
| GET | `/api/events?agent=X` | Eventos |
| POST | `/api/events` | Criar evento |
| GET | `/api/rag?agent=X` | Documentos RAG |
| POST | `/api/rag` | Indexar doc |
| GET | `/api/workflows` | Workflows |
| POST | `/api/workflows/:id/run` | Executar |
| GET | `/api/workflows/all/executions` | Logs |
| GET | `/api/settings/:agent` | Settings |
| PUT | `/api/settings/:agent` | Salvar settings |
| GET | `/api/stats/:agent` | Stats da overview |

## Resetar o banco

```powershell
cd backend
npm run reset
```

Apaga `data/pixt.db` e roda o seed novamente.

## Próximos passos sugeridos

- Integrar WhatsApp real via Z-API ou Evolution API
- Conectar Google Calendar com OAuth
- Stripe/Asaas Webhook para pagamentos reais
- Embeddings reais para o RAG (OpenAI/Cohere)
- Engine de execução de workflows (filas, cron)
# Interface
