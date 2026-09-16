require('dotenv').config();
const { Client } = require('@notionhq/client');
const axios = require('axios');
const cheerio = require('cheerio');

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const dicionarioGeneros = {
  "philosophy": "Filosofia", "filosofía": "Filosofia", "psychology": "Psicologia",
  "fiction": "Literatura e Ficção", "self-help": "Autoajuda", "business & economics": "Negócios e Economia",
  "history": "História", "religion": "Religião", "biography & autobiography": "Biografia",
  "science": "Ciência", "body, mind & spirit": "Corpo, Mente e Espírito", "computers": "Tecnologia e Computação",
  "antiques & collectibles": "Antiguidades e Colecionáveis", "performing arts": "Artes Cênicas",
  "fathers and daughters": "Ficção", "mythology": "Mitologia", "portuguese": "Português"
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const headersFalsos = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://www.google.com.br/'
};

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

async function rasparAmazon(isbn) {
    try {
        const urlBusca = `https://www.amazon.com.br/s?k=${isbn}`;
        const resBusca = await axios.get(urlBusca, { headers: headersFalsos });
        const $busca = cheerio.load(resBusca.data);
        
        const linkRelativo = $busca('a.a-link-normal.s-no-outline').attr('href');
        if (!linkRelativo) return null;

        const urlLivro = `https://www.amazon.com.br${linkRelativo}`;
        const resLivro = await axios.get(urlLivro, { headers: headersFalsos });
        const $ = cheerio.load(resLivro.data);

        let titulo = $('#productTitle').text().trim().replace(/\s\s+/g, ' '); 
        let autor = $('#bylineInfo .author a').first().text().trim() || $('#bylineInfo').text().trim().split('(')[0].replace('por', '').trim() || null;
        
        let capa = $('#imgBlkFront').attr('src') || $('#landingImage').attr('src');
        if (capa && capa.includes('data:image')) {
            const imgs = $('#imgBlkFront').attr('data-a-dynamic-image') || $('#landingImage').attr('data-a-dynamic-image');
            if (imgs) capa = Object.keys(JSON.parse(imgs))[0]; 
        }

        let sinopse = $('#bookDescription_feature_div').text().trim().replace(/\s\s+/g, ' '); 
        
        let paginas = 0;
        $('#detailBullets_feature_div li').each((i, el) => {
            if ($(el).text().includes('Número de páginas') || $(el).text().includes('Páginas')) {
                paginas = parseInt($(el).text().replace(/\D/g, ''));
            }
        });

        let generos = [];
        $('#wayfinding-breadcrumbs_feature_div ul li a').each((i, el) => {
            const cat = $(el).text().trim();
            if (cat && cat !== 'Livros' && cat !== 'Voltar ao topo') generos.push(cat);
        });

        return { titulo, autores: autor ? [autor] : [], genero: [...new Set(generos)], paginas, sinopse, capa };
    } catch (erro) { return null; }
}

async function buscarGoogleBooks(termoBusca) {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(termoBusca)}&key=${process.env.GOOGLE_BOOKS_API_KEY}&langRestrict=pt&printType=books`;
    try {
        const resposta = await axios.get(url);
        const dados = resposta.data; 
        if (!dados.items || dados.items.length === 0) return null;

        let livroEscolhido = dados.items[0].volumeInfo;
        for (const item of dados.items.slice(0, 5)) {
            const candidato = item.volumeInfo;
            if (candidato.imageLinks?.thumbnail && candidato.categories && candidato.pageCount) {
                livroEscolhido = candidato; break; 
            }
        }
        return {
            titulo: livroEscolhido.title || null, 
            autores: livroEscolhido.authors || [],
            genero: livroEscolhido.categories || [], 
            paginas: livroEscolhido.pageCount || 0,
            sinopse: livroEscolhido.description || null,
            capa: livroEscolhido.imageLinks?.thumbnail ? livroEscolhido.imageLinks.thumbnail.replace("http://", "https://") : null 
        };
    } catch (erro) { return null; }
}

async function orquestrarBusca(tituloPesquisa, autorPesquisa) {
    const numeros = tituloPesquisa.replace(/\D/g, '');
    const ehIsbn = (numeros.length === 10 || numeros.length === 13);

    let dadosFinais = null;

    if (ehIsbn) {
        dadosFinais = await rasparAmazon(numeros);
        if (!dadosFinais) {
            dadosFinais = await buscarGoogleBooks(`isbn:${numeros}`);
        }
    } 
    
    if (!dadosFinais) {
        let termoTexto = tituloPesquisa;
        if (autorPesquisa && autorPesquisa !== "Autor desconhecido") termoTexto += ` ${autorPesquisa}`;
        dadosFinais = await buscarGoogleBooks(termoTexto) || {};
    }

    return {
        titulo: corrigirCaixaAlta(dadosFinais.titulo || (ehIsbn ? "Título desconhecido" : tituloPesquisa)),
        autores: dadosFinais.autores && dadosFinais.autores.length > 0 ? dadosFinais.autores.map(a => corrigirCaixaAlta(a)) : ["Autor desconhecido"],
        genero: traduzirGeneros(dadosFinais.genero || []),
        paginas: dadosFinais.paginas || 0,
        sinopse: dadosFinais.sinopse || "Sem sinopse.",
        capa: dadosFinais.capa || null
    };
}

async function buscarLivrosPendentes() {
    const url = `https://api.notion.com/v1/databases/${process.env.NOTION_DATABASE_LIVROS}/query`;
    try {
        const resposta = await axios.post(url, {
            filter: { property: "Caixa de seleção", checkbox: { equals: true } }
        }, {
            headers: { 'Authorization': `Bearer ${process.env.NOTION_API_KEY}`, 'Notion-Version': '2022-06-28' }
        });
        return resposta.data.results || [];
    } catch (erro) {
        return [];
    }
}

async function atualizarNoNotion(pageId, livroDaAPI, dadosAtuaisNotion) {
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

        if (generosFinais.length > 0) propriedades["Gênero"] = { multi_select: generosFinais.map(gen => ({ name: gen.substring(0, 50) })) };
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
    } catch (erro) { 
    }
}

let isProcessing = false;

async function executarAutomacao() {
    if (isProcessing) return; 
    isProcessing = true;

    const paginasPendentes = await buscarLivrosPendentes();

    if (paginasPendentes.length > 0) {
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
    }
    isProcessing = false;
}

const INTERVALO_MINUTOS = 1;
executarAutomacao();
setInterval(executarAutomacao, INTERVALO_MINUTOS * 60 * 1000);