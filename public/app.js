document.addEventListener('DOMContentLoaded', async () => {
    // Mapeamento dos elementos do HTML
    const bgLayer = document.getElementById('bg-layer');
    const titleEl = document.getElementById('m-title');
    const metaEl = document.getElementById('m-meta');
    const synopsisEl = document.getElementById('m-synopsis');
    const carouselEl = document.getElementById('carousel');

    let filmes = [];

    // 1. Busca os dados limpos da nossa nova API REST
    try {
        const response = await fetch('/api/filmes');
        filmes = await response.json();

        if (filmes.length === 0) {
            titleEl.textContent = "Nenhum filme encontrado";
            synopsisEl.textContent = "Não há filmes retornados pela API.";
            return;
        }

        // Constrói a interface e foca no primeiro filme
        renderizarCarrossel();
        focarFilme(0);

    } catch (error) {
        titleEl.textContent = "Erro de Conexão";
        synopsisEl.textContent = "Não foi possível conectar com o servidor Node.js.";
        console.error(error);
    }

    // 2. A função que faz a troca visual estilo PS5
    function focarFilme(index) {
        const filme = filmes[index];
        
        // Troca o fundo
        bgLayer.style.backgroundImage = `url('${filme.backdrop}')`;
        
        // Troca os textos
        titleEl.textContent = filme.titulo;
        synopsisEl.textContent = filme.sinopse;
        
        // Monta as pílulas (tags) dinamicamente
        let tagsHTML = '';
        if (filme.ano) tagsHTML += `<span>${filme.ano}</span>`;
        if (filme.duracao) tagsHTML += `<span>${filme.duracao}</span>`;
        if (filme.diretor) tagsHTML += `<span>${filme.diretor}</span>`;
        if (filme.generos) tagsHTML += `<span>${filme.generos}</span>`;
        metaEl.innerHTML = tagsHTML;

        // Gerencia o destaque (borda branca e elevação) no carrossel
        document.querySelectorAll('.movie-card').forEach((card, i) => {
            if (i === index) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });
    }

    // 3. Constrói os cartazes dentro da barra inferior
    function renderizarCarrossel() {
        carouselEl.innerHTML = ''; // Limpa o carregamento inicial
        
        filmes.forEach((filme, index) => {
            const img = document.createElement('img');
            img.src = filme.poster; // Usa a arte vertical aqui
            img.className = 'movie-card';
            
            // O gatilho principal: passar o mouse aciona a troca
            img.addEventListener('mouseenter', () => focarFilme(index));
            
            carouselEl.appendChild(img);
        });
    }
});