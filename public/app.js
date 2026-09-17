document.addEventListener('DOMContentLoaded', () => {
    const bgLayer = document.getElementById('bg-layer');
    const titleEl = document.getElementById('m-title');
    const metaEl = document.getElementById('m-meta');
    const synopsisEl = document.getElementById('m-synopsis');
    const carouselEl = document.getElementById('carousel');
    const carouselLabel = document.getElementById('carousel-label');
    
    const menuItems = document.querySelectorAll('.menu-item');
    const btnDados = document.getElementById('btn-dados');

    let filmes = [];

    // Função central que conversa com a nova API (Modo Detetive)
    async function carregarFilmes(categoria, tituloSessao) {
        try {
            titleEl.textContent = "Carregando...";
            synopsisEl.textContent = "Acessando o Notion...";
            carouselEl.innerHTML = '';
            carouselLabel.textContent = tituloSessao;
            bgLayer.style.backgroundImage = 'none';
            metaEl.innerHTML = '';

            const response = await fetch(`/api/filmes?categoria=${categoria}`);
            
            // Lemos a resposta como TEXTO puro primeiro para não quebrar
            const textoCru = await response.text(); 
            
            let dados;
            try {
                // Tentamos converter o texto para JSON
                dados = JSON.parse(textoCru);
            } catch (err) {
                // Se falhar, o servidor devolveu HTML de erro ou crashou
                console.error("Resposta crua do servidor:", textoCru);
                titleEl.textContent = "Erro Crítico";
                synopsisEl.textContent = "A API não devolveu um JSON válido. Aperte F12, vá em 'Console' e veja a resposta do servidor.";
                return;
            }

            // Se o JSON foi lido, mas a API mandou um aviso de erro (Ex: Erro 400 do Notion)
            if (!response.ok) {
                titleEl.textContent = `Erro ${response.status}`;
                synopsisEl.textContent = dados.error || "Erro interno. Olhe o terminal do Node.js.";
                return;
            }

            filmes = dados;

            if (filmes.length === 0) {
                titleEl.textContent = "Nenhum filme";
                synopsisEl.textContent = "A base não retornou resultados para este filtro.";
                return;
            }

            renderizarCarrossel();
            focarFilme(0);
            
        } catch (error) {
            // Se cair aqui, a requisição nem sequer chegou no servidor
            titleEl.textContent = "Falha de Rede";
            synopsisEl.textContent = "O servidor.js parou de rodar. Reinicie com 'node servidor.js' no terminal.";
            console.error(error);
        }
    }

    // Inicializa a HUD automaticamente no modo Aleatório
    carregarFilmes('aleatorio', 'Escolha aleatória');

    // Ação 1: O botão do Dado
    btnDados.addEventListener('click', (e) => {
        e.preventDefault();
        carregarFilmes('aleatorio', 'Escolha aleatória');
        
        // Força a pílula visual a voltar para a "Home"
        menuItems.forEach(item => item.classList.remove('active'));
        document.querySelector('[data-categoria="aleatorio"]').classList.add('active');
    });

    // Ação 2: Os botões de navegação normais
    menuItems.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Troca a pílula branca para o botão clicado
            menuItems.forEach(item => item.classList.remove('active'));
            btn.classList.add('active');

            const cat = btn.getAttribute('data-categoria');
            
            // Define o novo título da tela
            let titulo = 'Escolha aleatória';
            if (cat === 'assistidos') titulo = 'Filmes Assistidos';
            if (cat === 'adicionados') titulo = 'Adicionados Recentemente';
            if (cat === 'filtro') titulo = 'Filtros (Em breve)';

            if(cat !== 'filtro') {
                carregarFilmes(cat, titulo);
            }
        });
    });

    // Troca de informações visuais do PS5
    function focarFilme(index) {
        const filme = filmes[index];
        bgLayer.style.backgroundImage = `url('${filme.backdrop}')`;
        titleEl.textContent = filme.titulo;
        synopsisEl.textContent = filme.sinopse;
        
        let tagsHTML = '';
        if (filme.ano) tagsHTML += `<span>${filme.ano}</span>`;
        if (filme.duracao) tagsHTML += `<span>${filme.duracao}</span>`;
        if (filme.diretor) tagsHTML += `<span>${filme.diretor}</span>`;
        if (filme.generos) tagsHTML += `<span>${filme.generos}</span>`;
        metaEl.innerHTML = tagsHTML;

        document.querySelectorAll('.movie-card').forEach((card, i) => {
            if (i === index) card.classList.add('active');
            else card.classList.remove('active');
        });
    }

    // Renderiza as capas no fundo
    function renderizarCarrossel() {
        carouselEl.innerHTML = ''; 
        filmes.forEach((filme, index) => {
            const img = document.createElement('img');
            img.src = filme.poster; 
            img.className = 'movie-card';
            img.addEventListener('mouseenter', () => focarFilme(index));
            carouselEl.appendChild(img);
        });
    }
});