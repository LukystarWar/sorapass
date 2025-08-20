# CLAUDE.md

Este arquivo fornece orientações ao Claude Code (claude.ai/code) ao trabalhar com código neste repositório.

## Visão Geral do Projeto

**Sora's Pass** é um serviço de **Biblioteca Familiar Steam** construído como aplicação web hospedada no Netlify. O sistema sincroniza jogos de múltiplas contas Steam familiares, remove duplicatas, e permite navegação pela biblioteca compartilhada.

### Fluxo Principal
1. **Steam API** → Busca jogos de todas as contas familiares
2. **Banco Neon** → Armazena jogos únicos (remove duplicatas)
3. **Frontend** → Exibe biblioteca completa para navegação

## ⚠️ PROBLEMAS CRÍTICOS E SOLUÇÕES

### 🔧 Conflito ESM/CJS (ERRO 500 MAIS COMUM)
**❌ NUNCA FAÇA:**
```typescript
import { getSql } from "./_db";  // Causa crash ESM/CJS
```

**✅ SEMPRE FAÇA:**
```typescript
// Dynamic import dentro do handler
const { neon } = await import("@neondatabase/serverless");
const sql = neon(NETLIFY_DATABASE_URL);
```

**Motivo**: `@neondatabase/serverless` é módulo ESM, import estático quebra no Netlify.

### 🔧 Variáveis de Ambiente (ERRO 400/500)
**✅ VARIÁVEIS CORRETAS NO NETLIFY:**
- `NETLIFY_DATABASE_URL` (não `DATABASE_URL`)
- `STEAM_API_KEY`
- `STEAM_IDS` (CSV: "id1,id2,id3")
- `ENRICH_DETAILS`
- `NETLIFY_DATABASE_URL_UNPOOLED`

### 🔧 Schema de Banco (CONFLITOS DE TABELA)
**✅ USAR SEMPRE:**
- Tabela: `games` (não `steam_games` ou outras)
- Colunas: `app_id`, `name`, `cover_url`, `last_seen_at`, `updated_at`

## Arquitetura

### Frontend
- **index.html** - Página inicial
- **biblioteca.html** - Navegação da biblioteca
- **assets/js/biblioteca.js** - Funcionalidades da biblioteca
- **assets/css/** - Estilização
- Fonte: Inter do Google Fonts

### Backend (Netlify Functions)
Todas em `/netlify/functions/` (TypeScript):

**✅ FUNÇÕES FUNCIONAIS:**
- `family-sync.ts` - **Sync completo da Biblioteca Familiar** (722 jogos de 5 contas, agendado)
- `steam-sync.ts` - Sync de conta única (backup/teste)
- `snapshot.ts` - Retorna biblioteca completa para frontend
- `games.ts` - Lista paginada de jogos  
- `game.ts` - Detalhes de jogo individual
- `test-basic.ts` - Teste de conectividade

**🗑️ REMOVIDAS:**
- `simple-sync.ts` (problemático ESM/CJS)
- `debug-sync.ts`, `quick-sync.ts`, `test-setup.ts` (desnecessárias)

### Schema do Banco de Dados (Neon PostgreSQL)
```sql
-- Tabela principal (USAR SEMPRE ESTA)
CREATE TABLE games (
  app_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  cover_url TEXT,
  last_seen_at TIMESTAMP,
  updated_at TIMESTAMP,
  developer TEXT,
  publisher TEXT, 
  release_year INTEGER
);

-- Futuras (não implementadas ainda)
CREATE TABLE genres (id SERIAL PRIMARY KEY, name TEXT);
CREATE TABLE game_genres (app_id INT, genre_id INT);
```

### Endpoints da API
```
/api/family-sync   - Sync Biblioteca Familiar (5 contas → 722 jogos, agendado 2h)
/api/steam-sync    - Sync conta única (backup/teste)
/api/snapshot      - Biblioteca completa (JSON 92KB)
/api/games         - Lista paginada
/api/game/:id      - Detalhes individuais
/api/test-basic    - Teste conectividade
```

### Integração Steam
- **Steam Web API**: `GetOwnedGames` endpoint
- **Múltiplas contas**: Processa todas as `STEAM_IDS`
- **Deduplicação**: Map por `app_id` para remover duplicatas
- **Rate limiting**: 500ms delay entre requisições
- **Resultado**: 928 jogos processados → 722 únicos

### Recursos do Frontend
- Busca por nome/desenvolvedor/publisher
- Ordenação A-Z/Z-A
- Paginação (50 jogos/página)
- Link para Steam Store
- Design responsivo

## Deploy e Desenvolvimento

### 🚀 Fluxo de Deploy
**IMPORTANTE**: Deploy automático via Git

```bash
# Fluxo padrão para mudanças
git add .
git commit -m "Descrição da mudança"
git push
sleep 60  # Aguardar deploy (60-120s)
# Testar endpoints
```

### 🌐 Ambientes
- **Produção**: https://sorapass.netlify.app/
- **Deploy**: Automático via GitHub
- **Logs**: Dashboard Netlify
- **Tempo deploy**: ~60-120 segundos

### 🔧 Configuração Netlify
```toml
# netlify.toml
[build.environment]
NODE_VERSION = "20"

[functions]
node_bundler = "esbuild"
external_node_modules = ["@neondatabase/serverless"]

# Agendamento
[functions."family-sync"]
schedule = "0 2 * * *"  # 2h da manhã, sync automático
```

## 📋 Comandos de Desenvolvimento

### Locais (Requer Netlify CLI)
```bash
npm install -g @netlify/cli
netlify dev          # Servidor local
npm run dev          # Alias
```

### Testes de API
```bash
# Sync completo (5 contas Steam → 722 jogos)
curl "https://sorapass.netlify.app/api/family-sync"

# Sync conta única (teste/backup)
curl "https://sorapass.netlify.app/api/steam-sync"

# Verificar biblioteca (92KB JSON)
curl "https://sorapass.netlify.app/api/snapshot" | wc -c

# Teste conectividade
curl "https://sorapass.netlify.app/api/test-basic"
```

## 🏗️ Padrões de Código

### ✅ Template de Função Netlify
```typescript
import type { Handler, HandlerResponse } from "@netlify/functions";

export const handler: Handler = async (event): Promise<HandlerResponse> => {
  try {
    // 1. Variáveis de ambiente
    const { STEAM_API_KEY, STEAM_IDS, NETLIFY_DATABASE_URL } = process.env;
    
    if (!STEAM_API_KEY || !STEAM_IDS || !NETLIFY_DATABASE_URL) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Missing env vars" })
      };
    }

    // 2. Conexão banco (DYNAMIC IMPORT!)
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(NETLIFY_DATABASE_URL);

    // 3. Lógica da função...

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 
        error: err instanceof Error ? err.message : "Erro desconhecido" 
      })
    };
  }
};
```

### 🔄 Padrão Steam Multi-Contas
```typescript
// Processar todas as contas Steam
const steamIds = STEAM_IDS.split(",").map(s => s.trim()).filter(Boolean);
const allGames = new Map(); // Deduplicação

for (const steamId of steamIds) {
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&include_appinfo=1&format=json`;
  
  const res = await fetch(url);
  const json = await res.json();
  const games = json?.response?.games || [];
  
  // Adicionar únicos
  for (const game of games) {
    if (!allGames.has(game.appid)) {
      allGames.set(game.appid, game);
    }
  }
  
  // Rate limiting
  await new Promise(resolve => setTimeout(resolve, 500));
}
```

## 📊 Estatísticas Atuais
- **5 contas Steam** configuradas
- **928 jogos** processados total
- **722 jogos únicos** na biblioteca
- **92KB** de dados JSON no snapshot
- **~7 segundos** para sync completo

## 🎯 Próximos Passos Potenciais
1. Adicionar gêneros dos jogos
2. Filtros avançados no frontend  
3. Cache otimizado
4. Interface de administração
5. Métricas de uso

## 🛠️ HISTÓRICO DE PROBLEMAS RESOLVIDOS

### ❌ Problema Principal: Erro 500 nas Funções
**Causa**: Conflito ESM/CJS com import estático de `@neondatabase/serverless`
**Sintomas**: Funções crashavam antes mesmo do try/catch
**Solução**: Dynamic import `await import("@neondatabase/serverless")`

### ❌ Problema: Variáveis de Ambiente Incorretas  
**Causa**: Usando `DATABASE_URL` em vez de `NETLIFY_DATABASE_URL`
**Sintomas**: Erro 400/500 "Missing env vars"
**Solução**: Padronizar `NETLIFY_DATABASE_URL` em todas as funções

### ❌ Problema: Conflito de Schema de Banco
**Causa**: Funções criavam `steam_games` mas projeto usa `games`
**Sintomas**: Dados não apareciam no frontend
**Solução**: Padronizar tabela `games` com schema correto

### ❌ Problema: Unicode em JSON
**Causa**: Nomes de jogos Steam com caracteres problemáticos
**Sintomas**: JSON malformado, erro de parsing
**Solução**: Sanitização `.replace(/[^\x20-\x7E]/g, '').trim()`

### ✅ Solução Final Implementada
1. **family-sync.ts**: Função principal, processa 5 contas Steam
2. **steam-sync.ts**: Função backup, processa 1 conta
3. **Agendamento**: Sync automático às 2h da manhã
4. **Resultado**: 928 jogos → 722 únicos na biblioteca familiar
5. **Performance**: ~7 segundos para sync completo

### 📋 Lições Aprendidas
- **SEMPRE** usar dynamic import para módulos ESM no Netlify
- **SEMPRE** usar variáveis `NETLIFY_*` em funções Netlify
- **SEMPRE** verificar schema de banco antes de implementar
- **SEMPRE** testar functions básicas antes de complexas
- **SEMPRE** commit/push para testar no Netlify (não funciona local)