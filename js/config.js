// Subir a cada publicação: os portáteis com a app instalada atualizam a cache.
export const APP_VERSION = 'v13';

// Dados fixos da nutricionista — alterar aqui se algo mudar.
export const NUTRITIONIST = {
  name: 'Elisabete Mendes',
  title: 'Nutricionista',
  license: '3197N',
  phone: '917 937 251',
  website: 'elisabetemendesnutri.com',
};

// Paleta retirada do logótipo (folhas verde-salva/azul, ananás pêssego/coral).
export const COLORS = {
  page: '#FDFBF7',
  ink: '#3B4043',
  muted: '#80878A',
  line: '#D9E3DE',
  sage: '#6E8C7F',
  coral: '#D9826F',
  tones: {
    sage: { bg: '#EFF4F1', accent: '#7C998C' },
    peach: { bg: '#FBEFE7', accent: '#E29B7C' },
    blue: { bg: '#EDF3F4', accent: '#7FA0A8' },
    none: { bg: null, accent: '#7C998C' },
  },
};

// Secções da página de recomendações. `icon` aponta para ICONS em icons.js.
export const SECTION_PRESETS = {
  fruit: { title: 'Fruta', icon: 'fruit', tone: 'peach', columns: 3, list: 'bullet' },
  water: { title: 'Água', icon: 'water', tone: 'blue', columns: 1, list: 'bullet' },
  supplements: { title: 'Suplementação', icon: 'pill', tone: 'sage', columns: 1, list: 'bullet' },
  plate: { title: 'Composição do prato', icon: 'plate', tone: 'sage', columns: 1, list: 'number' },
  cooking: { title: 'Confeções e temperos', icon: 'pan', tone: 'blue', columns: 1, list: 'none' },
  tips: { title: 'Dicas', icon: 'tips', tone: 'peach', columns: 1, list: 'bullet' },
  recipes: { title: 'Receitas', icon: 'recipe', tone: 'sage', columns: 1, list: 'bullet' },
  photos: { title: 'Fotografias', icon: 'photo', tone: 'none' },
};

const PROTEIN = 'carnes – aves (frango, peru, pato e avestruz), caça (coelho, lebre, perdiz, codorniz e javali), miúdos e vísceras <b>ou</b> peixes (todos), mariscos, moluscos, conservas ao natural, salmão fumado';

// Conteúdo com que a folha abre. Vive apenas no código: nada é guardado no computador.
export function defaultPlan() {
  const today = new Date();
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return {
    header: { title: 'Consulta de Nutrição', client: '', objective: '', date: iso(today), nextVisit: '' },
    sectionsOnNewPage: true,
    // Refeições: texto livre colado do software da empresa (ver parseMeals em model.js).
    mealsText: '',
    sections: [
      section('fruit', {
        intro: 'Cada porção de fruta equivale a:',
        items: ['3 ameixas', '1 a 2 pêssegos ou nectarinas', '1 laranja', '2 tangerinas', '1 toranja', '6 morangos',
          '12 amoras, framboesas ou mirtilos', '2 kiwis', '½ abacate', '1 maçã', '½ papaia', '1 pera',
          '1 fatia de melancia', '1 fatia de melão', '½ meloa', '3 alperces', '4 nêsperas', '1 romã',
          '½ marmelo (assado com canela)', '1 rodela de abacaxi', '12 cerejas', '12 uvas', '½ manga', '3 figos',
          '1 banana pequena', '1 anona', '1 dióspiro'],
      }),
      section('water', { intro: 'Beber <b>1,5 L de água</b> por dia.', list: 'none', items: ['Sugestão: 3 garrafas de 500 ml'] }),
      section('supplements', { items: ['', ''] }),
      section('photos', { width: 'half', caption: 'Exemplo de prato equilibrado', photos: ['img/prato-1.png', 'img/prato-2.png'] }),
      section('plate', {
        width: 'half',
        intro: 'Prato e talheres de sobremesa:',
        items: [
          '<b>Meio prato</b> de salada ou legumes – pouco cozinhados e com pouca gordura.',
          `<b>Proteína: 125 g</b> (tamanho da palma da mão) – ${PROTEIN} e ovas.`,
          '<b>Hidratos: 3 colheres de sopa (80 g)</b> de uma guarnição à escolha – ex.: grão de soja, grão-de-bico, ervilhas, lentilhas, feijão preto, vermelho ou branco, couscous, quinoa, arroz, arroz basmati, massa, massa integral, batata-doce, batata…',
        ],
      }),
      section('cooking', { items: [
        '<b>Confeções:</b> estufados em cru, assados com pouca gordura e sem tostar, grelhados sem gordura, cozidos a vapor e salteados com azeite e alho.',
        '<b>Temperos:</b> ervas aromáticas, especiarias, flor de sal ou sal rosa dos Himalaias, azeite, vinagre, vinho e cerveja.',
      ] }),
      section('tips'),
    ],
  };
}

export function section(type, overrides = {}) {
  const p = SECTION_PRESETS[type];
  const base = type === 'photos'
    ? { type, title: p.title, icon: p.icon, tone: p.tone, width: 'full', photos: [], caption: '' }
    : { type, title: p.title, icon: p.icon, tone: p.tone, width: 'full', columns: p.columns, list: p.list, intro: '', items: [] };
  return { ...base, ...overrides };
}
