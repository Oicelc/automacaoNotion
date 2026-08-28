require('dotenv').config();
const { Client } = require('@notionhq/client');
const fs = require('fs');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_FILMES;
const TMDB_TOKEN = process.env.TMDB_API_TOKEN;
const tmdbHeaders = { Authorization: `Bearer ${TMDB_TOKEN}`, accept: 'application/json' };

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função para remover acentos e deixar tudo em minúsculo (Comparações perfeitas)
function normalizar(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

console.log("📦 Iniciando Importador de Filmes Inteligente...\n");

// 1. MAPEAMENTO DO NOTION
async function mapearFilmesExistentes() {
  console.log("🔍 Escaneando o Notion para evitar duplicatas...");
  const filmesExistentes = new Set();
  let cursor = undefined;
  let hasMore = true;

  try {
    while (hasMore) {
      const body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;

      const resposta = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.NOTION_API_KEY}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const dados = await resposta.json();
      for (const pagina of dados.results) {
        const titulo = pagina.properties["Nome"]?.title[0]?.plain_text;
        if (titulo) filmesExistentes.add(normalizar(titulo));
      }
      cursor = dados.next_cursor;
      hasMore = dados.has_more;
    }
    console.log(`✅ Base escaneada: ${filmesExistentes.size} filme(s) já cadastrado(s) no Notion.\n`);
    return filmesExistentes;
  } catch (erro) {
    console.error("❌ Erro ao ler o Notion:", erro);
    process.exit(1);
  }
}

// 2. BUSCA O NOME OFICIAL BRASILEIRO NO TMDB
async function buscarNomeOficialTMDB(tituloPesquisa, anoPesquisa) {
  try {
    let urlBusca = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(tituloPesquisa)}&primary_release_year=${anoPesquisa}&language=pt-BR`;
    let resBusca = await fetch(urlBusca, { headers: tmdbHeaders });
    let dadosBusca = await resBusca.json();

    // O TRUQUE DO FALLBACK: Se não achar com o ano exato, tenta uma busca mais ampla sem o ano!
    if ((!dadosBusca.results || dadosBusca.results.length === 0) && anoPesquisa) {
       const urlAmpla = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(tituloPesquisa)}&language=pt-BR`;
       resBusca = await fetch(urlAmpla, { headers: tmdbHeaders });
       dadosBusca = await resBusca.json();
    }

    if (dadosBusca.results && dadosBusca.results.length > 0) {
      return dadosBusca.results[0].title; // Retorna o título traduzido
    }
    return tituloPesquisa; // Se falhar de vez, tenta com o nome em inglês mesmo
  } catch (erro) {
    return tituloPesquisa;
  }
}

// 3. FUNÇÃO PRINCIPAL DE IMPORTAÇÃO
async function iniciarImportacao() {
  const baseAtual = await mapearFilmesExistentes();
  
  const arquivoRaw = fs.readFileSync('filmes.txt', 'utf-8');
  const linhas = arquivoRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const relatorio = { adicionados: [], duplicados: [], ignorados: [] };

  console.log("🚀 Traduzindo títulos e injetando dados...\n");

  for (const linha of linhas) {
    const match = linha.match(/^(.*?)\s*\((\d{4})\)/);
    
    if (!match) {
      relatorio.ignorados.push(linha);
      continue;
    }

    const tituloOriginal = match[1].trim();
    const ano = parseInt(match[2]);

    // O Pulo do Gato: Descobre o nome em português ANTES de checar a duplicata
    const tituloOficial = await buscarNomeOficialTMDB(tituloOriginal, ano);
    const chaveComparacao = normalizar(tituloOficial);

    if (baseAtual.has(chaveComparacao)) {
      console.log(`🔁 Pulando: ${tituloOficial} (Original: ${tituloOriginal}) - Já existe na base.`);
      relatorio.duplicados.push(tituloOficial);
      continue;
    }

    try {
      await notion.pages.create({
        parent: { database_id: DATABASE_ID },
        properties: {
          "Nome": { title: [ { text: { content: tituloOficial } } ] },
          "Ano": { number: ano },
          "Caixa de seleção": { checkbox: true } 
        }
      });
      
      console.log(`➕ Inserido: ${tituloOficial} (${ano})`);
      relatorio.adicionados.push(tituloOficial);
      baseAtual.add(chaveComparacao); 
      
      await delay(500); 
    } catch (erro) {
      console.error(`❌ Falha ao inserir "${tituloOficial}":`, erro.body?.message || erro);
    }
  }

  // 4. O RELATÓRIO FINAL
  console.log("\n==============================================");
  console.log("📊 RELATÓRIO FINAL DE IMPORTAÇÃO");
  console.log("==============================================");
  console.log(`✅ Sucesso: ${relatorio.adicionados.length} filmes novos inseridos.`);
  console.log(`🔁 Duplicados Bloqueados: ${relatorio.duplicados.length}`);
  console.log("==============================================\n");
}

iniciarImportacao();