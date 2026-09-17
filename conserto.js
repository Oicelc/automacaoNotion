require('dotenv').config();
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_API_KEY });

const TMDB_TOKEN = process.env.TMDB_API_TOKEN;
const tmdbHeaders = { Authorization: `Bearer ${TMDB_TOKEN}`, accept: 'application/json' };
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

console.log("🚀 Iniciando Migração em Lote: Capas e Ícones (Local)...");

// 1. MOTOR DE BUSCA (APENAS IMAGENS)
async function buscarImagensTMDB(tituloPesquisa, anoPesquisa) {
  try {
    let urlBusca = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(tituloPesquisa)}&language=pt-BR`;
    if (anoPesquisa) urlBusca += `&primary_release_year=${anoPesquisa}`;

    let resBusca = await fetch(urlBusca, { headers: tmdbHeaders });
    let dadosBusca = await resBusca.json();
    
    // Fallback: busca sem ano se a primeira falhar
    if ((!dadosBusca.results || dadosBusca.results.length === 0) && anoPesquisa) {
       const urlAmpla = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(tituloPesquisa)}&language=pt-BR`;
       resBusca = await fetch(urlAmpla, { headers: tmdbHeaders });
       dadosBusca = await resBusca.json();
    }

    if (!dadosBusca.results || dadosBusca.results.length === 0) return null;
    
    const filme = dadosBusca.results[0];
    
    return {
      icone: filme.poster_path ? `https://image.tmdb.org/t/p/w500${filme.poster_path}` : null,
      capa: filme.backdrop_path ? `https://image.tmdb.org/t/p/w1280${filme.backdrop_path}` : null
    };
  } catch (erro) {
    console.error(` ❌ Erro ao buscar imagens no TMDB: ${erro.message}`);
    return null;
  }
}

// 2. BUSCA TODOS OS FILMES MARCADOS
async function buscarFilmesPendentes() {
  try {
    const resposta = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_FILMES}/query`, {
      method: 'POST', 
      headers: { 'Authorization': `Bearer ${process.env.NOTION_API_KEY}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { property: "Caixa de seleção", checkbox: { equals: true } } })
    });
    const dados = await resposta.json(); 
    return dados.results || [];
  } catch (erro) { 
    return []; 
  }
}

// 3. ATUALIZA EXCLUSIVAMENTE AS IMAGENS NO NOTION
async function atualizarImagensNotion(pageId, imagens) {
  try {
    // Lógica de resiliência: se faltar uma, usa a outra como fallback
    const coverUrl = imagens.capa || imagens.icone; 
    const iconUrl = imagens.icone || imagens.capa;

    const corpoAtualizacao = { 
      page_id: pageId, 
      properties: { "Caixa de seleção": { checkbox: false } } 
    };

    if (coverUrl && iconUrl) {
      corpoAtualizacao.cover = { type: "external", external: { url: coverUrl } };
      corpoAtualizacao.icon = { type: "external", external: { url: iconUrl } };
    }

    await notion.pages.update(corpoAtualizacao);
    return true;
  } catch (erro) { 
    console.error(` ❌ Erro ao atualizar Notion: ${erro.body?.message || erro.message}`); 
    return false;
  }
}

// 4. ORQUESTRADOR DE LOTE COM DELAY DE SEGURANÇA
async function executarMigracaoLote() {
  const paginasPendentes = await buscarFilmesPendentes();

  if (paginasPendentes.length === 0) {
    console.log("Nenhum filme marcado. Finalizando.");
    return;
  }

  console.log(`\n==============================================`);
  console.log(`📌 Encontrados ${paginasPendentes.length} filmes para migração de capas.`);
  console.log(`⏳ Tempo estimado: ~${Math.ceil((paginasPendentes.length * 3) / 60)} minutos.`);
  console.log(`==============================================\n`);

  let contador = 1;

  for (const pagina of paginasPendentes) {
    const titulo = pagina.properties["Nome"]?.title[0]?.plain_text;
    const ano = pagina.properties["Ano"]?.number;
    
    if (titulo) {
      process.stdout.write(`[${contador}/${paginasPendentes.length}] Processando "${titulo}"... `);
      
      const imagens = await buscarImagensTMDB(titulo, ano);
      
      if (imagens && (imagens.capa || imagens.icone)) {
        const sucesso = await atualizarImagensNotion(pagina.id, imagens);
        if (sucesso) {
          console.log(`✅ OK!`);
        }
      } else {
        console.log(`⚠️ Imagens não encontradas.`);
      }
      
      // Delay absoluto de 3 segundos para garantir a paz na API do Notion
      await delay(3000);
    }
    contador++;
  }
  
  console.log(`\n🏁 Migração de Lote Finalizada com Sucesso!\n`);
}

executarMigracaoLote();