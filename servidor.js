const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 QG Central dos Sentinelas está Operacional!');
});

app.get('/hud-livros', async (req, res) => {
    try {
        const notionHeaders = {
            "Authorization": `Bearer ${process.env.NOTION_API_KEY}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json"
        };

        // 1. VARREDURA COMPLETA (Paginada para pegar todos os livros lidos na vida)
        let todosOsLivros = [];
        let temMais = true;
        let cursor = undefined;

        while (temMais) {
            const body = {
                filter: { property: "Finished", date: { is_not_empty: true } },
                page_size: 100
            };
            if (cursor) body.start_cursor = cursor;

            const resposta = await axios.post(
                `https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_LIVROS}/query`,
                body,
                { headers: notionHeaders }
            );

            todosOsLivros.push(...resposta.data.results);
            temMais = resposta.data.has_more;
            cursor = resposta.data.next_cursor;
        }

        // 2. PROCESSAMENTO DE DADOS (Matemática e Agrupamentos)
        const livrosLidosTotal = todosOsLivros.length;
        let lidos2026 = 0;
        let paginas2026 = 0;
        
        const contagemAnos = {};
        const contagemMeses = {};
        const contagemGeneros = {};

        todosOsLivros.forEach(livro => {
            const dataTermino = livro.properties["Finished"]?.date?.start;
            if (!dataTermino) return;

            const ano = dataTermino.substring(0, 4);
            const mes = dataTermino.substring(0, 7); // Ex: 2026-05

            // Agrupando Tempo
            contagemAnos[ano] = (contagemAnos[ano] || 0) + 1;
            contagemMeses[mes] = (contagemMeses[mes] || 0) + 1;

            // Filtro específico para as métricas do ano atual
            if (ano === "2026") {
                lidos2026++;
                paginas2026 += livro.properties["Página total"]?.number || 0;
            }

            // Agrupando Gêneros
            const generos = livro.properties["Gênero"]?.multi_select || [];
            generos.forEach(g => {
                contagemGeneros[g.name] = (contagemGeneros[g.name] || 0) + 1;
            });
        });

        const metaAnual = 20;
        const porcentagem = Math.min(Math.floor((lidos2026 / metaAnual) * 100), 100);

        // 3. O HTML MESTRE (Com CSS Grid e Chart.js)
        const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
                * { box-sizing: border-box; }
                body {
                    margin: 0; padding: 15px; background-color: #191919;
                    color: #E0E0E0; font-family: 'Inter', sans-serif;
                }
                
                /* Layout dos Cartões no Topo */
                .cards-container {
                    display: flex; justify-content: space-between; gap: 15px; margin-bottom: 25px;
                }
                .card {
                    background: #252525; border-left: 4px solid #9b51e0;
                    padding: 15px; border-radius: 8px; flex: 1; text-align: center;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                }
                .title { font-size: 11px; text-transform: uppercase; color: #888; margin: 0 0 8px 0; }
                .value { font-size: 28px; font-weight: bold; color: #fff; margin: 0; }
                
                .progress-bg { background: #333; border-radius: 10px; height: 6px; width: 100%; margin-top: 10px; }
                .progress-bar { background: #9b51e0; height: 100%; width: ${porcentagem}%; }

                /* Layout dos Gráficos */
                .charts-container {
                    display: flex; gap: 20px;
                }
                .chart-box {
                    background: #252525; padding: 15px; border-radius: 8px; flex: 1;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.3); position: relative;
                }
                .chart-header {
                    display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;
                }
                .chart-title { font-size: 14px; font-weight: bold; color: #ccc; margin: 0; }
                
                /* Botões de Toggle */
                .toggle-btn {
                    background: #333; color: #fff; border: 1px solid #444; border-radius: 4px;
                    padding: 4px 8px; font-size: 10px; cursor: pointer;
                }
                .toggle-btn.active { background: #9b51e0; border-color: #9b51e0; }
            </style>
        </head>
        <body>
            <!-- 1. OS CARTÕES DE MÉTRICAS -->
            <div class="cards-container">
                <div class="card">
                    <p class="title">Total Vida</p>
                    <p class="value">${livrosLidosTotal}</p>
                </div>
                <div class="card">
                    <p class="title">Lidos (2026)</p>
                    <p class="value">${lidos2026} / ${metaAnual}</p>
                    <div class="progress-bg"><div class="progress-bar"></div></div>
                </div>
                <div class="card">
                    <p class="title">Páginas (2026)</p>
                    <p class="value">${paginas2026}</p>
                </div>
                <div class="card">
                    <p class="title">Ritmo (2026)</p>
                    <p class="value">${porcentagem}%</p>
                </div>
            </div>

            <!-- 2. OS GRÁFICOS -->
            <div class="charts-container">
                <!-- Gráfico de Linha do Tempo -->
                <div class="chart-box" style="flex: 1.2;">
                    <div class="chart-header">
                        <p class="chart-title">Histórico de Leitura</p>
                        <div>
                            <button id="btnAno" class="toggle-btn active" onclick="mudarGraficoTempo('ano')">Anos</button>
                            <button id="btnMes" class="toggle-btn" onclick="mudarGraficoTempo('mes')">Meses</button>
                        </div>
                    </div>
                    <canvas id="graficoTempo" height="180"></canvas>
                </div>

                <!-- Gráfico de Gêneros -->
                <div class="chart-box" style="flex: 0.8;">
                    <div class="chart-header">
                        <p class="chart-title">Distribuição por Gênero</p>
                    </div>
                    <canvas id="graficoGeneros" height="230"></canvas>
                </div>
            </div>

            <!-- 3. SCRIPTS PARA RENDERIZAR OS GRÁFICOS -->
            <script>
                // Recebendo os dados do Node.js
                const dadosAnos = ${JSON.stringify(contagemAnos)};
                const dadosMeses = ${JSON.stringify(contagemMeses)};
                const dadosGeneros = ${JSON.stringify(contagemGeneros)};

                // Configuração Global de Cores do Chart.js
                Chart.defaults.color = '#888';
                Chart.defaults.font.family = 'Inter';

                // --- GRÁFICO DE GÊNEROS (Barra Horizontal) ---
                const ctxGeneros = document.getElementById('graficoGeneros').getContext('2d');
                new Chart(ctxGeneros, {
                    type: 'bar',
                    data: {
                        // Ordena os gêneros do mais lido para o menos lido
                        labels: Object.keys(dadosGeneros).sort((a,b) => dadosGeneros[b] - dadosGeneros[a]),
                        datasets: [{
                            label: 'Livros',
                            data: Object.keys(dadosGeneros).sort((a,b) => dadosGeneros[b] - dadosGeneros[a]).map(k => dadosGeneros[k]),
                            backgroundColor: '#9b51e0',
                            borderRadius: 4
                        }]
                    },
                    options: {
                        indexAxis: 'y', // Deixa as barras deitadas
                        responsive: true,
                        plugins: { legend: { display: false } },
                        scales: { x: { grid: { color: '#333' } }, y: { grid: { display: false } } }
                    }
                });

                // --- GRÁFICO DE TEMPO (Linha/Barra) ---
                let graficoTempo;
                const ctxTempo = document.getElementById('graficoTempo').getContext('2d');
                
                function renderizarGraficoTempo(labels, valores) {
                    if (graficoTempo) graficoTempo.destroy();
                    graficoTempo = new Chart(ctxTempo, {
                        type: 'line', // Gráfico de linha estilizado
                        data: {
                            labels: labels.sort(),
                            datasets: [{
                                label: 'Livros Lidos',
                                data: labels.sort().map(k => valores[k]),
                                borderColor: '#00d2ff',
                                backgroundColor: 'rgba(0, 210, 255, 0.1)',
                                borderWidth: 3,
                                fill: true,
                                tension: 0.3, // Deixa a linha suave/curvada
                                pointBackgroundColor: '#fff'
                            }]
                        },
                        options: {
                            responsive: true,
                            plugins: { legend: { display: false } },
                            scales: { 
                                x: { grid: { display: false } }, 
                                y: { grid: { color: '#333' }, beginAtZero: true, ticks: { stepSize: 1 } } 
                            }
                        }
                    });
                }

                // Função de Toggle (Ano <-> Mês)
                window.mudarGraficoTempo = function(tipo) {
                    if (tipo === 'ano') {
                        document.getElementById('btnAno').classList.add('active');
                        document.getElementById('btnMes').classList.remove('active');
                        renderizarGraficoTempo(Object.keys(dadosAnos), dadosAnos);
                    } else {
                        document.getElementById('btnAno').classList.remove('active');
                        document.getElementById('btnMes').classList.add('active');
                        renderizarGraficoTempo(Object.keys(dadosMeses), dadosMeses);
                    }
                };

                // Inicia renderizando o gráfico de anos
                mudarGraficoTempo('ano');
            </script>
        </body>
        </html>
        `;

        res.send(html);
    } catch (erro) {
        res.send(`<body style="color:white; background:#191919;">Erro: ${erro.message}</body>`);
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor rodando na porta ${PORT}`);
});