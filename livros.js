require('dotenv').config();
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_API_KEY });

console.log("Iniciando automação");

const dicionarioGeneros = {
  "philosophy": "Filosofia", "filosofía": "Filosofia", "psychology": "Psicologia",
  "fiction": "Literatura e Ficção", "self-help": "Autoajuda", "business & economics": "Negócios e Economia",
  "history": "História", "religion": "Religião", "biography & autobiography": "Biografia",
  "science": "Ciência", "body, mind & spirit": "Corpo, Mente e Espírito", "computers": "Tecnologia e Computação",
  "antiques & collectibles": "Antiguidades e Colecionáveis", "performing arts": "Artes Cênicas",
  "fathers and daughters": "Ficção", "mythology": "Mitologia", "portuguese": "Português"
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function traduzirGeneros(generos) {
  if (!generos || generos.length === 0) return [];
  let generosSeparados = [];

  generos.forEach(g => {
    if (g.includes(',')) {
      generosSeparados.push(...g.split(',').map(p => p.trim()));
    } else {
      generosSeparados.push(g.trim());
    }
  });

  const generosFinais = generosSeparados.map(g => dicionarioGeneros[g.toLowerCase()] || corrigirCaixaAlta(g));
  return [...new Set(generosFinais)];
}

function corrigirCaixaAlta(texto) {
  if (!texto) return null;
  if (texto === texto.toUpperCase()) {
      const preposicoes = ['de','do','da','dos','das','e','em','na','no','nas','nos','a','o','as','os','um','uma'];
      return texto.toLowerCase().split(' ').map((palavra, index) => {
          if (index > 0 && preposicoes.includes(palavra)) return palavra;
          return palavra.charAt(0).toUpperCase() + palavra.slice(1);
      }).join(' ');
  }
  return texto; 
}

async function buscarBrasilAPI(isbn) {
  try {
    const resposta = await fetch(`https://brasilapi.com.br/api/isbn/v1/${isbn}`);
    if (resposta.status === 404) return null; 
    const dados = await resposta.json();
    return {
      titulo: dados.title || null, autores: dados.authors || null, genero: dados.subjects || null,
      paginas: dados.page_count || null, sinopse: dados.synopsis || null, capa: dados.cover_url || null
    };
  } catch (erro) { return null; }
}

async function buscarCapaOpenLibrary(isbn) {
  try {
    const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
    const resposta = await fetch(url);
    if (resposta.status === 200) return url;
    return null;
  } catch (erro) { return null; }
}

async function buscarGoogleBooks(termoBusca) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(termoBusca)}&key=${process.env.GOOGLE_BOOKS_API_KEY}&langRestrict=pt`;
  try {
    const resposta = await fetch(url);
    const dados = await resposta.json(); 
    if (!dados.items || dados.items.length === 0) return null;

    let livroEscolhido = dados.items[0].volumeInfo;
    for (const item of dados.items.slice(0, 5)) {
      const candidato = item.volumeInfo;
      if (candidato.imageLinks?.thumbnail && candidato.categories && candidato.pageCount) {
        livroEscolhido = candidato; break; 
      }
    }
    return {
      titulo: livroEscolhido.title || null, autores: livroEscolhido.authors || null,
      genero: livroEscolhido.categories || null, paginas: livroEscolhido.pageCount || null,
      sinopse: livroEscolhido.description || null,
      capa: livroEscolhido.imageLinks?.thumbnail ? livroEscolhido.imageLinks.thumbnail.replace("http://", "https://") : null 
    };
  } catch (erro) { return null; }
}

async function orquestrarBusca(tituloPesquisa, autorPesquisa) {
  const numeros = tituloPesquisa.replace(/\D/g, '');
  const ehIsbn = (numeros.length === 10 || numeros.length === 13);

  let dadosFinais = { titulo: null, autores: [], genero: [], paginas: 0, sinopse: null, capa: null };

  if (ehIsbn) {
    console.log(`\nLendo ISBN: ${numeros}`);
    const [resBrasil, resOpen, resGoogle] = await Promise.all([
      buscarBrasilAPI(numeros), buscarCapaOpenLibrary(numeros), buscarGoogleBooks(`isbn:${numeros}`)
    ]);
    
    const b = resBrasil || {}; const capaOpen = resOpen; const gISBN = resGoogle || {};

    const escolherIsbn = (campo) => {
      const valores = [b[campo], gISBN[campo]];
      for (const val of valores) {
        if (Array.isArray(val) && val.length > 0) return val;
        if (typeof val === 'number' && val > 0) return val;
        if (typeof val === 'string' && val.trim() !== '') return val;
      }
      return null;
    };

    dadosFinais.titulo = escolherIsbn('titulo');
    dadosFinais.autores = escolherIsbn('autores') || [];
    dadosFinais.genero = escolherIsbn('genero') || [];
    dadosFinais.paginas = escolherIsbn('paginas') || 0;
    dadosFinais.sinopse = escolherIsbn('sinopse');
    dadosFinais.capa = b.capa || capaOpen || gISBN.capa || null;

    const faltaAlgo = (dadosFinais.autores.length === 0 || dadosFinais.genero.length === 0 || dadosFinais.paginas === 0 || !dadosFinais.capa || !dadosFinais.sinopse);

    if (faltaAlgo) {
      let termoTexto = dadosFinais.titulo || tituloPesquisa;
      const autorParaBusca = dadosFinais.autores[0] || autorPesquisa;
      if (autorParaBusca && autorParaBusca !== "Autor desconhecido") termoTexto += ` ${autorParaBusca}`;

      console.log(`Preenchendo buracos: "${termoTexto}"`);
      const gTexto = await buscarGoogleBooks(termoTexto) || {};

      if (dadosFinais.autores.length === 0 && gTexto.autores) dadosFinais.autores = gTexto.autores;
      if (dadosFinais.genero.length === 0 && gTexto.genero) dadosFinais.genero = gTexto.genero;
      if (dadosFinais.paginas === 0 && gTexto.paginas) dadosFinais.paginas = gTexto.paginas;
      if (!dadosFinais.capa && gTexto.capa) dadosFinais.capa = gTexto.capa;
      if (!dadosFinais.sinopse && gTexto.sinopse) dadosFinais.sinopse = gTexto.sinopse;
    }

  } else {
    let termoTexto = tituloPesquisa;
    if (autorPesquisa && autorPesquisa !== "Autor desconhecido") termoTexto += ` ${autorPesquisa}`;
    console.log(`\nBuscando texto: "${termoTexto}"`);
    
    const gTexto = await buscarGoogleBooks(termoTexto) || {};
    dadosFinais = {
      titulo: gTexto.titulo || tituloPesquisa, autores: gTexto.autores || [],
      genero: gTexto.genero || [], paginas: gTexto.paginas || 0,
      sinopse: gTexto.sinopse || null, capa: gTexto.capa || null
    };
  }

  return {
    titulo: corrigirCaixaAlta(dadosFinais.titulo || (ehIsbn ? "Título desconhecido" : tituloPesquisa)),
    autores: dadosFinais.autores.length > 0 ? dadosFinais.autores.map(a => corrigirCaixaAlta(a)) : ["Autor desconhecido"],
    genero: traduzirGeneros(dadosFinais.genero),
    paginas: dadosFinais.paginas,
    sinopse: dadosFinais.sinopse || "Sem sinopse.",
    capa: dadosFinais.capa
  };
}

async function buscarLivrosPendentes() {
  const url = `https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_LIVROS}/query`;
  try {
    const resposta = await fetch(url, {
      method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_API_KEY}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { property: "Caixa de seleção", checkbox: { equals: true } } })
    });

    if (!resposta.ok) {
        console.log(`Alerta do Notion (Status ${resposta.status}): Verificar internet ou chaves de acesso.`);
        return [];
    }

    const dados = await resposta.json(); return dados.results || [];
  } catch (erro) {
    console.log(`Falha na rede: ${erro.message}`);
    return [];
  }
}

async function atualizarNoNotion(pageId, livroDaAPI, dadosAtuaisNotion) {
  console.log(`Salvando "${livroDaAPI.titulo}" no Notion`);
  const ehIsbn = (dadosAtuaisNotion.titulo.replace(/\D/g, '').length === 10 || dadosAtuaisNotion.titulo.replace(/\D/g, '').length === 13);

  try {
    const nomeDoAutor = (livroDaAPI.autores[0] !== "Autor desconhecido") ? livroDaAPI.autores[0] : (dadosAtuaisNotion.autor || "Autor desconhecido");
    const paginasFinais = (dadosAtuaisNotion.paginas > 0) ? dadosAtuaisNotion.paginas : (livroDaAPI.paginas || 0);
    const notionSemGenero = dadosAtuaisNotion.generos.length === 0 || (dadosAtuaisNotion.generos.length === 1 && dadosAtuaisNotion.generos[0] === "Sem gênero");
    const generosFinais = notionSemGenero ? livroDaAPI.genero : dadosAtuaisNotion.generos;

    const propriedades = {
      "Autor": { select: { name: nomeDoAutor } },
      "Página total": { number: paginasFinais },
      "Caixa de seleção": { checkbox: false }
    };

    if (generosFinais.length > 0) propriedades["Gênero"] = { multi_select: generosFinais.map(gen => ({ name: gen })) };
    if (ehIsbn && livroDaAPI.titulo !== "Título desconhecido") propriedades["Livros"] = { title: [ { text: { content: livroDaAPI.titulo } } ] };

    const corpoAtualizacao = { page_id: pageId, properties: propriedades };
    if (livroDaAPI.capa) {
      corpoAtualizacao.cover = { type: "external", external: { url: livroDaAPI.capa } };
      corpoAtualizacao.icon = { type: "external", external: { url: livroDaAPI.capa } };
    }

    await notion.pages.update(corpoAtualizacao);

    const blocosExistentes = await notion.blocks.children.list({ block_id: pageId });
    if (blocosExistentes.results.length === 0) {
      await notion.blocks.children.append({
        block_id: pageId,
        children: [
          { object: "block", type: "heading_3", heading_3: { rich_text: [ { type: "text", text: { content: "Sinopse" } } ], color: "purple_background" } },
          { object: "block", type: "paragraph", paragraph: { rich_text: [ { type: "text", text: { content: livroDaAPI.sinopse.substring(0, 2000) } } ] } },
          { object: "block", type: "heading_3", heading_3: { rich_text: [ { type: "text", text: { content: "Opinião" } } ], color: "purple_background" } }
        ]
      });
    }

    console.log("Concluído!\n");
  } catch (erro) { console.error("Erro ao atualizar no Notion:", erro.body || erro); }
}

let isProcessing = false;

async function executarAutomacao() {
  if (isProcessing) return; 
  isProcessing = true;

  const paginasPendentes = await buscarLivrosPendentes();

  if (paginasPendentes.length > 0) {
    console.log(`Encontrado(s) ${paginasPendentes.length} livro(s) na fila.\n`);

    for (const pagina of paginasPendentes) {
      const dadosAtuais = {
        titulo: pagina.properties["Livros"].title[0]?.plain_text,
        autor: pagina.properties["Autor"].select?.name,
        paginas: pagina.properties["Página total"].number || 0,
        generos: pagina.properties["Gênero"].multi_select.map(g => g.name) || []
      };
      
      if (dadosAtuais.titulo) {
        const dadosDoLivro = await orquestrarBusca(dadosAtuais.titulo, dadosAtuais.autor);
        if (dadosDoLivro) {
          await atualizarNoNotion(pagina.id, dadosDoLivro, dadosAtuais);
          await delay(1000);
        }
      }
    }
    console.log("Processamento finalizado");
  } else {
    const horaAtual = new Date().toLocaleTimeString('pt-BR');
    console.log(`[${horaAtual}] Nenhum livro pendente (ou marcado)`);
  }
  
  isProcessing = false;
}

const INTERVALO_MINUTOS = 1;
console.log(`\nModo de busca de novos lirros Ativado. Monitorando a cada ${INTERVALO_MINUTOS} minuto(s)...`);

executarAutomacao();
setInterval(executarAutomacao, INTERVALO_MINUTOS * 60 * 1000);