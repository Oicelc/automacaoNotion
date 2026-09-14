# Automação Unificada de Livros e Filmes no Notion

Este projeto é um ecossistema de automação desenvolvido em **Node.js** com arquitetura de microsserviços em um *Monorepo*. O sistema atua como um "Sentinela" invisível, monitorando bancos de dados do Notion e enriquecendo-os automaticamente com metadados de APIs externas (TMDB e Google Books).

Projeto pessoal criado com o intuito de estudar as tecnologias utilizadas, juntamente com a hobby e vontade de centrar minhas "organizações" em um único app

## Arquitetura do Sistema

Resolvi juntar duas automações que usava separadamente (filmes e livros) em um único código e, aproveitando, por que não colocar pra rodar em nuvem? Pois bem, aqui está.

*   **`livros.js`:** Microsserviço dedicado à raspagem e integração de dados literários (via Google Books API / Web Scraping).
*   **`filmes.js`:** Microsserviço dedicado ao enriquecimento de dados cinematográficos (via TMDB API), importando sinopses, duração, diretor e elenco.
*   **`servidor.js`:** *Dummy Server* em Express criado especificamente para manter a porta HTTP aberta, atendendo aos requisitos de *Health Check* de plataformas de nuvem.
*   **Maestro (`concurrently`):** Gerenciador de processos que inicializa e monitora todas as *threads* simultaneamente através de um único comando.

*   **`importar.js`** Esse roda de forma local, usada apenas quando tenho uma lista muito grande de filmes para adicionar de uma vez só (futuramente talvez eu faço o mesmo para a parte de livros, só é chato porque tem que pegar o ISBN).

## Infraestrutura e Cloud

O sistema está hospedado na nuvem (Render) com uma esteira de Integração Contínua (CI) ligada diretamente a este repositório do GitHub.

**Estratégia de Keep-Alive:**
Para contornar o congelamento de instâncias em *Tiers* gratuitos, foi implementada uma rotina de *Cron-job* externa. A cada 10 minutos, a rota principal do `servidor.js` recebe um *ping*, garantindo que o hardware virtual nunca entre em modo de hibernação (*spin down*). A automação roda de forma 100% autônoma, 24/7.

## Tecnologias Utilizadas

*   **Node.js:** Ambiente de execução principal.
*   **@notionhq/client:** SDK Oficial do Notion para requisições e manipulação de blocos.
*   **Express:** Criação do servidor de comunicação.
*   **Axios & Cheerio:** Motores de requisição e parsing HTML para rotinas de web scraping.
*   **Concurrently:** Orquestração de múltiplos scripts no mesmo terminal.
*   **Dotenv:** Injeção segura de variáveis de ambiente.
