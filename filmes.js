require('dotenv').config();
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_API_KEY });

const TMDB_TOKEN = process.env.TMDB_API_TOKEN;
const tmdbHeaders = { Authorization: `Bearer ${TMDB_TOKEN}`, accept: 'application/json' };
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

console.log("🎬 Iniciando Automação de Filmes (TMDB) com Sinopse...");

// 1. MOTOR DE BUSCA TMDB 
async function buscarFilmeTMDB(tituloPesquisa, anoPesquisa) {
  try {
    let urlBusca = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(tituloPesquisa)}&language=pt-BR`;
    
    if (anoPesquisa) {
      urlBusca += `&primary_release_year=${anoPesquisa}`;
      console.log(`   🔎 Buscando por Título e Ano: "${tituloPesquisa}" (${anoPesquisa})...`);
    } else {
      console.log(`   🔎 Buscando apenas por Título: "${tituloPesquisa}"...`);
    }

    let resBusca = await fetch(urlBusca, { headers: tmdbHeaders });
    let dadosBusca = await resBusca.json();
    
    if (dadosBusca.success === false) {
       console.log(`   ❌ TMDB recusou o acesso: ${dadosBusca.status_message}`);
       return null;
    }

    if ((!dadosBusca.results || dadosBusca.results.length === 0) && anoPesquisa) {
       console.log(`   ⚠️ Nenhum filme achado em ${anoPesquisa}. Tentando uma busca ampla só pelo nome...`);
       const urlAmpla = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(tituloPesquisa)}&language=pt-BR`;
       resBusca = await fetch(urlAmpla, { headers: tmdbHeaders });
       dadosBusca = await resBusca.json();
    }

    if (!dadosBusca.results || dadosBusca.results.length === 0) {
       console.log(`   ❌ TMDB não encontrou nenhum filme chamado "${tituloPesquisa}".`);
       return null;
    }
    
    const movieId = dadosBusca.results[0].id;
    console.log(`   ✅ Filme encontrado: ${dadosBusca.results[0].title} (ID: ${movieId}). Baixando detalhes...`);

    const urlDetalhes = `https://api.themoviedb.org/3/movie/${movieId}?append_to_response=credits&language=pt-BR`;
    const resDetalhes = await fetch(urlDetalhes, { headers: tmdbHeaders });
    const filme = await resDetalhes.json();

    let duracaoFormatada = "Desconhecido";
    if (filme.runtime && filme.runtime > 0) {
      const horas = Math.floor(filme.runtime / 60);
      const minutos = filme.runtime % 60;
      duracaoFormatada = `${horas}h${minutos.toString().padStart(2, '0')}min`;
    }

    const diretorObj = filme.credits.crew.find(c => c.job === 'Director');
    const diretor = diretorObj ? diretorObj.name : "Desconhecido";
    const casting = filme.credits.cast.slice(0, 3).map(ator => ator.name);
    const anoLancamento = filme.release_date ? parseInt(filme.release_date.substring(0, 4)) : 0;

    return {
      titulo: filme.title,
      capa: filme.poster_path ? `https://image.tmdb.org/t/p/w500${filme.poster_path}` : null,
      genero: filme.genres.map(g => g.name),
      diretor: diretor,
      ano: anoLancamento,
      duracao: duracaoFormatada,
      casting: casting,
      sinopse: filme.overview || "Sinopse não disponível no TMDB." // <-- CAPTURANDO A SINOPSE AQUI
    };
  } catch (erro) {
    console.error("   ❌ Erro grave ao conectar no TMDB:", erro);
    return null;
  }
}

// 2. FUNÇÃO NOTION (BUSCAR PENDENTES)
async function buscarFilmesPendentes() {
  try {
    const resposta = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_FILMES}/query`, {
      method: 'POST', 
      headers: { 'Authorization': `Bearer ${process.env.NOTION_API_KEY}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { property: "Caixa de seleção", checkbox: { equals: true } } })
    });
    const dados = await resposta.json(); return dados.results || [];
  } catch (erro) { return []; }
}

// 3. FUNÇÃO NOTION (ATUALIZAR)
async function atualizarNoNotion(pageId, filme) {
  console.log(`   💾 Salvando propriedades de "${filme.titulo}" no Notion...`);

  try {
    const propriedades = {
      "Nome": { title: [ { text: { content: filme.titulo } } ] },
      "Caixa de seleção": { checkbox: false }
    };

    if (filme.diretor !== "Desconhecido") propriedades["Diretor"] = { select: { name: filme.diretor } };
    if (filme.ano > 0) propriedades["Ano"] = { number: filme.ano };
    if (filme.duracao !== "Desconhecido") propriedades["Tempo de duração"] = { rich_text: [ { text: { content: filme.duracao } } ] };
    if (filme.genero && filme.genero.length > 0) propriedades["Gênero"] = { multi_select: filme.genero.map(g => ({ name: g })) };
    if (filme.casting && filme.casting.length > 0) propriedades["Casting principal"] = { multi_select: filme.casting.map(ator => ({ name: ator })) };

    const corpoAtualizacao = { page_id: pageId, properties: propriedades };
    if (filme.capa) {
      corpoAtualizacao.cover = { type: "external", external: { url: filme.capa } };
      corpoAtualizacao.icon = { type: "external", external: { url: filme.capa } };
    }

    // 1. Atualiza as propriedades da tabela
    await notion.pages.update(corpoAtualizacao);

    // 2. IDEMPOTÊNCIA E INJEÇÃO DA SINOPSE (O mesmo molde dos livros)
    const blocosExistentes = await notion.blocks.children.list({ block_id: pageId });
    if (blocosExistentes.results.length === 0) {
      console.log(`   📝 Injetando blocos de Sinopse e Opinião...`);
      await notion.blocks.children.append({
        block_id: pageId,
        children: [
          { object: "block", type: "heading_3", heading_3: { rich_text: [ { type: "text", text: { content: "Sinopse" } } ], color: "purple_background" } },
          { object: "block", type: "paragraph", paragraph: { rich_text: [ { type: "text", text: { content: filme.sinopse.substring(0, 2000) } } ] } },
          { object: "block", type: "heading_3", heading_3: { rich_text: [ { type: "text", text: { content: "Opinião" } } ], color: "purple_background" } }
        ]
      });
    }

    console.log("   ✅ Atualização Concluída!\n");
  } catch (erro) { 
    console.error("   ❌ Erro ao atualizar no Notion:", erro.body?.message || erro); 
  }
}

// 4. MODO SENTINELA
let isProcessing = false;

async function executarAutomacao() {
  if (isProcessing) return;
  isProcessing = true;

  const paginasPendentes = await buscarFilmesPendentes();

  if (paginasPendentes.length > 0) {
    console.log(`\n==============================================`);
    console.log(`📌 Encontrado(s) ${paginasPendentes.length} filme(s) marcado(s) na fila.`);

    for (const pagina of paginasPendentes) {
      const propriedadeNome = pagina.properties["Nome"];
      const propriedadeAno = pagina.properties["Ano"];
      
      if (!propriedadeNome) {
         console.log(`\n❌ A propriedade 'Nome' não foi encontrada na tabela.`);
         continue;
      }

      const tituloAtual = propriedadeNome.title[0]?.plain_text;
      const anoAtual = propriedadeAno?.number;
      
      if (tituloAtual) {
        console.log(`\n▶️ Iniciando processamento de: "${tituloAtual}"`);
        
        const dadosFilme = await buscarFilmeTMDB(tituloAtual, anoAtual);
        
        if (dadosFilme) {
          await atualizarNoNotion(pagina.id, dadosFilme);
          await delay(1000); 
        }
      }
    }
    console.log(`🏁 Processamento da fila finalizado.`);
    console.log(`==============================================\n`);
  }
  isProcessing = false;
}

const INTERVALO_MINUTOS = 1;
console.log(`\n👁️ Monitorando a tabela a cada ${INTERVALO_MINUTOS} minuto(s)...`);
executarAutomacao();
setInterval(executarAutomacao, INTERVALO_MINUTOS * 60 * 1000);