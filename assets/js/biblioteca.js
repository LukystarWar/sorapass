// Estado da aplicação
let allGames = [];
let filteredGames = [];
let displayedGames = [];
let currentPage = 0;
const GAMES_PER_PAGE = 50;
let isLoading = false;

// Elementos DOM (com proteção contra null)
let gamesGrid, searchInput, yearFilter, sortFilter, totalGamesEl, loadMoreSection, loadMoreBtn, statusMessage;

// Navbar Responsiva
function toggleMenu() {
    const navLinks = document.querySelector('.nav-links');
    const menuToggle = document.querySelector('.menu-toggle');
    
    navLinks.classList.toggle('active');
    menuToggle.classList.toggle('active');
}

// Inicialização
async function init() {
    try {
        // Buscar elementos DOM com verificação
        gamesGrid = document.getElementById('games-grid');
        searchInput = document.getElementById('search-input');
        yearFilter = document.getElementById('year-filter');
        sortFilter = document.getElementById('sort-filter');
        totalGamesEl = document.getElementById('total-games');
        loadMoreSection = document.getElementById('load-more');
        loadMoreBtn = document.getElementById('load-more-btn');
        statusMessage = document.getElementById('status-message');

        // Verificar se elementos críticos existem
        if (!gamesGrid || !statusMessage) {
            console.error('❌ Elementos DOM críticos não encontrados:', {
                gamesGrid: !!gamesGrid,
                statusMessage: !!statusMessage
            });
            return;
        }

        showStatus('Carregando biblioteca...', false);
        console.log('🚀 Iniciando carregamento da biblioteca...');

        // Buscar jogos
        console.log('📡 Fazendo fetch para /api/snapshot...');
        const response = await fetch('/api/snapshot', {
            cache: 'no-store'
        });

        console.log('📊 Response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('✅ Dados recebidos:', Array.isArray(data) ? `${data.length} jogos` : 'formato inesperado');

        if (!Array.isArray(data)) {
            throw new Error('Dados inválidos recebidos do servidor');
        }

        if (data.length === 0) {
            showStatus('Nenhum jogo encontrado. A biblioteca pode estar vazia.', true);
            return;
        }

        allGames = data;
        console.log(`✅ ${allGames.length} jogos carregados com sucesso`);

        // Configurar filtros
        setupFilters();

        // Aplicar filtros iniciais
        applyFilters();

        // Configurar eventos
        setupEventListeners();

        hideStatus();

    } catch (error) {
        console.error('💥 Erro ao inicializar:', error);
        showStatus(`Erro ao carregar biblioteca: ${error.message}`, true);
    }
}

// Configurar filtros
function setupFilters() {
    if (!yearFilter || !allGames.length) return;

    // Anos únicos dos jogos
    const years = [...new Set(allGames
        .map(game => game.release_year)
        .filter(year => year && year > 1990)
    )].sort((a, b) => b - a);

    // Adicionar opções de ano
    if (years.length > 0) {
        yearFilter.innerHTML = '<option value="">Todos os anos</option>';
        years.forEach(year => {
            yearFilter.innerHTML += `<option value="${year}">${year}</option>`;
        });
    }
}

// Configurar event listeners
function setupEventListeners() {
    if (searchInput) {
        searchInput.addEventListener('input', debounce(applyFilters, 300));
    }

    if (yearFilter) {
        yearFilter.addEventListener('change', applyFilters);
    }

    if (sortFilter) {
        sortFilter.addEventListener('change', applyFilters);
    }

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', loadMoreGames);
    }
}

// Aplicar filtros (com proteção contra null)
function applyFilters() {
    if (!allGames.length) {
        console.warn('⚠️ Tentativa de aplicar filtros sem jogos carregados');
        return;
    }

    console.log('🔍 Aplicando filtros...');

    let games = [...allGames];

    // Filtro de busca (com proteção)
    const searchTerm = searchInput?.value?.toLowerCase().trim() || '';
    if (searchTerm) {
        games = games.filter(game =>
            (game.name && game.name.toLowerCase().includes(searchTerm)) ||
            (game.developer && game.developer.toLowerCase().includes(searchTerm)) ||
            (game.publisher && game.publisher.toLowerCase().includes(searchTerm))
        );
    }

    // Filtro de ano (com proteção)
    const selectedYear = yearFilter?.value || '';
    if (selectedYear) {
        games = games.filter(game => game.release_year == selectedYear);
    }

    // Ordenação (com proteção)
    const sortBy = sortFilter?.value || 'name';
    games.sort((a, b) => {
        switch (sortBy) {
            case 'name-desc':
                return (b.name || '').localeCompare(a.name || '');
            case 'year':
                return (b.release_year || 0) - (a.release_year || 0);
            case 'year-desc':
                return (a.release_year || 0) - (b.release_year || 0);
            default: // 'name'
                return (a.name || '').localeCompare(b.name || '');
        }
    });

    filteredGames = games;

    // Resetar exibição
    currentPage = 0;
    displayedGames = [];
    if (gamesGrid) {
        gamesGrid.innerHTML = '';
    }

    // Atualizar contador (com proteção)
    if (totalGamesEl) {
        totalGamesEl.textContent = allGames.length.toLocaleString();
    }

    // Carregar primeira página
    loadMoreGames();

    console.log(`✅ Filtros aplicados: ${filteredGames.length} jogos de ${allGames.length} total`);
}

// Carregar mais jogos
function loadMoreGames() {
    if (isLoading || !filteredGames.length) return;

    isLoading = true;

    if (loadMoreBtn) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = 'Carregando...';
    }

    setTimeout(() => {
        const startIndex = currentPage * GAMES_PER_PAGE;
        const endIndex = startIndex + GAMES_PER_PAGE;
        const newGames = filteredGames.slice(startIndex, endIndex);

        displayedGames.push(...newGames);
        renderGames(newGames);
        currentPage++;

        // Verificar se há mais jogos
        if (loadMoreSection) {
            if (endIndex >= filteredGames.length) {
                loadMoreSection.style.display = 'none';
            } else {
                loadMoreSection.style.display = 'block';
                if (loadMoreBtn) {
                    loadMoreBtn.disabled = false;
                    loadMoreBtn.textContent = 'Carregar mais jogos';
                }
            }
        }

        isLoading = false;
    }, 300);
}

// Renderizar jogos
function renderGames(games) {
    if (!gamesGrid || !games.length) return;

    games.forEach(game => {
        const gameCard = createGameCard(game);
        gamesGrid.appendChild(gameCard);
    });
}

// Criar card de jogo
function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.onclick = () => openSteamStore(game.app_id);

    const imageUrl = game.cover_url || `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.app_id}/header.jpg`;

    card.innerHTML = `
        <div class="game-image">
            <img 
                src="${imageUrl}" 
                alt="${game.name || 'Jogo'}"
                loading="lazy"
                onerror="this.parentElement.innerHTML='<div class=\\"game-image-placeholder\\"></div>
        </div>
        <div class="game-info">
            <h3 class="game-title">${game.name || 'Nome indisponível'}</h3>
        </div>
    `;

    return card;
}

// Abrir na Steam Store
function openSteamStore(appId) {
    if (appId) {
        window.open(`https://store.steampowered.com/app/${appId}`, '_blank');
    }
}

// Mostrar/esconder status
function showStatus(message, isError = false) {
    if (!statusMessage) return;

    statusMessage.textContent = message;
    statusMessage.className = `status-message ${isError ? 'error' : ''}`;
    statusMessage.style.display = 'block';

    if (gamesGrid) {
        gamesGrid.style.display = 'none';
    }

    if (loadMoreSection) {
        loadMoreSection.style.display = 'none';
    }
}

function hideStatus() {
    if (statusMessage) {
        statusMessage.style.display = 'none';
    }

    if (gamesGrid) {
        gamesGrid.style.display = 'grid';
    }
}

// Utility: debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Inicializar quando a página carregar
document.addEventListener('DOMContentLoaded', init);