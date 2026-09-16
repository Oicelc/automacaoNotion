require('dotenv').config();
const { Client } = require('@notionhq/client');
const axios = require('axios');
const cheerio = require('cheerio');

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
        const apiKey = process.env.SCRAPER_API_KEY;
        if (!apiKey) return null;

        const urlBusca = `https://www.amazon.com.br/s?k=${isbn}`;
        const resBusca = await axios.get(`http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(urlBusca)}`);
        const $busca = cheerio.load(resBusca.data);
        
        const linkRelativo = $busca('a.a-link-normal.s-no-outline').attr('href');
        if (!linkRelativo) return null;

        const urlLivro = `https://www.amazon.com.br${linkRelativo}`;
        const resLivro = await axios.get(`http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(urlLivro)}`);
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
    } catch (erro) { 
        return null; 
    }
}

async function rasparSkoob(termoBusca) {
    try {
        const apiKey = process.env.SCRAPER_API_KEY;
        if (!apiKey) return null;

        const urlBusca = `https://www.skoob.com.br/livro/lista/busca:${encodeURIComponent(termoBusca)}/tipo:geral`;
        const urlProxy = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(urlBusca)}&render=true`;

        const resBusca = await axios.get(urlProxy);
        const $busca = cheerio.load(resBusca.data);

        const linkRelativo = $busca('.detalhes-busca a').attr('href') || $busca('a[href^="/livro/"]').first().attr('href');
        if (!linkRelativo) return null;

        const urlLivro = linkRelativo.startsWith('http') ? linkRelativo : `https://www.skoob.com.br${linkRelativo}`;
        const urlProxyLivro = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(urlLivro)}&render=true`;

        const resLivro = await axios.get(urlProxyLivro);
        const $ = cheerio.load(resLivro.data);

        let titulo = $('*[itemprop="name"]').first().text().trim() || $('h1').first().text().trim() || null;
        let autor = $('a[href*="/autor/"]').first().text().trim() || null;
        let capa = $('img[itemprop="image"]').attr('src') || $('#capa_imagem').attr('src') || null;
        let sinopse = $('*[itemprop="description"]').text().trim() || $('#resenha').text().trim() || null;
        if (sinopse) sinopse = sinopse.replace(/\s\s+/g, ' '); 
        
        let paginas = 0;
        const matchPaginas = $('body').text().match(/Páginas:\s*(\d+)/i) || $('body').text().match(/(\d+)\s*páginas/i);
        if (matchPaginas) paginas = parseInt(matchPaginas[1]);

        let generos = [];
        $('a[href*="/livros/tag/"]').each((i, el) => {
            const gen = $(el).text().trim();
            if (gen && gen.length > 2) generos.push(gen);
        });
        
        if (generos.length === 0) {
            $('.bar-title a').each((i, el) => {
                const gen = $(el).text().trim();
                if (gen && gen !== "Livros" && gen !== "Início") generos.push(gen);
            });
        }

        return { titulo, autores: autor ? [autor] : [], genero: [...new Set(generos)], paginas, sinopse, capa };
    } catch (erro) { 
        return null; 
    }
}

async function orquestrarBusca(tituloPesquisa, autorPesquisa) {
    const numeros = tituloPesquisa.replace(/\D/g, '');
    const ehIsbn = (numeros.length === 10 || numeros.length === 13);

    let dadosFinais = null;

    if (ehIsbn) {
        dadosFinais = await rasparAmazon(numeros);
        const dadosSkoob = await rasparSkoob(numeros) || await rasparSkoob(tituloPesquisa);

        if (dadosFinais && dadosSkoob) {
            if (dadosSkoob.genero.length > 0) {
                dadosFinais.genero = [...new Set([...dadosFinais.genero, ...dadosSkoob.genero])];
            }
            if (!dadosFinais.sinopse && dadosSkoob.sinopse) dadosFinais.sinopse = dadosSkoob.sinopse;
            if (!dadosFinais.capa && dadosSkoob.capa) dadosFinais.capa = dadosSkoob.capa;
            if (dadosFinais.paginas === 0 && dadosSkoob.paginas > 0) dadosFinais.paginas = dadosSkoob.paginas;
        } else if (!dadosFinais) {
            dadosFinais = dadosSkoob;
        }
    } 
    
    if (!dadosFinais) {
        dadosFinais = await rasparSkoob(tituloPesquisa);
        if (!dadosFinais && autorPesquisa && autorPesquisa !== "Autor desconhecido") {
            dadosFinais = await rasparSkoob(`${tituloPesquisa} ${autorPesquisa}`);
        }
    }

    let generosLimpos = [];
    if (dadosFinais?.genero) {
        generosLimpos = dadosFinais.genero.map(g => g.replace(/,/g, '').trim());
    }

    return {
        titulo: corrigirCaixaAlta(dadosFinais?.titulo || (ehIsbn ? "Título desconhecido" : tituloPesquisa)),
        autores: dadosFinais?.autores && dadosFinais.autores.length > 0 ? dadosFinais.autores.map(a => corrigirCaixaAlta(a)) : ["Autor desconhecido"],
        genero: [...new Set(generosLimpos.map(g => corrigirCaixaAlta(g)))],
        paginas: dadosFinais?.paginas || 0,
        sinopse: dadosFinais?.sinopse || "Sem sinopse.",
        capa: dadosFinais?.capa || null
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