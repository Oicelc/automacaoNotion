require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

const notionHeaders = {
    "Authorization": `Bearer ${process.env.NOTION_API_KEY}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
};

async function buscarTodosLivros() {
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
    return todosOsLivros;
}

// Parte 1 - cards
app.get('/hud-livros/cards', async (req, res) => {
    try {
        const livros = await buscarTodosLivros();
        const livrosLidosTotal = livros.length;
        
        let lidos2026 = 0;
        let paginas2026 = 0;

        livros.forEach(livro => {
            const dataTermino = livro.properties["Finished"]?.date?.start;
            if (dataTermino && dataTermino.startsWith("2026")) {
                lidos2026++;
                paginas2026 += livro.properties["Página total"]?.number || 0;
            }
        });

        const metaAnual = 10;
        const porcentagem = Math.min(Math.floor((lidos2026 / metaAnual) * 100), 100);

        const inicioAno = new Date("2026-01-01");
        const hoje = new Date();
        const diasPassados = Math.max(Math.ceil((hoje - inicioAno) / (1000 * 60 * 60 * 24)), 1);
        const paginasPorDia = (paginas2026 / diasPassados).toFixed(1);

        const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
                * { box-sizing: border-box; }
                body {
                    margin: 0; padding: 5px; background-color: #191919;
                    color: #E0E0E0; font-family: 'Inter', sans-serif;
                    display: flex; justify-content: space-between; gap: 15px;
                }
                .card {
                    background: #252525; border-left: 4px solid #9b51e0;
                    padding: 15px; border-radius: 8px; flex: 1; text-align: center;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; flex-direction: column; justify-content: center;
                }
                .title { font-size: 11px; text-transform: uppercase; color: #888; margin: 0 0 8px 0; }
                .value { font-size: 28px; font-weight: bold; color: #fff; margin: 0; }
                .progress-bg { background: #333; border-radius: 10px; height: 6px; width: 100%; margin-top: 10px; }
                .progress-bar { background: #9b51e0; height: 100%; width: ${porcentagem}%; }
                .sub-text { font-size: 10px; color: #777; margin-top: 5px; }
            </style>
        </head>
        <body>
            <div class="card">
                <p class="title">Total Vida</p>
                <p class="value">${livrosLidosTotal}</p>
                <p class="sub-text">livros concluídos</p>
            </div>
            <div class="card">
                <p class="title">Meta 2026</p>
                <p class="value">${lidos2026} / ${metaAnual}</p>
                <div class="progress-bg"><div class="progress-bar"></div></div>
            </div>
            <div class="card">
                <p class="title">Volume 2026</p>
                <p class="value">${paginas2026}</p>
                <p class="sub-text">páginas lidas</p>
            </div>
            <div class="card">
                <p class="title">Velocidade</p>
                <p class="value">${paginasPorDia}</p>
                <p class="sub-text">páginas por dia</p>
            </div>
        </body>
        </html>
        `;
        res.send(html);
    } catch (erro) { res.send(`<body style="color:white; background:#191919;">Erro: ${erro.message}</body>`); }
});

// Parte 2 - gráficos
app.get('/hud-livros/graficos', async (req, res) => {
    try {
        const notionHeaders = { "Authorization": `Bearer ${process.env.NOTION_API_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" };

        let todosOsLivros = [];
        let temMaisLivros = true;
        let cursorLivros = undefined;

        while (temMaisLivros) {
            const body = { filter: { property: "Finished", date: { is_not_empty: true } }, page_size: 100 };
            if (cursorLivros) body.start_cursor = cursorLivros;
            const resposta = await axios.post(`https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_LIVROS}/query`, body, { headers: notionHeaders });
            todosOsLivros.push(...resposta.data.results);
            temMaisLivros = resposta.data.has_more;
            cursorLivros = resposta.data.next_cursor;
        }

        const contagemAnos = {};
        const contagemMesesPorAno = {}; 
        const contagemGeneros = {};
        
        const capasPorAno = {};
        const capasPorMes = {};

        todosOsLivros.forEach(livro => {
            const dataTermino = livro.properties["Finished"]?.date?.start;
            if (!dataTermino) return;

            const ano = dataTermino.substring(0, 4);
            const mes = dataTermino.substring(5, 7); 

            let titulo = "Desconhecido";
            try { titulo = livro.properties["Livros"].title[0].plain_text; } catch(e){}
            
            let capa = "https://via.placeholder.com/100x150/252525/9b51e0?text=Capa";
            if (livro.cover?.external?.url) capa = livro.cover.external.url;
            else if (livro.cover?.file?.url) capa = livro.cover.file.url;
            else if (livro.icon?.external?.url) capa = livro.icon.external.url;

            contagemAnos[ano] = (contagemAnos[ano] || 0) + 1;
            if (!contagemMesesPorAno[ano]) contagemMesesPorAno[ano] = { "01":0, "02":0, "03":0, "04":0, "05":0, "06":0, "07":0, "08":0, "09":0, "10":0, "11":0, "12":0 };
            contagemMesesPorAno[ano][mes] += 1;

            const generos = livro.properties["Gênero"]?.multi_select || [];
            generos.forEach(g => { contagemGeneros[g.name] = (contagemGeneros[g.name] || 0) + 1; });

            if (!capasPorAno[ano]) capasPorAno[ano] = [];
            capasPorAno[ano].push({ titulo, capa });

            if (!capasPorMes[ano]) capasPorMes[ano] = {};
            if (!capasPorMes[ano][mes]) capasPorMes[ano][mes] = [];
            capasPorMes[ano][mes].push({ titulo, capa });
        });

        const dadosRadar = {};
        Object.keys(contagemGeneros).forEach(g => dadosRadar[g] = contagemGeneros[g]); 

        const hoje = new Date();
        const umAnoAtras = new Date();
        umAnoAtras.setDate(hoje.getDate() - 365);
        
        let todoDiario = [];
        let temMaisDiario = true;
        let cursorDiario = undefined;

        while (temMaisDiario) {
            const body = { filter: { property: "Data", date: { on_or_after: umAnoAtras.toISOString().split('T')[0] } }, page_size: 100 };
            if (cursorDiario) body.start_cursor = cursorDiario;
            const resDiario = await axios.post(`https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_DIARIO}/query`, body, { headers: notionHeaders });
            todoDiario.push(...resDiario.data.results);
            temMaisDiario = resDiario.data.has_more;
            cursorDiario = resDiario.data.next_cursor;
        }

        const mapaCalorDados = {};
        todoDiario.forEach(registro => {
            const dataRegistro = registro.properties["Data"]?.date?.start;
            const paginas = registro.properties["# Páginas Lidas"]?.number || 0;
            if (dataRegistro && paginas > 0) {
                mapaCalorDados[dataRegistro.substring(0, 10)] = (mapaCalorDados[dataRegistro.substring(0, 10)] || 0) + paginas;
            }
        });

        const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
                * { box-sizing: border-box; }
                body { margin: 0; padding: 15px; background-color: #191919; font-family: 'Inter', sans-serif; color: #E0E0E0; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
                .tabs { display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid #333; padding-bottom: 10px; }
                .tab-btn { background: none; border: none; color: #888; font-size: 14px; font-weight: bold; cursor: pointer; padding: 5px 10px; border-radius: 4px; transition: 0.2s; }
                .tab-btn:hover { color: #fff; background: #252525; }
                .tab-btn.active { color: #fff; background: #9b51e0; }
                .tab-content { display: none; flex-grow: 1; background: #252525; padding: 15px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); flex-direction: column; }
                .tab-content.active { display: flex; }
                .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
                .chart-title { font-size: 16px; font-weight: bold; color: #ccc; margin: 0; }
                .control-group { display: flex; gap: 10px; align-items: center; }
                select, button { background: #333; color: #fff; border: 1px solid #444; border-radius: 4px; padding: 6px 10px; font-size: 12px; cursor: pointer; outline: none; }
                button.active { background: #9b51e0; border-color: #9b51e0; }
                .canvas-container { flex-grow: 1; position: relative; min-height: 0; }
                .heatmap-container { 
                    display: flex; 
                    gap: 6px; 
                    justify-content: center; 
                    align-items: center; 
                    flex-grow: 1; 
                    overflow-x: auto; 
                    padding: 20px;
                }
                .heatmap-col { 
                    display: flex; 
                    flex-direction: column; 
                    gap: 6px; 
                }
                .heat-square { 
                    width: 20px; 
                    height: 20px; 
                    background: #333; 
                    border-radius: 4px; 
                    transition: transform 0.1s; 
                    cursor: pointer;
                }
                .heat-square:hover { transform: scale(1.3); z-index: 10; border: 1px solid #fff; }
                .lvl-1 { background: #4a2171; } .lvl-2 { background: #7131ab; } .lvl-3 { background: #9b51e0; } .lvl-4 { background: #d09cff; }
            </style>
        </head>
        <body>
            <div class="tabs">
                <button class="tab-btn active" onclick="abrirAba('abaHeatmap', this)">Frequência (Diário)</button>
                <button class="tab-btn" onclick="abrirAba('abaLinha', this)">Linha do Tempo</button>
                <button class="tab-btn" onclick="abrirAba('abaRadar', this)">Ecossistema</button>
            </div>

            <div id="abaHeatmap" class="tab-content active">
                <div class="header-row"><p class="chart-title">Hábito de Leitura (Últimos 365 Dias)</p></div>
                <div class="heatmap-container" id="heatmapGrid"></div>
            </div>

            <div id="abaLinha" class="tab-content">
                <div class="header-row">
                    <div>
                        <p class="chart-title">Livros Lidos</p>
                        <p id="totalLinha" style="margin: 3px 0 0 0; font-size: 12px; font-weight: bold; color: #9b51e0;"></p>
                    </div>
                    <div class="control-group">
                        <select id="selectAno" onchange="atualizarGraficoLinha()"></select>
                        <button id="btnVisao" onclick="toggleVisao()">Ver Todos os Anos</button>
                    </div>
                </div>
                <div class="canvas-container"><canvas id="graficoTempo"></canvas></div>
            </div>

            <div id="abaRadar" class="tab-content">
                <div class="header-row"><p class="chart-title">Distribuição de Gêneros</p></div>
                <div class="canvas-container"><canvas id="graficoRadar"></canvas></div>
            </div>

            <script>
                const contagemAnos = ${JSON.stringify(contagemAnos)};
                const contagemMesesPorAno = ${JSON.stringify(contagemMesesPorAno)};
                const capasPorAno = ${JSON.stringify(capasPorAno)};
                const capasPorMes = ${JSON.stringify(capasPorMes)};
                const dadosRadar = ${JSON.stringify(dadosRadar)};
                const mapaCalorDados = ${JSON.stringify(mapaCalorDados)};
                const nomesMeses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

                Chart.defaults.color = '#888';
                Chart.defaults.font.family = 'Inter';

                function abrirAba(idAba, elementoBtn) {
                    document.querySelectorAll('.tab-content').forEach(aba => aba.classList.remove('active'));
                    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                    document.getElementById(idAba).classList.add('active');
                    elementoBtn.classList.add('active');
                }

                function renderizarHeatmap() {
                    const container = document.getElementById('heatmapGrid');
                    let dataAtual = new Date();
                    dataAtual.setDate(dataAtual.getDate() - 364); 
                    
                    let htmlColunas = '';
                    let colAtual = '<div class="heatmap-col">';
                    
                    for (let i = 0; i < 365; i++) {
                        const dataString = dataAtual.toISOString().split('T')[0];
                        const paginas = mapaCalorDados[dataString] || 0;
                        
                        let classeNivel = '';
                        if (paginas > 0 && paginas <= 15) classeNivel = 'lvl-1';
                        else if (paginas > 15 && paginas <= 30) classeNivel = 'lvl-2';
                        else if (paginas > 30 && paginas <= 60) classeNivel = 'lvl-3';
                        else if (paginas > 60) classeNivel = 'lvl-4';

                        const dataFormatada = dataString.split('-').reverse().join('/');
                        const titulo = paginas > 0 ? paginas + ' páginas em ' + dataFormatada : 'Nenhuma página em ' + dataFormatada;

                        colAtual += '<div class="heat-square ' + classeNivel + '" title="' + titulo + '"></div>';
                        
                        if ((i + 1) % 7 === 0 || i === 364) {
                            colAtual += '</div>';
                            htmlColunas += colAtual;
                            colAtual = '<div class="heatmap-col">';
                        }
                        dataAtual.setDate(dataAtual.getDate() + 1);
                    }
                    container.innerHTML = htmlColunas;
                }
                renderizarHeatmap();

                // capas flutuantes
                const geradorDeTooltip = (context) => {
                    const chart = context.chart;
                    const tooltip = context.tooltip;
                    
                    let tooltipEl = document.getElementById('chartjs-tooltip');
                    if (!tooltipEl) {
                        tooltipEl = document.createElement('div');
                        tooltipEl.id = 'chartjs-tooltip';
                        tooltipEl.style.background = 'rgba(25, 25, 25, 0.95)';
                        tooltipEl.style.border = '1px solid #9b51e0';
                        tooltipEl.style.borderRadius = '6px';
                        tooltipEl.style.color = 'white';
                        tooltipEl.style.pointerEvents = 'none';
                        tooltipEl.style.position = 'absolute';
                        tooltipEl.style.transform = 'translate(-50%, 15px)';
                        tooltipEl.style.zIndex = 100;
                        tooltipEl.style.padding = '10px';
                        tooltipEl.style.boxShadow = '0 4px 10px rgba(0,0,0,0.5)';
                        chart.canvas.parentNode.appendChild(tooltipEl);
                    }

                    if (tooltip.opacity === 0) {
                        tooltipEl.style.opacity = 0;
                        return;
                    }

                    if (tooltip.body) {
                        const label = tooltip.dataPoints[0].label; 
                        const value = tooltip.dataPoints[0].raw; 
                        
                        let livrosEncontrados = [];
                        if (visaoAnoAtual) {
                            const anoSel = selectAno.value;
                            const mesIndex = nomesMeses.indexOf(label) + 1;
                            const mesString = mesIndex < 10 ? '0' + mesIndex : '' + mesIndex;
                            if (capasPorMes[anoSel] && capasPorMes[anoSel][mesString]) {
                                livrosEncontrados = capasPorMes[anoSel][mesString];
                            }
                        } else {
                            if (capasPorAno[label]) livrosEncontrados = capasPorAno[label];
                        }

                        let htmlInterno = '<p style="margin:0 0 8px 0; font-weight:bold; text-align:center; color:#9b51e0;">' + label + ': ' + value + ' livro(s)</p>';
                        htmlInterno += '<div style="display:flex; gap:6px; flex-wrap:wrap; max-width: 200px; justify-content:center;">';
                        
                        // Cria uma miniatura para cada livro
                        livrosEncontrados.forEach(function(l) {
                            htmlInterno += '<img src="' + l.capa + '" title="' + l.titulo + '" style="width:40px; height:60px; object-fit:cover; border-radius:3px;">';
                        });
                        
                        htmlInterno += '</div>';
                        tooltipEl.innerHTML = htmlInterno;
                    }

                    tooltipEl.style.opacity = 1;
                    tooltipEl.style.left = tooltip.caretX + 'px';
                    tooltipEl.style.top = tooltip.caretY + 'px';
                };

                let graficoTempo;
                let visaoAnoAtual = true; 
                const selectAno = document.getElementById('selectAno');
                
                Object.keys(contagemAnos).sort().reverse().forEach(ano => {
                    const opt = document.createElement('option');
                    opt.value = ano; opt.textContent = ano;
                    selectAno.appendChild(opt);
                });

                function renderLinha(labels, valores) {
                    if (graficoTempo) graficoTempo.destroy();
                    graficoTempo = new Chart(document.getElementById('graficoTempo').getContext('2d'), {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [{
                                data: valores,
                                borderColor: '#9b51e0', backgroundColor: 'rgba(155, 81, 224, 0.1)',
                                borderWidth: 3, fill: true, tension: 0.3, pointBackgroundColor: '#fff',
                                pointHoverRadius: 6, pointHoverBackgroundColor: '#9b51e0'
                            }]
                        },
                        options: { 
                            responsive: true, 
                            maintainAspectRatio: false, 
                            plugins: { 
                                legend: { display: false },
                                tooltip: { enabled: false, external: geradorDeTooltip } // Desliga tooltip normal
                            }, 
                            scales: { x: { grid: { display: false } }, y: { grid: { color: '#333' }, beginAtZero: true, ticks: { stepSize: 1 } } } 
                        }
                    });
                }

                function atualizarGraficoLinha() {
                    if (visaoAnoAtual) {
                        const anoSelecionado = selectAno.value;
                        const dadosMesesSelecionados = contagemMesesPorAno[anoSelecionado] || {};
                        const valoresOrdenados = Object.keys(dadosMesesSelecionados).sort().map(k => dadosMesesSelecionados[k]);
                        
                        const totalAno = valoresOrdenados.reduce((a, b) => a + b, 0);
                        document.getElementById('totalLinha').textContent = 'Total em ' + anoSelecionado + ': ' + totalAno + ' livros';
                        
                        renderLinha(nomesMeses, valoresOrdenados);
                    } else {
                        const anosOrdenados = Object.keys(contagemAnos).sort();
                        const valoresAnos = anosOrdenados.map(a => contagemAnos[a]);
                        
                        const totalGeral = valoresAnos.reduce((a, b) => a + b, 0);
                        document.getElementById('totalLinha').textContent = 'Total de todos os anos: ' + totalGeral + ' livros';
                        
                        renderLinha(anosOrdenados, valoresAnos);
                    }
                }

                function toggleVisao() {
                    visaoAnoAtual = !visaoAnoAtual;
                    const btn = document.getElementById('btnVisao');
                    // Esconde a div do tooltip para não bugar durante a transição
                    const tooltipEl = document.getElementById('chartjs-tooltip');
                    if(tooltipEl) tooltipEl.style.opacity = 0;

                    if (visaoAnoAtual) {
                        btn.textContent = "Ver Todos os Anos"; btn.classList.remove('active'); selectAno.disabled = false;
                    } else {
                        btn.textContent = "Ver Meses"; btn.classList.add('active'); selectAno.disabled = true;
                    }
                    atualizarGraficoLinha();
                }
                atualizarGraficoLinha();

                new Chart(document.getElementById('graficoRadar').getContext('2d'), {
                    type: 'radar',
                    data: {
                        labels: Object.keys(dadosRadar),
                        datasets: [{
                            data: Object.values(dadosRadar),
                            backgroundColor: 'rgba(155, 81, 224, 0.2)', borderColor: '#9b51e0', pointBackgroundColor: '#9b51e0', borderWidth: 2
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { angleLines: { color: '#333' }, grid: { color: '#333' }, pointLabels: { color: '#ccc', font: { size: 11 } }, ticks: { display: false } } } }
                });
            </script>
        </body>
        </html>
        `;
        res.send(html);
    } catch (erro) { res.send(`<body style="color:white; background:#191919;">Erro: ${erro.message}</body>`); }
});

// Parte 3 - Galeria
app.get('/hud-livros/galeria', async (req, res) => {
    try {
        const notionHeaders = {
            "Authorization": `Bearer ${process.env.NOTION_API_KEY}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json"
        };

        const resLidos = await axios.post(
            `https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_LIVROS}/query`,
            { 
                filter: { property: "Finished", date: { is_not_empty: true } },
                sorts: [{ property: "Finished", direction: "descending" }],
                page_size: 10 
            }, 
            { headers: notionHeaders }
        );
        const livrosLidos = resLidos.data.results;

        const resFila = await axios.post(
            `https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_LIVROS}/query`,
            { 
                filter: { property: "Ler a seguir", checkbox: { equals: true } },
                page_size: 10 
            }, 
            { headers: notionHeaders }
        );
        const livrosFila = resFila.data.results;

        async function extrairDados(lista) {
            const formatados = [];
            for (const livro of lista) {
                const titulo = livro.properties["Livros"]?.title[0]?.plain_text || "Título Desconhecido";
                const autor = livro.properties["Autor"]?.select?.name || "Autor Desconhecido";
                const paginas = livro.properties["Página total"]?.number || "?";
                const generos = livro.properties["Gênero"]?.multi_select.map(g => g.name).join(", ") || "Sem Gênero";
                let capa = livro.cover?.external?.url || livro.cover?.file?.url || livro.icon?.external?.url || "https://via.placeholder.com/200x300/252525/9b51e0?text=Sem+Capa";
                
                let sinopse = "Sem sinopse disponível.";
                try {
                    const blocos = await axios.get(`https://api.notion.com/v1/blocks/${livro.id}/children`, { headers: notionHeaders });
                    const paragrafo = blocos.data.results.find(b => b.type === 'paragraph' && b.paragraph?.rich_text?.length > 0);
                    if (paragrafo) {
                        sinopse = paragrafo.paragraph.rich_text[0].plain_text.substring(0, 150) + "..."; 
                    }
                } catch (e) { }

                formatados.push({ titulo, autor, paginas, generos, capa, sinopse });
            }
            return formatados;
        }

        const [dadosLidos, dadosFila] = await Promise.all([
            extrairDados(livrosLidos),
            extrairDados(livrosFila)
        ]);

        const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
                * { box-sizing: border-box; }
                body { margin: 0; padding: 15px; background-color: #191919; font-family: 'Inter', sans-serif; color: #E0E0E0; display: flex; gap: 20px; height: 100vh; overflow: hidden; }
                
                .panel { flex: 1; background: #252525; border-radius: 8px; padding: 15px; display: flex; flex-direction: column; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
                .panel-header { font-size: 14px; font-weight: bold; color: #ccc; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; }
                
                .carousel { display: flex; align-items: center; justify-content: space-between; flex-grow: 1; }
                .nav-btn { background: #333; color: #fff; border: none; font-size: 20px; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
                .nav-btn:hover { background: #9b51e0; transform: scale(1.1); }
                
                .book-card { display: flex; gap: 20px; flex-grow: 1; align-items: stretch; padding: 0 10px; }
                .book-cover { width: 140px; border-radius: 6px; object-fit: cover; box-shadow: 2px 4px 10px rgba(0,0,0,0.5); }
                .book-info { flex: 1; display: flex; flex-direction: column; justify-content: center; }
                
                .b-title { font-size: 18px; font-weight: bold; color: #fff; margin: 0 0 5px 0; line-height: 1.2; }
                .b-author { font-size: 13px; color: #9b51e0; margin: 0 0 10px 0; font-weight: bold; }
                .b-meta { font-size: 11px; color: #888; margin: 0 0 10px 0; background: #191919; padding: 4px 8px; border-radius: 4px; display: inline-block; width: fit-content; }
                .b-synopsis { font-size: 12px; color: #bbb; line-height: 1.5; margin: 0; font-style: italic; }
            </style>
        </head>
        <body>
            <div class="panel">
                <div class="panel-header">Últimas Leituras</div>
                <div class="carousel">
                    <button class="nav-btn" onclick="mudarLivro('lidos', -1)">❮</button>
                    <div class="book-card">
                        <img id="imgLido" class="book-cover" src="">
                        <div class="book-info">
                            <p id="tituloLido" class="b-title"></p>
                            <p id="autorLido" class="b-author"></p>
                            <p id="metaLido" class="b-meta"></p>
                            <p id="sinopseLido" class="b-synopsis"></p>
                        </div>
                    </div>
                    <button class="nav-btn" onclick="mudarLivro('lidos', 1)">❯</button>
                </div>
            </div>

            <div class="panel" style="border-left: 4px solid #9b51e0;">
                <div class="panel-header">Ler a Seguir</div>
                <div class="carousel">
                    <button class="nav-btn" onclick="mudarLivro('fila', -1)">❮</button>
                    <div class="book-card">
                        <img id="imgFila" class="book-cover" src="">
                        <div class="book-info">
                            <p id="tituloFila" class="b-title"></p>
                            <p id="autorFila" class="b-author"></p>
                            <p id="metaFila" class="b-meta"></p>
                            <p id="sinopseFila" class="b-synopsis"></p>
                        </div>
                    </div>
                    <button class="nav-btn" onclick="mudarLivro('fila', 1)">❯</button>
                </div>
            </div>

            <script>
                const listaLidos = ${JSON.stringify(dadosLidos)};
                const listaFila = ${JSON.stringify(dadosFila)};
                
                let indexLidos = 0;
                let indexFila = 0;

                function renderizarPainel(tipo) {
                    const dados = tipo === 'lidos' ? listaLidos : listaFila;
                    const index = tipo === 'lidos' ? indexLidos : indexFila;
                    const sufixo = tipo === 'lidos' ? 'Lido' : 'Fila';

                    if (!dados || dados.length === 0) {
                        document.getElementById('titulo' + sufixo).textContent = "Nenhum livro marcado.";
                        document.getElementById('img' + sufixo).src = "https://via.placeholder.com/200x300/252525/9b51e0?text=Vazio";
                        document.getElementById('autor' + sufixo).textContent = "";
                        document.getElementById('meta' + sufixo).textContent = "";
                        document.getElementById('sinopse' + sufixo).textContent = "";
                        return;
                    }
                    
                    const livro = dados[index];
                    document.getElementById('img' + sufixo).src = livro.capa;
                    document.getElementById('titulo' + sufixo).textContent = livro.titulo;
                    document.getElementById('autor' + sufixo).textContent = livro.autor;
                    document.getElementById('meta' + sufixo).textContent = livro.paginas + ' págs  •  ' + livro.generos;
                    document.getElementById('sinopse' + sufixo).textContent = '"' + livro.sinopse + '"';
                }

                function mudarLivro(tipo, direcao) {
                    const dados = tipo === 'lidos' ? listaLidos : listaFila;
                    if (!dados || dados.length === 0) return;

                    if (tipo === 'lidos') {
                        indexLidos += direcao;
                        if (indexLidos < 0) indexLidos = listaLidos.length - 1;
                        if (indexLidos >= listaLidos.length) indexLidos = 0;
                    } else {
                        indexFila += direcao;
                        if (indexFila < 0) indexFila = listaFila.length - 1;
                        if (indexFila >= listaFila.length) indexFila = 0;
                    }
                    renderizarPainel(tipo);
                }

                renderizarPainel('lidos');
                renderizarPainel('fila');
            </script>
        </body>
        </html>
        `;
        res.send(html);
    } catch (erro) { res.send(`<body style="color:white; background:#191919;">Erro: ${erro.message}</body>`); }
});

app.listen(PORT, () => { console.log(`🌐 Servidor rodando na porta ${PORT}`); });