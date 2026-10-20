# Plano Alimentar · Elisabete Mendes

Editor de planos alimentares que gera um PDF limpo e profissional, para enviar por WhatsApp ou email.
É um site estático (PWA): sem servidor, sem base de dados e sem custos. **Nada fica guardado**: cada plano
é preenchido, exportado e descartado.

## Como funciona

- A folha A4 edita-se diretamente; o que se vê corresponde ao PDF.
- **Página 1**: cabeçalho (cliente, data, próxima consulta opcional), objetivo da consulta e refeições numa linha do tempo.
  As refeições são **uma caixa de texto livre**: cola-se o plano inteiro copiado do software da empresa e a app formata-o:
  - linha que começa por hora (`6h30 Em jejum:`, `12h30 - 13h00 Almoço:`) ou por um nome de refeição (`Ceia:`) → nova refeição;
  - linha com `-`, `•` ou `1•` → ponto da lista;
  - linha curta terminada em `:` (`PRATO DE SOBREMESA:`) → subtítulo;
  - `Sobremesa: 1 gelatina` → rótulo a negrito; `**texto**` → negrito.

  Ao sair da caixa aparece o plano formatado; clicar numa refeição volta ao texto com o cursor nessa linha.
  (A versão anterior, com campos individuais por refeição, está guardada em [OldForFuture.md](OldForFuture.md).)
- **Página 2**: recomendações (Fruta, Água, Suplementação, Composição do prato, Confeções e temperos, Dicas, Fotografias).
- Passar o rato sobre um bloco mostra os controlos: mover, duplicar, apagar; nas secções também largura (inteira/meia), colunas, estilo da lista e cor.
- Duas secções seguidas com **meia largura** ficam lado a lado.
- Linhas e secções vazias não aparecem no PDF.
- Nas secções: `⌘B` negrito · `⌘I` itálico · `Enter` nova linha · `⌥↑/↓` mover linha.
  Colar texto com várias linhas cria uma linha por cada.

**Pré-visualizar e enviar** gera o PDF e oferece:
- **Partilhar…**: a folha de partilha do macOS (WhatsApp Desktop, Mail, AirDrop) com o PDF já anexado.
- **Descarregar PDF**.
- **WhatsApp / Email**: descarrega o PDF e abre a conversa com a mensagem escrita; depois arrasta-se o ficheiro.
  Um site não consegue anexar ficheiros a estas apps por si só.

## Alterar dados fixos

- Nome, cédula e telefone: [js/config.js](js/config.js) (`NUTRITIONIST`).
- Texto com que as secções abrem: `defaultPlan()` no mesmo ficheiro (as refeições começam vazias).
- Regras de formatação do texto colado: `parseMeals()` em [js/model.js](js/model.js).
- Cores: `COLORS` em `js/config.js` (PDF) e as variáveis no início de [css/app.css](css/app.css) (editor).
- Logótipo: `img/logo.png` (PNG com fundo transparente).
- Fotos padrão da secção Fotografias: `img/prato-1.png` e `img/prato-2.png` (lista `photos` em `defaultPlan()`).
  Fotos com fundo branco (as padrão e as que forem carregadas) ficam com o fundo da cor da página,
  sem moldura; o tratamento está em [js/photo.js](js/photo.js).

## Publicar no GitHub Pages

1. Criar um repositório no GitHub (pode ser privado só com GitHub Pro; público funciona sempre).
2. Enviar estes ficheiros:
   ```sh
   git init && git add . && git commit -m "Plano alimentar"
   git branch -M main
   git remote add origin https://github.com/<utilizador>/<repositorio>.git
   git push -u origin main
   ```
3. No repositório: **Settings → Pages → Source: Deploy from a branch → main / (root)**.
4. Abrir `https://<utilizador>.github.io/<repositorio>/` no portátil.
   - Safari: **Ficheiro → Adicionar à Dock**. Chrome: ícone de instalar na barra de endereço.
   - Depois da primeira abertura funciona sem internet.

**Ao publicar alterações**, aumentar `VERSION` em [sw.js](sw.js) (ex.: `v1` → `v2`). A versão nova aparece
na segunda abertura da app.

## Testar localmente

```sh
python3 -m http.server 8765
```
e abrir <http://localhost:8765>. Abrir o `index.html` diretamente (`file://`) não funciona.

## Estrutura

| Ficheiro | Função |
|---|---|
| `js/app.js` | Editor (folha A4, blocos, atalhos) |
| `js/pdf.js` | Geração do PDF com pdfmake (texto vetorial, paginação automática) |
| `js/export.js` | Janela de pré-visualização, partilha, WhatsApp e email |
| `js/model.js` | Regras comuns ao editor e ao PDF, incluindo `parseMeals()` (texto colado → refeições) |
| `js/config.js` | Dados da nutricionista, cores e conteúdo inicial |
| `vendor/pdfmake.min.js` | pdfmake 0.2.10 (incluído localmente para funcionar offline) |
| `fonts/` | Lato e Cormorant Garamond (Google Fonts, licença OFL) |
