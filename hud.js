require('dotenv').config();
const axios = require('axios');

async function atualizarHUD() {
  try {
    const notionHeaders = {
      "Authorization": `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    };

    // 1. BUSCAR OS DADOS DE 2026
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

    // 2. MATEMÁTICA AVANÇADA (Somando as páginas)
    let totalPaginas = 0;
    for (const livro of livros) {
      // Pega o número de páginas ou assume 0 se estiver vazio
      const paginas = livro.properties["Página total"]?.number || 0; 
      totalPaginas += paginas;
    }

    // 3. MONTAR O DESIGN DO TEXTO (Usando \n para quebras de linha)
    const textoHUD = `🏆 STATUS DE LEITURA 2026\n\n📚 Livros concluídos: ${quantidadeLidos}\n📖 Páginas devoradas: ${totalPaginas}\n🔥 Continue no ritmo!`;

    // 4. ATUALIZAR O BLOCO NA TELA
    await axios.patch(
      `https://api.notion.com/v1/blocks/${process.env.NOTION_DATABASE_BLOCO1HUD}`,
      {
        callout: {
          rich_text: [
            {
              text: { content: textoHUD },
              annotations: { bold: true, color: "purple" }
            }
          ]
        }
      },
      { headers: notionHeaders }
    );

    console.log(`[HUD] Atualizado: ${quantidadeLidos} livros, ${totalPaginas} páginas.`);
  } catch (erro) {
    console.error("[HUD] Erro na API:", erro.response ? erro.response.data : erro.message);
  }
}

// 5. MODO SENTINELA (Mantendo o seu padrão de arquitetura)
const INTERVALO_HORAS = 1; 
console.log(`\n👁️ Monitor do HUD Ativado. Atualizando a cada ${INTERVALO_HORAS} hora(s)...`);

atualizarHUD();
// Como o HUD de métricas anuais não muda a cada minuto, rodar a cada 1 hora poupa processamento
setInterval(atualizarHUD, INTERVALO_HORAS * 60 * 60 * 1000);