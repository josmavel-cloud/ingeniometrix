export type ResourceArticle = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  readingTime: string;
  publishedAt: string;
  sections: Array<{
    heading: string;
    body: string[];
  }>;
};

export const resourceArticles: ResourceArticle[] = [
  {
    slug: "como-convertir-idea-en-plan-de-tesis",
    title: "Cómo convertir una idea de investigación en un plan de tesis",
    description:
      "Una guía práctica para pasar de un interés amplio a una primera base de plan de tesis con tema, problema, objetivo y ruta inicial.",
    eyebrow: "Guía práctica",
    readingTime: "6 min",
    publishedAt: "2026-05-04",
    sections: [
      {
        heading: "Empieza por reducir amplitud, no por escribir más",
        body: [
          "Una idea de investigación suele empezar como un interés amplio. El primer avance real no es producir más texto, sino convertir ese interés en un foco que pueda revisarse.",
          "Un buen punto de partida identifica el fenómeno, el contexto, la población o caso, y la tensión que justifica investigar. Sin esa delimitación, el plan crece en páginas, pero no en claridad.",
        ],
      },
      {
        heading: "Conecta tema, problema y objetivo",
        body: [
          "El plan de tesis necesita coherencia entre lo que se quiere estudiar, por qué importa y qué se espera lograr. Si el objetivo no responde al problema, la estructura completa se debilita.",
          "Antes de avanzar, conviene revisar si el título provisional, el problema y el objetivo general hablan del mismo fenómeno con el mismo nivel de alcance.",
        ],
      },
      {
        heading: "Usa IA como capa de orden, no como sustituto",
        body: [
          "La IA puede ayudar a sintetizar, contrastar y visualizar alternativas, pero el criterio académico sigue siendo humano. La salida debe revisarse, ajustarse y sostenerse con evidencia recuperable.",
          "Ingeniometrix se enfoca en esa primera capa: pasar de una idea difusa a una base más clara para conversar, revisar y seguir trabajando.",
        ],
      },
    ],
  },
  {
    slug: "que-debe-tener-un-plan-de-tesis",
    title: "Qué debe tener un buen plan de tesis",
    description:
      "Los elementos mínimos que ayudan a que un plan de tesis sea claro, revisable y defendible desde la primera versión.",
    eyebrow: "Checklist académico",
    readingTime: "5 min",
    publishedAt: "2026-05-04",
    sections: [
      {
        heading: "Una pregunta clara antes que muchas páginas",
        body: [
          "Un plan de tesis no se evalúa solo por extensión. Se evalúa por la claridad de sus decisiones: qué se investigará, con qué enfoque, en qué contexto y con qué límites.",
          "La pregunta o el objetivo principal deben funcionar como brújula. Si cada sección apunta a un lugar distinto, el documento se vuelve difícil de defender.",
        ],
      },
      {
        heading: "Evidencia inicial y supuestos visibles",
        body: [
          "La primera versión no necesita resolver toda la literatura, pero sí debe mostrar una ruta razonable de fuentes, conceptos y criterios de selección.",
          "También debe declarar lo que todavía falta: supuestos, información pendiente, restricciones de alcance y decisiones que necesitan revisión.",
        ],
      },
      {
        heading: "Una estructura que permita revisión",
        body: [
          "Un buen plan facilita que otra persona revise la coherencia entre problema, objetivos, método y bibliografía. Si la lógica no se puede seguir, el trabajo se vuelve frágil.",
          "Por eso la trazabilidad importa: cada decisión relevante debe poder explicarse y conectarse con fuentes o criterios visibles.",
        ],
      },
    ],
  },
  {
    slug: "ia-en-investigacion-sin-perder-criterio",
    title: "Cómo usar IA en investigación sin perder criterio académico",
    description:
      "Principios para usar asistencia con IA como apoyo de claridad, revisión y trazabilidad, sin convertirla en sustituto del trabajo académico.",
    eyebrow: "Uso responsable",
    readingTime: "7 min",
    publishedAt: "2026-05-04",
    sections: [
      {
        heading: "La IA debe ayudarte a pensar mejor",
        body: [
          "El valor de la IA en investigación no está en producir texto sin revisión. Está en ayudarte a ordenar alternativas, detectar vacíos y hacer visibles decisiones que antes quedaban implícitas.",
          "Usada con criterio, puede acelerar la preparación de una base inicial. Usada sin revisión, puede amplificar errores, supuestos débiles o fuentes mal entendidas.",
        ],
      },
      {
        heading: "Trazabilidad como regla de trabajo",
        body: [
          "Toda afirmación importante debe poder conectarse con evidencia recuperable o con una decisión metodológica explícita. Si no se puede rastrear, debe tratarse como supuesto o pendiente.",
          "Esto protege la calidad del trabajo y también hace más útil la conversación con asesores, revisores o equipos.",
        ],
      },
      {
        heading: "El límite: apoyo, no reemplazo",
        body: [
          "Una herramienta responsable no promete graduación ni reemplaza la revisión humana. Su función es ayudar a construir una base más clara, no simular dominio académico.",
          "Ingeniometrix está diseñado para trabajar en esa frontera: claridad, estructura, evidencia y revisión, sin posicionarse como generador automático de tesis.",
        ],
      },
    ],
  },
];

export function getResourceArticle(slug: string) {
  return resourceArticles.find((article) => article.slug === slug) ?? null;
}
