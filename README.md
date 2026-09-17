# Plotador de ERBs e Pontos (POI)

Uma ferramenta web para visualização e planejamento de Estações Rádio Base (ERB) e Pontos de Interesse (POI) em mapas interativos. Funciona direto no navegador, sem instalação e sem enviar dados a servidores.

![Mapa do Projeto](screenshots/preview.jpg)

## 🚀 Funcionalidades

- **Plotagem de ERBs (Setores):** Adicione setores de rádio frequência definindo latitude, longitude, azimute, raio de cobertura e abertura (beamwidth).
- **Pontos de Interesse (POI):** Marque locais específicos no mapa com ícones descritivos (casa, pessoa, veículo, arma, etc.).
- **Ferramenta de Medição:** Meça distâncias entre pontos no mapa com suporte a múltiplos segmentos.
- **Busca de Endereços:** Localize qualquer endereço utilizando o serviço Nominatim do OpenStreetMap.
- **Importação/Exportação Excel:** Salve seu trabalho ou carregue listas de dados, com suporte a colunas de **Data e Hora separadas** ou unificadas. Linhas inválidas são ignoradas e contabilizadas.
- **Modelo de Importação:** Ao exportar com o mapa vazio, a ferramenta gera automaticamente uma planilha modelo com dados de exemplo.
- **Recuperação Automática:** Os elementos plotados ficam guardados no navegador (`localStorage`) e são restaurados ao reabrir a página.
- **Múltiplas Camadas de Mapa:** Google Roadmap (padrão), Satélite e Híbrido, com OpenStreetMap e CARTO claro/escuro como alternativas. Se os tiles do Google não carregarem, o mapa troca automaticamente para o OpenStreetMap.
- **Slider Temporal:** Filtre ERBs por data/hora em três modos. **Instante** mostra só as ERBs do horário selecionado; **Intervalo** mostra todas as ERBs entre um início e um fim; **Todos** desliga o filtro de tempo. As setas ← → movem o instante ou a janela inteira, e Shift + setas ajustam o fim.
- **Análise de Sobreposição:** Três ferramentas na aba Análise, aplicadas às ERBs e pontos visíveis no mapa:
  - **Pontos dentro dos setores:** teste analítico ponto a ponto, listando quais setores contêm cada ponto.
  - **Interseção exata:** polígono comum a todos os setores, com área, centróide e os pontos que caem dentro.
  - **Mapa de cobertura:** grade que conta quantos setores cobrem cada célula, desenhada como camada de calor com legenda de áreas.
- **Interface Responsiva:** Layout adaptado a celulares e tablets, com tema escuro e efeitos de vidro.
- **Gerenciamento de Elementos:** Lista lateral para focar, editar, ocultar ou remover elementos individualmente, com botões para ocultar todos os elementos de uma vez ou apenas os rótulos. Marcadores podem ser arrastados no mapa.
- **Funciona Offline:** Todas as bibliotecas ficam versionadas na pasta `vendor/`. Apenas os mapas de fundo, a busca de endereços e as fontes do Google exigem internet.

## 🛠️ Tecnologias Utilizadas

- **HTML5 & CSS3:** Estrutura e estilização com variáveis CSS e media queries.
- **JavaScript (Vanilla):** Lógica da aplicação sem frameworks nem etapa de build.
- **[Leaflet.js](https://leafletjs.com/) 1.9.4:** Biblioteca principal para mapas interativos.
- **[SheetJS](https://sheetjs.com/) 0.18.5:** Processamento de arquivos Excel no navegador.
- **[Font Awesome](https://fontawesome.com/) 6.4.0:** Conjunto de ícones para a interface e marcadores.
- **[polygon-clipping](https://github.com/mfogel/polygon-clipping) 0.15.7:** Interseção de polígonos para a análise de sobreposição.
- **[Google Fonts](https://fonts.google.com/):** Tipografias Outfit e Inter, com fontes do sistema como alternativa offline.

## 📂 Como Usar

1. **Abrir o Projeto:** Clone o repositório e abra o arquivo `index.html` em qualquer navegador moderno. Se preferir servir por HTTP, rode `npm run serve` e acesse `http://localhost:8080`.
2. **Adicionar ERB:** Selecione a aba "ERBs", preencha os dados ou clique no mapa para capturar as coordenadas e clique em "Plotar ERB".
3. **Adicionar Ponto:** Selecione a aba "Pontos (POI)", escolha um ícone e cor, e clique no mapa ou preencha as coordenadas.
4. **Slider Temporal:** Use o slider inferior para filtrar elementos por data/hora. No modo Intervalo, arraste os dois cursores para definir início e fim. Você pode usar as **setas ← → do teclado** para navegar entre os horários.
5. **Analisar Sobreposição:** Na aba "Análise", deixe visíveis apenas as ERBs de interesse (pelo slider ou pelos botões de olho da lista) e use "Verificar pontos", "Calcular área comum" ou "Gerar" mapa de cobertura. "Limpar análise" remove os resultados do mapa.
6. **Medir Distância:** Clique no botão de régua e vá clicando no mapa para definir o trajeto. Pressione `ESC` para cancelar ou terminar.
7. **Exportar Dados:** Clique no botão "Exportar" para baixar um arquivo Excel com todos os elementos presentes no mapa.
8. **Importar Dados:** Clique em "Importar" e selecione um arquivo Excel. A ferramenta aceita tanto colunas unificadas de data/hora quanto separadas.

### Como a sobreposição é calculada

| Ferramenta | Método | Precisão | Quando usar |
|------------|--------|----------|-------------|
| Pontos dentro dos setores | Distância haversine até o centro e rumo dentro de azimute ± abertura/2 | Exata | Conferir se um endereço ou ponto cai na cobertura de cada ERB |
| Interseção exata | Setores projetados em metros (equirretangular local) e recortados com `polygon-clipping` | Exata para os polígonos desenhados | Obter o polígono, a área e o centróide da zona comum a todas as ERBs |
| Mapa de cobertura | Grade de células; cada célula recebe a contagem de setores que a contêm | Limitada ao tamanho da célula (25 a 200 m) | Ver quantas ERBs cobrem cada região, inclusive quando não há área comum a todas |

Os setores desenhados são uma simplificação com raio uniforme, sem relevo, inclinação de antena ou lóbulos secundários. Os resultados herdam essa simplificação.

### Formato da planilha

| Coluna    | ERB                    | POI                 | Observações                                             |
|-----------|------------------------|---------------------|---------------------------------------------------------|
| Tipo      | `ERB`                  | `POI`               | Obrigatória                                             |
| Nome      | texto                  | texto               | Gerado automaticamente se vazio                         |
| Latitude  | número                 | número              | Obrigatória, entre -90 e 90                             |
| Longitude | número                 | número              | Obrigatória, entre -180 e 180                           |
| Azimute   | graus (0 a 360)        | vazio               | Obrigatória para ERB; `0` significa norte               |
| Raio      | metros                 | vazio               | Obrigatória para ERB                                    |
| Abertura  | graus                  | vazio               | Obrigatória para ERB                                    |
| Cor       | `#rrggbb`              | `#rrggbb`           | Cor padrão quando vazia ou inválida                     |
| Icone     | vazio                  | nome do ícone       | Ex.: `location-dot`, `house`, `car`                     |
| Data      | `DD/MM/AAAA`           | opcional            | Também aceita `Data/Hora` unificada ou formato ISO      |
| Hora      | `HH:mm`                | opcional            |                                                         |

## 🧪 Desenvolvimento

```bash
npm run check   # verifica a sintaxe dos scripts
npm test        # executa os testes unitários (Node.js 18+)
npm run serve   # serve a pasta em http://localhost:8080
```

As funções puras (geometria do setor, sobreposição, parse de datas, sanitização) ficam em `utils.js` e são testadas em `test/utils.test.js` e `test/geometry.test.js`. A integração contínua roda esses testes em cada push e pull request.

## 🔐 Privacidade e Responsabilidade

- **Dados Locais:** Este site não armazena nenhuma informação em servidores. Todos os dados permanecem no seu navegador. A busca de endereços consulta o Nominatim (OpenStreetMap) e os mapas de fundo são carregados dos respectivos provedores.
- **Camadas do Google:** As camadas do Google usam um endpoint sem chave de API e podem parar de funcionar sem aviso. Quando isso acontece, a ferramenta cai automaticamente para o OpenStreetMap e exibe um aviso. As demais camadas continuam disponíveis no seletor do mapa.
- **Análise Técnica:** A interpretação dos dados de cobertura de ERB e a precisão da análise cabem inteiramente ao usuário técnico.
- **Instruções:** Um guia rápido é exibido automaticamente ao carregar o site, acessível a qualquer momento pelo botão `(?)`.

## 📄 Estrutura de Arquivos

- `index.html`: Estrutura principal da página e importação de scripts.
- `script.js`: Lógica de manipulação do mapa, formulários, slider temporal, análise de sobreposição, persistência e integração Excel.
- `utils.js`: Funções puras compartilhadas entre o navegador e os testes.
- `style.css`: Estilização completa, layouts responsivos e design system.
- `vendor/`: Bibliotecas de terceiros versionadas localmente.
- `test/`: Testes unitários executados com o runner nativo do Node.js.
- `screenshots/`: Imagens de demonstração.

## 📝 Licença

Distribuído sob a licença MIT. Consulte o arquivo [LICENSE](LICENSE).
