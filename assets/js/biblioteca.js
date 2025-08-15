// Estado da aplicação
let allGames = [];
let filteredGames = [];
let displayedGames = [];
let currentPage = 0;
const GAMES_PER_PAGE = 24;
let isLoading = false;

// Elementos DOM
const gamesGrid = document.getElementById('games-grid');
const searchInput = document.getElementById('search-input');
const yearFilter = document.getElementById('year-filter');
const sortFilter = document.getElementById('sort-filter');
const totalGamesEl = document.getElementById('total-games');
const loadMoreSection = document.getElementById('load-more');
const loadMoreBtn = document.getElementById('load-more-btn');
const statusMessage = document.getElementById('status-message');

// Inicialização
async function init() {
    try {
        showStatus('Carregando biblioteca...', false);

        // Buscar jogos
        const response = await fetch('/api/snapshot');
        if (!response.ok) throw new Error('Erro ao carregar jogos');

        allGames = await response.json();
        console.log(`${allGames.length} jogos carregados`);

        // Configurar filtros
        setupFilters();

        // Aplicar filtros iniciais
        applyFilters();

        // Configurar eventos
        setupEventListeners();

        hideStatus();

    } catch (error) {
        console.error('Erro ao inicializar:', error);
        showStatus('Erro ao carregar biblioteca. Tente recarregar a página.', true);
    }
}

// Navbar Escondida
function toggleMenu() {
    const navLinks = document.querySelector('.nav-links');
    const menuToggle = document.querySelector('.menu-toggle');

    navLinks.classList.toggle('active');
    menuToggle.classList.toggle('active');
}

// Configurar filtros
function setupFilters() {
    // Popular filtro de anos
    const years = [...new Set(allGames
        .map(game => game.release_year)
        .filter(year => year)
        .sort((a, b) => b - a)
    )];

    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearFilter.appendChild(option);
    });

    // Atualizar contador total
    totalGamesEl.textContent = allGames.length.toLocaleString();
}

// Event listeners
function setupEventListeners() {
    // Busca com debounce
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 0;
            applyFilters();
        }, 300);
    });

    // Filtros
    yearFilter.addEventListener('change', () => {
        currentPage = 0;
        applyFilters();
    });

    sortFilter.addEventListener('change', () => {
        currentPage = 0;
        applyFilters();
    });

    // Load more
    loadMoreBtn.addEventListener('click', loadMoreGames);

    // Infinite scroll
    window.addEventListener('scroll', () => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000) {
            loadMoreGames();
        }
    });
}

// Aplicar filtros
function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedYear = yearFilter.value;
    const sortBy = sortFilter.value;

    // Filtrar
    filteredGames = allGames.filter(game => {
        const matchesSearch = !searchTerm || game.name.toLowerCase().includes(searchTerm);
        const matchesYear = !selectedYear || game.release_year == selectedYear;
        return matchesSearch && matchesYear;
    });

    // Ordenar
    filteredGames.sort((a, b) => {
        switch (sortBy) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'name-desc':
                return b.name.localeCompare(a.name);
            case 'year':
                return (b.release_year || 0) - (a.release_year || 0);
            case 'year-desc':
                return (a.release_year || 0) - (b.release_year || 0);
            default:
                return 0;
        }
    });

    // Reset página e renderizar
    currentPage = 0;
    displayedGames = [];
    gamesGrid.innerHTML = '';
    loadMoreGames();
}

// Carregar mais jogos
function loadMoreGames() {
    if (isLoading) return;

    const startIndex = currentPage * GAMES_PER_PAGE;
    const endIndex = startIndex + GAMES_PER_PAGE;
    const newGames = filteredGames.slice(startIndex, endIndex);

    if (newGames.length === 0) {
        loadMoreSection.style.display = 'none';
        return;
    }

    isLoading = true;
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Carregando...';

    // Simular delay para UX
    setTimeout(() => {
        displayedGames.push(...newGames);
        renderGames(newGames);
        currentPage++;

        // Verificar se há mais jogos
        if (endIndex >= filteredGames.length) {
            loadMoreSection.style.display = 'none';
        } else {
            loadMoreSection.style.display = 'block';
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = 'Carregar mais jogos';
        }

        isLoading = false;
    }, 300);
}

// Renderizar jogos
function renderGames(games) {
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
                alt="${game.name}"
                loading="lazy"
                onerror="this.parentElement.innerHTML='<div class=\\"game-image-placeholder\\">🎮</div>
        </div>
        <div class="game-info">
            <h3 class="game-title">${game.name}</h3>
        </div>
    `;

    return card;
}

// Abrir na Steam Store
function openSteamStore(appId) {
    window.open(`https://store.steampowered.com/app/${appId}`, '_blank');
}

// Mostrar/esconder status
function showStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${isError ? 'error' : ''}`;
    statusMessage.style.display = 'block';
    gamesGrid.style.display = 'none';
    loadMoreSection.style.display = 'none';
}

function hideStatus() {
    statusMessage.style.display = 'none';
    gamesGrid.style.display = 'grid';
}

// Inicializar quando a página carregar
document.addEventListener('DOMContentLoaded', init);