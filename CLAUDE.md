# CLAUDE.md

Este arquivo fornece orientações ao Claude Code (claude.ai/code) ao trabalhar com código neste repositório.

## Visão Geral do Projeto

Sora's Pass é um serviço de compartilhamento da Biblioteca Familiar Steam construído como uma aplicação web hospedada no Netlify. Permite que usuários naveguem por uma biblioteca de jogos Steam compartilhada e comprem planos de assinatura para acesso ao compartilhamento familiar.

## Comandos de Desenvolvimento

- `npm run dev` - Iniciar servidor de desenvolvimento Netlify com funções
- `npm run build` - Comando de build simples (atualmente apenas exibe conclusão)
- `netlify dev` - Comando alternativo para executar servidor de desenvolvimento

## Arquitetura

### Frontend
- Páginas HTML estáticas: `index.html` (página inicial) e `biblioteca.html` (biblioteca de jogos)
- JavaScript vanilla em `assets/js/biblioteca.js` gerencia funcionalidades da biblioteca
- Arquivos CSS em `assets/css/` para estilização
- Usa fonte Inter do Google Fonts

### Backend (Netlify Functions)
Todas as funções estão em `/netlify/functions/` e escritas em TypeScript:

- `_db.ts` - Utilitários de conexão com banco de dados usando Neon PostgreSQL
- `games.ts` - Endpoint API para listagem paginada de jogos
- `snapshot.ts` - Retorna biblioteca completa de jogos (tenta cache Blobs primeiro, fallback para DB)
- `simple-sync.ts` - Sincronização agendada da API Steam (executa a cada 6 horas via cron)
- `game.ts` - Endpoint para detalhes de jogos individuais
- `debug-sync.ts` - Endpoint de sincronização manual para debug
- `test-setup.ts` - Utilitários de configuração/teste do banco de dados

### Schema do Banco de Dados
Usa Neon PostgreSQL com tabelas:
- `games` - Dados principais dos jogos (app_id, name, cover_url, developer, publisher, release_year, etc.)
- `genres` - Referência de gêneros dos jogos
- `game_genres` - Relacionamento muitos-para-muitos entre jogos e gêneros

### Endpoints da API
Todos roteados através de `/api/*` via redirects do Netlify:
- `/api/snapshot` - Biblioteca completa de jogos
- `/api/games` - Lista paginada de jogos
- `/api/game/:id` - Detalhes de jogos individuais
- `/api/simple-sync` - Ativar sincronização (agendada)
- `/api/debug-sync` - Sincronização manual
- `/api/test-setup` - Utilitários do banco de dados

### Integração com Steam
- Busca jogos de múltiplas contas Steam usando Steam Web API
- Requer variáveis de ambiente: `STEAM_API_KEY`, `STEAM_IDS` (CSV de IDs Steam)
- Processo de sync limpa e reconstrói biblioteca de jogos a cada 6 horas
- Usa Netlify Blobs para cache de dados dos jogos quando disponível

### Recursos da Biblioteca Frontend
- Buscar jogos por nome, desenvolvedor ou publisher
- Ordenar por nome (A-Z, Z-A)
- Paginação (24 jogos por página)
- Clicar nos jogos para abrir página da Steam Store
- Design responsivo com menu mobile
- Estados de carregamento e tratamento de erros

## Configuração

### Variáveis de Ambiente Necessárias
- `DATABASE_URL` ou `NETLIFY_DATABASE_URL` - String de conexão Neon PostgreSQL
- `STEAM_API_KEY` - Chave da Steam Web API
- `STEAM_IDS` - IDs de usuários Steam separados por vírgula para agregação da biblioteca

### Configuração do Netlify
- Runtime Node.js 20
- Bundler esbuild para funções
- Módulo externo: `@neondatabase/serverless`
- Função agendada: `simple-sync` executa a cada 6 horas (0 */6 * * *)