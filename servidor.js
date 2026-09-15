require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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
        const notionHeaders = { "Authorization": `Bearer ${process.env.NOTION_API_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" };
        const hoje = new Date();
        const anoAtual = hoje.getFullYear();
        const inicioDoAno = new Date(anoAtual, 0, 1);
        const diasNoAno = Math.ceil((hoje - inicioDoAno) / (1000 * 60 * 60 * 24)) || 1;

        let todosOsLivros = [];
        let temMais = true;
        let cursor = undefined;

        while (temMais) {
            const body = { filter: { property: "Finished", date: { is_not_empty: true } }, page_size: 100 };
            if (cursor) body.start_cursor = cursor;
            const resLivros = await axios.post(`https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_LIVROS}/query`, body, { headers: notionHeaders });
            todosOsLivros.push(...resLivros.data.results);
            temMais = resLivros.data.has_more;
            cursor = resLivros.data.next_cursor;
        }

        const totalLivrosHistorico = todosOsLivros.length;
        let lidosEsteAno = 0;
        let paginasEsteAno = 0;

        todosOsLivros.forEach(livro => {
            const dataTermino = livro.properties["Finished"]?.date?.start;
            if (dataTermino && dataTermino.startsWith(anoAtual.toString())) {
                lidosEsteAno++;
                paginasEsteAno += livro.properties["Página total"]?.number || 0;
            }
        });

        const metaAno = 10;
        const progressoMeta = Math.min((lidosEsteAno / metaAno) * 100, 100);

        const resDiario = await axios.post(`https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_DIARIO}/query`, {
            filter: { property: "Data", date: { on_or_after: `${anoAtual}-01-01` } }, page_size: 100
        }, { headers: notionHeaders });

        let paginasLidasDiario = 0;
        let diasUnicos = new Set();

        resDiario.data.results.forEach(reg => {
            const numProp = Object.values(reg.properties).find(p => p.type === 'number');
            if (numProp && numProp.number > 0) paginasLidasDiario += numProp.number;
            
            const dataProp = Object.values(reg.properties).find(p => p.type === 'date');
            if (dataProp && dataProp.date?.start) diasUnicos.add(dataProp.date.start.substring(0, 10));
        });

        const diasComLeitura = diasUnicos.size || 1;

        const velGeral = Math.round(paginasEsteAno / diasNoAno);
        const velPorDiaLido = Math.round(paginasLidasDiario / diasComLeitura);

        const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
                * { box-sizing: border-box; }
                body { margin: 0; padding: 15px; background-color: #191919; font-family: 'Inter', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
                
                .cards-container { display: flex; gap: 15px; width: 100%; justify-content: center; }
                
                .card { flex: 1; background: #252525; padding: 25px 15px; border-radius: 6px; border-left: 3px solid #9b51e0; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; text-align: center; min-width: 150px; }
                
                .card-title { color: #888; font-size: 10px; font-weight: bold; text-transform: uppercase; margin: 0 0 10px 0; letter-spacing: 1px; }
                .card-value { color: #fff; font-size: 28px; font-weight: bold; margin: 0; }
                .card-sub { color: #555; font-size: 10px; margin: 10px 0 0 0; }
                
                /* Barra da Meta (Card 2) */
                .progress-wrapper { width: 100%; height: 4px; background: #333; border-radius: 2px; margin-top: 15px; overflow: hidden; }
                .progress-fill { height: 100%; background: #9b51e0; border-radius: 2px; transition: width 0.3s ease; }
                
                /* Botão Alternar */
                .toggle-btn { position: absolute; top: 10px; right: 10px; background: #333; color: #aaa; border: none; border-radius: 4px; padding: 4px 6px; font-size: 9px; font-weight: bold; cursor: pointer; text-transform: uppercase; transition: 0.2s;}
                .toggle-btn:hover { background: #9b51e0; color: #fff; }
            </style>
        </head>
        <body>
            <div class="cards-container">
                
                <!-- Card 1: Total Vida -->
                <div class="card">
                    <p class="card-title">Total Vida</p>
                    <p class="card-value">${totalLivrosHistorico}</p>
                    <p class="card-sub">livros concluídos</p>
                </div>
                
                <!-- Card 2: Meta do Ano -->
                <div class="card">
                    <p class="card-title">Meta de livros</p>
                    <p class="card-value">${lidosEsteAno} / ${metaAno}</p>
                    <div class="progress-wrapper">
                        <div class="progress-fill" style="width: ${progressoMeta}%;"></div>
                    </div>
                </div>

                <!-- Card 3: Volume do Ano -->
                <div class="card">
                    <button class="toggle-btn" onclick="alternarVolume()">Alternar</button>
                    <p class="card-title" id="labelVolume">Quantidade de páginas</p>
                    <p class="card-value" id="valorVolume">${paginasEsteAno}</p>
                    <p class="card-sub" id="subVolume">páginas lidas</p>
                </div>

                <!-- Card 4: Velocidade com Toggle -->
                <div class="card">
                    <button class="toggle-btn" onclick="alternarVelocidade()">Alternar</button>
                    <p class="card-title" id="labelVelocidade">Velocidade</p>
                    <p class="card-value" id="valorVelocidade">${velGeral}</p>
                    <p class="card-sub">páginas por dia</p>
                </div>

            </div>

            <script>
                let modoGeral = true;
                function alternarVelocidade() {
                    modoGeral = !modoGeral;
                    if (modoGeral) {
                        document.getElementById('labelVelocidade').textContent = 'Média Geral';
                        document.getElementById('valorVelocidade').textContent = '${velGeral}';
                    } else {
                        document.getElementById('labelVelocidade').textContent = 'Por Dia Efetivo';
                        document.getElementById('valorVelocidade').textContent = '${velPorDiaLido}';
                    }
                }
                
                let modoVolumePaginas = true;
                function alternarVolume() {
                    modoVolumePaginas = !modoVolumePaginas;
                    if (modoVolumePaginas) {
                        document.getElementById('labelVolume').textContent = 'Quantidade de páginas';
                        document.getElementById('valorVolume').textContent = '${paginasEsteAno}';
                        document.getElementById('subVolume').textContent = 'páginas lidas';
                    } else {
                        document.getElementById('labelVolume').textContent = 'Quantidade de dias';
                        document.getElementById('valorVolume').textContent = '${diasComLeitura}';
                        document.getElementById('subVolume').textContent = 'dias de leitura';
                    }
                }
            </script>
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
            
            let paginas = 0;
            const propriedadeNumero = Object.values(registro.properties).find(p => p.type === 'number');
            if (propriedadeNumero) {
                paginas = propriedadeNumero.number || 0;
            }

            if (dataRegistro && paginas > 0) {
                const dataCurta = dataRegistro.substring(0, 10);
                mapaCalorDados[dataCurta] = (mapaCalorDados[dataCurta] || 0) + paginas;
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
                .heatmap-container { display: flex; gap: 6px; justify-content: center; align-items: center; flex-grow: 1; overflow-x: auto; padding: 20px;}
                .heatmap-col { display: flex; flex-direction: column; gap: 6px; }
                .heat-square { width: 20px; height: 20px; background: #333; border-radius: 4px; transition: transform 0.1s; cursor: pointer;}
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
                        const y = dataAtual.getFullYear();
                        const m = String(dataAtual.getMonth() + 1).padStart(2, '0');
                        const d = String(dataAtual.getDate()).padStart(2, '0');
                        const dataString = y + '-' + m + '-' + d;

                        const paginas = mapaCalorDados[dataString] || 0;
                        
                        let classeNivel = '';
                        if (paginas > 0 && paginas <= 15) classeNivel = 'lvl-1';
                        else if (paginas > 15 && paginas <= 30) classeNivel = 'lvl-2';
                        else if (paginas > 30 && paginas <= 60) classeNivel = 'lvl-3';
                        else if (paginas > 60) classeNivel = 'lvl-4';

                        const dataFormatada = d + '/' + m + '/' + y;
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
                                tooltip: { enabled: false, external: geradorDeTooltip } 
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
    } catch (erro) { res.send(`<body style="color:white; background:#191919;">Erro ao processar Gráficos: ${erro.message}</body>`); }
});

// Parte 3 - Galeria
app.get('/hud-livros/galeria', async (req, res) => {
    try {
        const notionHeaders = { "Authorization": `Bearer ${process.env.NOTION_API_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" };

        const resLidos = await axios.post(`https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_LIVROS}/query`,
            { filter: { property: "Finished", date: { is_not_empty: true } }, sorts: [{ property: "Finished", direction: "descending" }], page_size: 10 }, 
            { headers: notionHeaders }
        );
        const livrosLidos = resLidos.data.results;

        const resFila = await axios.post(`https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_LIVROS}/query`,
            { filter: { property: "Ler a seguir", checkbox: { equals: true } }, page_size: 10 }, 
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
                let capa = "https://via.placeholder.com/200x300/252525/9b51e0?text=Sem+Capa";
                if (livro.cover?.external?.url) capa = livro.cover.external.url;
                else if (livro.cover?.file?.url) capa = livro.cover.file.url;
                else if (livro.icon?.external?.url) capa = livro.icon.external.url;
                
                let sinopse = "Sem sinopse disponível.";
                try {
                    const blocos = await axios.get(`https://api.notion.com/v1/blocks/${livro.id}/children`, { headers: notionHeaders });
                    const paragrafo = blocos.data.results.find(b => b.type === 'paragraph' && b.paragraph?.rich_text?.length > 0);
                    if (paragrafo) sinopse = paragrafo.paragraph.rich_text[0].plain_text.substring(0, 200) + "..."; 
                } catch (e) { }

                let dataFormatada = "";
                let diasLidos = "";
                const dataFimStr = livro.properties["Finished"]?.date?.start;
                if (dataFimStr) {
                    const [ano, mes, dia] = dataFimStr.split("-");
                    dataFormatada = `${dia}/${mes}/${ano}`;
                    const dataInicioStr = livro.properties["Started"]?.date?.start;
                    if (dataInicioStr) {
                        const fim = new Date(dataFimStr);
                        const inicio = new Date(dataInicioStr);
                        const diffDias = Math.ceil(Math.abs(fim-inicio) / (1000 * 60 * 60 * 24));
                        diasLidos = diffDias === 0 ? 1 : diffDias;
                    }
                }

                formatados.push({ titulo, autor, paginas, generos, capa, sinopse, dataFormatada, diasLidos });
            }
            return formatados;
        }

        const [dadosLidos, dadosFila] = await Promise.all([ extrairDados(livrosLidos), extrairDados(livrosFila) ]);

        const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
                * { box-sizing: border-box; }
                body { margin: 0; padding: 15px; background-color: #191919; font-family: 'Inter', sans-serif; color: #E0E0E0; display: flex; gap: 20px; height: 100vh; overflow: hidden; }
                
                .panel { flex: 1; background: #252525; border-radius: 8px; padding: 20px; display: flex; flex-direction: column; box-shadow: 0 4px 10px rgba(0,0,0,0.5); border-top: 4px solid #9b51e0; height: 100%;}
                .panel-header { font-size: 14px; font-weight: bold; color: #ccc; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; text-align: center; }
                
                .carousel { display: flex; align-items: center; justify-content: space-between; flex-grow: 1; }
                .nav-btn { background: #333; color: #fff; border: none; font-size: 20px; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .nav-btn:hover { background: #9b51e0; transform: scale(1.1); }
                
                .book-card { display: flex; flex-direction: row; align-items: center; gap: 15px; flex-grow: 1; padding: 0 5px; text-align: left; }
                .book-cover { width: 100px; height: 150px; border-radius: 4px; object-fit: cover; box-shadow: 2px 4px 10px rgba(0,0,0,0.5); flex-shrink:0; }
                .book-info { display: flex; flex-direction: column; justify-content: center; flex: 1;}
                .b-stats { font-size: 11px; color: #9b51e0; margin 0 0 8px 0; font-weight: bold; }
                
                .b-title { font-size: 16px; font-weight: bold; color: #fff; margin: 5px 0 0 0; line-height: 1.2; }
                .b-author { font-size: 13px; color: #9b51e0; margin: 0; font-weight: bold; }
                .b-meta { font-size: 11px; color: #888; margin: 0; background: #191919; padding: 4px 8px; border-radius: 4px; display: inline-block; }
                
                /* Limita a sinopse a 3 linhas para não estourar a altura do painel */
                .b-synopsis { font-size: 11px; color: #bbb; line-height: 1.4; margin: 5px 0 0 0; font-style: italic; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
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
                            <p id="statsLido" class="b-stats"></p>
                            <p id="sinopseLido" class="b-synopsis"></p>
                        </div>
                    </div>
                    <button class="nav-btn" onclick="mudarLivro('lidos', 1)">❯</button>
                </div>
            </div>

            <div class="panel">
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
                        document.getElementById('titulo' + sufixo).textContent = "Nenhum livro listado.";
                        document.getElementById('img' + sufixo).src = "https://via.placeholder.com/120x180/252525/9b51e0?text=Vazio";
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

                    if (tipo === 'lidos') {
                        let textoStats = "Finalizado em " + (livro.dataFormatada || "?");
                        if (livro.diasLidos) {
                            const palavraDia = livro.diasLidos === 1 ? "dias" : "dias";
                            textoStats += " • Levou " + livro.diasLidos + " " + palavraDia;
                        }
                        document.getElementById('statsLido').textContent = textoStats;
                    }
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

// Parte 4 - Receber dados e criar página
app.post('/hud-livros/registrar-leitura', async (req, res) => {
    try {
        const { livroId, paginas } = req.body;
        
        const hoje = new Date();
        const y = hoje.getFullYear();
        const m = String(hoje.getMonth() + 1).padStart(2, '0');
        const d = String(hoje.getDate()).padStart(2, '0');
        const dataAtual = `${y}-${m}-${d}`;

        const notionHeaders = { 
            "Authorization": `Bearer ${process.env.NOTION_API_KEY}`, 
            "Notion-Version": "2022-06-28", 
            "Content-Type": "application/json" 
        };

        const payload = {
            parent: { database_id: process.env.NOTION_DATABASE_DIARIO },
            properties: {
                "Nome": { 
                    title: [{ text: { content: "Registro Automático" } }] 
                },
                "Data": { 
                    date: { start: dataAtual } 
                },
                "Páginas Lidas": { 
                    number: parseInt(paginas) 
                },
                "Leitura": { 
                    relation: [{ id: livroId }] 
                }
            }
        };

        await axios.post('https://api.notion.com/v1/pages', payload, { headers: notionHeaders });
        
        res.status(200).json({ message: "Leitura registrada com sucesso!" });
    } catch (erro) {
        console.error("Erro ao salvar:", erro.response?.data || erro.message);
        res.status(500).json({ error: "Falha ao registrar no Notion." });
    }
});

// Parte 5 - Lendo no momento (interativo)
app.get('/hud-livros/lendo', async (req, res) => {
    try {
        const notionHeaders = { "Authorization": `Bearer ${process.env.NOTION_API_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" };

        const respostaLivros = await axios.post(`https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_LIVROS}/query`, { 
            filter: { property: "Status", select: { equals: "Lendo" } },
            page_size: 10 
        }, { headers: notionHeaders });
        
        const livrosLendo = respostaLivros.data.results;

        const dados = [];
        for (const livro of livrosLendo) {
            const id = livro.id;
            const titulo = livro.properties["Livros"]?.title[0]?.plain_text || "Sem Título";
            const totalPaginas = livro.properties["Página total"]?.number || 1; 
            
            let capa = "https://via.placeholder.com/200x300/252525/9b51e0?text=Sem+Capa";
            if (livro.cover?.external?.url) capa = livro.cover.external.url;
            else if (livro.cover?.file?.url) capa = livro.cover.file.url;
            else if (livro.icon?.external?.url) capa = livro.icon.external.url;

            const resDiario = await axios.post(`https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_DIARIO}/query`, {
                filter: { property: "Leitura", relation: { contains: id } }
            }, { headers: notionHeaders });

            let paginasLidas = 0;
            let datasDeLeitura = [];

            resDiario.data.results.forEach(reg => {
                const numProp = Object.values(reg.properties).find(p => p.type === 'number');
                if (numProp && numProp.number) paginasLidas += numProp.number;
                
                const dataProp = Object.values(reg.properties).find(p => p.type === 'date');
                if (dataProp && dataProp.date?.start) datasDeLeitura.push(new Date(dataProp.date.start));
            });

            let progresso = Math.floor((paginasLidas / totalPaginas) * 100);
            if (progresso > 100) progresso = 100;

            let diasLendo = 0;
            if (datasDeLeitura.length > 0) {
                const dataMaisAntiga = new Date(Math.min(...datasDeLeitura));
                const hoje = new Date();
                diasLendo = Math.ceil(Math.abs(hoje - dataMaisAntiga) / (1000 * 60 * 60 * 24));
            }
            if (diasLendo === 0 && paginasLidas > 0) diasLendo = 1;

            dados.push({ id, titulo, capa, progresso, diasLendo });
        }

        const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
                * { box-sizing: border-box; }
                body { margin: 0; padding: 15px; background-color: #191919; font-family: 'Inter', sans-serif; color: #E0E0E0; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
                
                .panel { background: #252525; border-radius: 8px; padding: 20px; display: flex; flex-direction: column; box-shadow: 0 4px 10px rgba(0,0,0,0.5); width: 100%; max-width: 400px; border-top: 4px solid #9b51e0; }
                .panel-header { font-size: 14px; font-weight: bold; color: #ccc; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; text-align: center;}
                
                .carousel { display: flex; align-items: center; justify-content: space-between; }
                .nav-btn { background: #333; color: #fff; border: none; font-size: 20px; width: 35px; height: 35px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
                .nav-btn:hover { background: #9b51e0; transform: scale(1.1); }
                
                .book-card { display: flex; flex-direction: column; align-items: center; gap: 8px; flex-grow: 1; padding: 0 10px; }
                
                .cover-wrapper { padding: 4px; border-radius: 8px; display: inline-block; box-shadow: 0 4px 15px rgba(0,0,0,0.5); transition: background 0.3s ease; }
                .book-cover { width: 120px; height: 180px; border-radius: 4px; object-fit: cover; display: block; }
                
                .b-progresso { font-size: 14px; font-weight: bold; color: #9b51e0; margin: 10px 0 0 0; }
                .b-title { font-size: 16px; font-weight: bold; color: #fff; margin: 0; text-align: center; line-height: 1.2; }
                .b-dias { font-size: 12px; font-weight: bold; color: #9b51e0; margin: 0 0 10px 0; }
                
                .input-group { display: flex; gap: 8px; width: 100%; }
                input[type="number"] { flex: 1; background: #191919; border: 1px solid #444; color: #fff; padding: 8px 12px; border-radius: 4px; font-family: 'Inter'; outline: none; }
                input[type="number"]:focus { border-color: #9b51e0; }
                .btn-submit { background: #9b51e0; color: #fff; border: none; padding: 8px 15px; border-radius: 4px; font-weight: bold; cursor: pointer; transition: 0.2s; }
                .btn-submit:hover { background: #7131ab; }
                
                #mensagem { font-size: 12px; text-align: center; margin-top: 5px; min-height: 15px; color: #4ade80; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="panel">
                <div class="panel-header">Lendo no Momento</div>
                <div class="carousel">
                    <button class="nav-btn" onclick="mudarLivro(-1)">❮</button>
                    <div class="book-card">
                        
                        <div id="coverWrapper" class="cover-wrapper" style="background: conic-gradient(#4ade80 0%, #333 0);">
                            <img id="imgCapa" class="book-cover" src="">
                        </div>
                        
                        <p id="txtProgresso" class="b-progresso"></p>
                        <p id="tituloLivro" class="b-title"></p>
                        <p id="txtDias" class="b-dias"></p>
                        
                        <div class="input-group">
                            <input type="number" id="inputPaginas" placeholder="Páginas de hoje..." min="1">
                            <button class="btn-submit" id="btnSalvar" onclick="enviarLeitura()">OK</button>
                        </div>
                        <p id="mensagem"></p>
                    </div>
                    <button class="nav-btn" onclick="mudarLivro(1)">❯</button>
                </div>
            </div>

            <script>
                const lista = ${JSON.stringify(dados)};
                let indexAtual = 0;

                function renderizarLivro() {
                    if (lista.length === 0) {
                        document.getElementById('tituloLivro').textContent = "Nenhum livro em andamento.";
                        return;
                    }
                    const livro = lista[indexAtual];
                    
                    document.getElementById('imgCapa').src = livro.capa;
                    document.getElementById('tituloLivro').textContent = livro.titulo;
                    document.getElementById('txtProgresso').textContent = livro.progresso + "%";
                    
                    const textoDia = livro.diasLendo === 1 ? "Lendo há 1 dia" : "Lendo há " + livro.diasLendo + " dias";
                    document.getElementById('txtDias').textContent = textoDia;

                    document.getElementById('coverWrapper').style.background = \`conic-gradient(#4ade80 \${livro.progresso}%, #333 0)\`;
                    
                    document.getElementById('mensagem').textContent = ""; 
                    document.getElementById('inputPaginas').value = ""; 
                }

                function mudarLivro(direcao) {
                    if (lista.length === 0) return;
                    indexAtual += direcao;
                    if (indexAtual < 0) indexAtual = lista.length - 1;
                    if (indexAtual >= lista.length) indexAtual = 0;
                    renderizarLivro();
                }

                async function enviarLeitura() {
                    const paginas = document.getElementById('inputPaginas').value;
                    const btn = document.getElementById('btnSalvar');
                    const msg = document.getElementById('mensagem');
                    
                    if (!paginas || paginas <= 0) {
                        msg.style.color = "#ff4d4d"; msg.textContent = "Insira um número válido!"; return;
                    }

                    btn.textContent = ""; btn.disabled = true; msg.textContent = "";

                    try {
                        const resposta = await fetch('/hud-livros/registrar-leitura', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ livroId: lista[indexAtual].id, paginas: paginas })
                        });

                        if (resposta.ok) {
                            msg.style.color = "#4ade80"; msg.textContent = "Salvo! (Atualize a página para ver a borda avançar)";
                            document.getElementById('inputPaginas').value = "";
                        } else { throw new Error("Falha na API"); }
                    } catch (erro) {
                        msg.style.color = "#ff4d4d"; msg.textContent = "Erro ao salvar.";
                    } finally {
                        btn.textContent = "OK"; btn.disabled = false;
                        setTimeout(() => { if (msg.textContent.includes("❌")) msg.textContent = ""; }, 3000);
                    }
                }

                renderizarLivro();
            </script>
        </body>
        </html>
        `;
        res.send(html);
    } catch (erro) { res.send(`<body style="color:white; background:#191919;">Erro: ${erro.message}</body>`); }
});

app.listen(PORT, () => { console.log(`Servidor rodando na porta ${PORT}`); });