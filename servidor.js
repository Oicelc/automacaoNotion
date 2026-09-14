const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Rota raiz (Health Check)
app.get('/', (req, res) => {
    res.send('🤖 QG Central dos Sentinelas está Operacional!');
});

// O NOVO HUD EM HTML
app.get('/hud-livros', async (req, res) => {
    try {
        const notionHeaders = {
            "Authorization": `Bearer ${process.env.NOTION_API_KEY}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json"
        };

        // 1. Busca os dados no Notion
        const respostaBusca = await axios.post(
            `https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_LIVROS}/query`,
            {
                filter: {
                    and: [
                        { property: "Finished", date: { on_or_after: "2026-01-01" } },
                        { property: "Finished", date: { before: "2027-01-01" } }
                    ]
                }
            },
            { headers: notionHeaders }
        );

        const livros = respostaBusca.data.results;
        const quantidadeLidos = livros.length;
        
        let totalPaginas = 0;
        for (const livro of livros) {
            totalPaginas += livro.properties["Página total"]?.number || 0; 
        }

        const metaAnual = 10;
        const porcentagem = Math.min(Math.floor((quantidadeLidos / metaAnual) * 100), 100);

        // 2. Monta o HTML e o CSS do seu HUD ajustado
        const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
                
                * {
                    box-sizing: border-box; /* Garante que o padding não quebre a largura */
                }
                
                body {
                    margin: 0;
                    padding: 8px; /* Padding menor para aproveitar melhor o iframe */
                    background-color: #191919;
                    color: #E0E0E0;
                    font-family: 'Inter', sans-serif;
                    display: flex;
                    justify-content: space-between; /* Distribui o espaço uniformemente */
                    align-items: stretch; /* Força todos os cartões a terem a mesma altura */
                    height: 100vh; /* Ocupa 100% da altura do iframe */
                    overflow: hidden; /* Corta qualquer barra de rolagem indesejada */
                }
                
                .card {
                    background: #252525;
                    border-left: 4px solid #9b51e0;
                    padding: 15px;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                    text-align: center;
                    width: 32%; /* Deixa 4% de margem total para respirar */
                    display: flex;
                    flex-direction: column;
                    justify-content: center; /* Centraliza o texto verticalmente */
                    align-items: center;
                }
                
                .title { 
                    font-size: 11px; 
                    text-transform: uppercase; 
                    letter-spacing: 1px; 
                    color: #888; 
                    margin: 0 0 8px 0; 
                }
                
                .value { 
                    font-size: 32px; 
                    font-weight: bold; 
                    color: #fff; 
                    margin: 0; 
                }
                
                .progress-bg { 
                    background: #333; 
                    border-radius: 10px; 
                    height: 8px; 
                    width: 100%; 
                    margin-top: 15px; 
                    overflow: hidden; 
                }
                
                .progress-bar { 
                    background: #9b51e0; 
                    height: 100%; 
                    width: ${porcentagem}%; 
                    transition: width 1s ease-in-out; 
                }
            </style>
        </head>
        <body>
            <div class="card">
                <p class="title">Livros Lidos</p>
                <p class="value">${quantidadeLidos} / ${metaAnual}</p>
                <div class="progress-bg"><div class="progress-bar"></div></div>
            </div>
            <div class="card">
                <p class="title">Páginas Devoradas</p>
                <p class="value">${totalPaginas}</p>
            </div>
            <div class="card">
                <p class="title">Ritmo</p>
                <p class="value">${porcentagem}%</p>
                <p class="title" style="margin-top:5px; font-size: 10px;">da meta anual</p>
            </div>
        </body>
        </html>
        `;

        // 3. Envia a página construída de volta para o Notion
        res.send(html);

    } catch (erro) {
        res.send(`<body style="color:white; background:#191919;">Erro ao carregar HUD: ${erro.message}</body>`);
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`);
});