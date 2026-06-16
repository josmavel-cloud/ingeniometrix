import type { SupportedLanguage } from "@/lib/language";

const providerDescriptions = {
  es: [
    {
      name: "OpenAI",
      description: "Asistencia para estructurar, sintetizar y explicar ideas complejas.",
      logoSrc: "/providers/openai.png",
      logoClassName: "w-9 rounded-[10px]",
    },
    {
      name: "Claude",
      description: "Apoyo conversacional para analisis guiado y revision de enfoque.",
      logoSrc: "/providers/claude.png",
      logoClassName: "w-8 rounded-[10px]",
    },
    {
      name: "OpenAlex",
      description: "Descubrimiento bibliografico abierto y contexto academico recuperable.",
      logoSrc: "/providers/openalex.png",
      logoClassName: "w-8 rounded-[10px]",
    },
    {
      name: "Crossref",
      description: "Metadatos DOI para fortalecer trazabilidad y verificacion.",
      logoSrc: "/providers/crossref.svg",
      logoClassName: "w-28",
      hideName: true,
    },
  ],
  en: [
    {
      name: "OpenAI",
      description: "Assistance for structuring, synthesizing, and explaining complex ideas.",
      logoSrc: "/providers/openai.png",
      logoClassName: "w-9 rounded-[10px]",
    },
    {
      name: "Claude",
      description: "Conversational support for guided analysis and focus review.",
      logoSrc: "/providers/claude.png",
      logoClassName: "w-8 rounded-[10px]",
    },
    {
      name: "OpenAlex",
      description: "Open bibliographic discovery and recoverable academic context.",
      logoSrc: "/providers/openalex.png",
      logoClassName: "w-8 rounded-[10px]",
    },
    {
      name: "Crossref",
      description: "DOI metadata to strengthen traceability and verification.",
      logoSrc: "/providers/crossref.svg",
      logoClassName: "w-28",
      hideName: true,
    },
  ],
};

export const portalVisualCopy = {
  es: {
    thesisPlan: {
      eyebrow: "Plan de tesis",
      title: "Base inicial para avanzar hacia el requisito academico",
      badge: "Trazable",
      refinedTopicLabel: "Tema refinado",
      refinedTopic:
        "IA generativa y retroalimentacion academica en programas de posgrado.",
      evidenceLabel: "Evidencia visible",
      evidenceTags: ["DOI", "Fuentes", "Supuestos"],
      sections: [
        ["Problema", "Tema delimitado, contexto y vacio inicial"],
        ["Objetivo", "Ruta general para orientar el trabajo"],
        ["Preguntas", "Decisiones que guian la busqueda"],
        ["Metodo", "Enfoque inicial y criterios de revision"],
      ],
    },
    snapshotPoster: {
      eyebrow: "Snapshot visual",
      title: "Del tema amplio a una ruta inicial de tesis.",
      description:
        "Una lectura rapida del foco, los ejes y las palabras clave antes de pasar al plan completo.",
      axes: ["Docencia", "Calidad", "Adopcion", "Riesgos"],
      keywordsLabel: "Palabras clave",
      keywords: ["retroalimentacion", "IA", "posgrado", "metodo"],
    },
    researchFlow: {
      eyebrow: "Del tema al plan de tesis",
      title: "Menos lectura lineal, mas recorrido visual.",
      description:
        "La experiencia debe dejar claro que ocurre desde la idea inicial hasta una base de plan revisable.",
      steps: [
        { label: "Tema difuso", detail: "Idea inicial" },
        { label: "Snapshot", detail: "Foco y ejes" },
        { label: "Plan inicial", detail: "Objetivos y metodo" },
        { label: "Revision", detail: "Criterio humano" },
        { label: "Exportacion", detail: "DOCX y evidencia" },
      ],
    },
    evidenceMap: {
      eyebrow: "Trazabilidad visual",
      title: "De motores a evidencia, de evidencia a plan.",
      steps: ["Modelos IA", "OpenAlex", "Crossref", "Fuentes", "Evidencia", "Plan"],
    },
  },
  en: {
    thesisPlan: {
      eyebrow: "Thesis plan",
      title: "Initial foundation for moving toward the academic requirement",
      badge: "Traceable",
      refinedTopicLabel: "Refined topic",
      refinedTopic:
        "Generative AI and academic feedback in graduate programs.",
      evidenceLabel: "Visible evidence",
      evidenceTags: ["DOI", "Sources", "Assumptions"],
      sections: [
        ["Problem", "Delimited topic, context, and initial gap"],
        ["Objective", "General route to guide the work"],
        ["Questions", "Decisions that guide the search"],
        ["Method", "Initial approach and review criteria"],
      ],
    },
    snapshotPoster: {
      eyebrow: "Visual snapshot",
      title: "From a broad topic to an initial thesis route.",
      description:
        "A quick reading of focus, axes, and keywords before moving into the full plan.",
      axes: ["Teaching", "Quality", "Adoption", "Risks"],
      keywordsLabel: "Keywords",
      keywords: ["feedback", "AI", "graduate study", "method"],
    },
    researchFlow: {
      eyebrow: "From topic to thesis plan",
      title: "Less linear reading, more visual routing.",
      description:
        "The experience should make clear what happens from the initial idea to a reviewable plan foundation.",
      steps: [
        { label: "Diffuse topic", detail: "Initial idea" },
        { label: "Snapshot", detail: "Focus and axes" },
        { label: "Initial plan", detail: "Objectives and method" },
        { label: "Review", detail: "Human judgment" },
        { label: "Export", detail: "DOCX and evidence" },
      ],
    },
    evidenceMap: {
      eyebrow: "Visual traceability",
      title: "From engines to evidence, from evidence to plan.",
      steps: ["AI models", "OpenAlex", "Crossref", "Sources", "Evidence", "Plan"],
    },
  },
} satisfies Record<SupportedLanguage, Record<string, unknown>>;

export const portalHomeCopy = {
  es: {
    metadata: {
      title: "Ingeniometrix | Investigacion asistida con claridad y trazabilidad",
      description:
        "Ingeniometrix ayuda a convertir ideas iniciales en bases de investigacion mas claras, revisables y trazables con apoyo de IA.",
      ogDescription:
        "Una experiencia para convertir ideas iniciales en bases de investigacion mas claras, revisables y trazables.",
      twitterDescription:
        "Convierte ideas iniciales en bases de investigacion mas claras, revisables y trazables con apoyo de IA.",
      keywords: [
        "investigacion asistida",
        "investigacion academica",
        "asistente de investigacion",
        "tesis",
        "posgrado",
        "IA academica",
        "trazabilidad",
        "OpenAlex",
        "Crossref",
        "plan de tesis",
        "recursos de investigacion",
      ],
    },
    nav: {
      product: "Producto",
      traceability: "Trazabilidad",
      resources: "Recursos",
      contact: "Contacto",
      login: "Iniciar sesion",
      workspace: "Ir al workspace",
    },
    hero: {
      eyebrow: "Ingeniometrix",
      title:
        "Investigacion asistida para avanzar con claridad, criterio y trazabilidad.",
      description:
        "Ingeniometrix ayuda a convertir una idea inicial en una base revisable para plan de tesis: tema refinado, ejes clave, supuestos y una ruta inicial para seguir investigando.",
      primaryCta: "Iniciar sesion",
      secondaryCta: "Ver producto",
      imageAlt: "Biblioteca academica asistida por inteligencia artificial",
      overlayEyebrow: "De idea a base revisable",
      overlayTitle: "Una ruta inicial para investigar sin perder trazabilidad.",
      signals: ["Claridad para empezar", "Fuentes recuperables", "Ruta revisable"],
    },
    productCards: [
      {
        title: "IngenioIA",
        status: "Disponible",
        description:
          "Asistente de investigacion para ordenar ideas, delimitar temas y preparar una primera base hacia el plan de tesis.",
        iconSrc: "/marketing/icon-ingenioia.svg",
      },
      {
        title: "Ingenio Mentor",
        status: "Proximamente",
        description:
          "Capa de acompanamiento para feedback, seguimiento y conversaciones de revision con mas continuidad.",
        iconSrc: "/marketing/icon-mentor.svg",
      },
      {
        title: "Ingenio Lab",
        status: "Proximamente",
        description:
          "Espacio para explorar nuevas rutas, comparar enfoques y trabajar con evidencia de forma iterativa.",
        iconSrc: "/marketing/icon-lab.svg",
      },
      {
        title: "Ingenio Studio",
        status: "Proximamente",
        description:
          "Experiencia para equipos que necesitan procesos de investigacion mas ordenados, visibles y repetibles.",
        iconSrc: "/marketing/icon-studio.svg",
      },
    ],
    focus: {
      eyebrow: "IngenioIA",
      title: "Del tema difuso a una primera base de plan de tesis.",
      description:
        "La experiencia principal esta disenada para ordenar el inicio del trabajo: no promete resolver la tesis, sino aclarar el punto de partida y hacerlo mas facil de revisar.",
      primaryCta: "Ir al workspace",
      secondaryCta: "Leer recursos",
    },
    how: {
      eyebrow: "Como funciona",
      title: "Una experiencia corta para avanzar con mas control.",
      description:
        "El objetivo es reducir ambiguedad al inicio, no reemplazar la revision humana ni automatizar el trabajo academico.",
      stepPrefix: "Paso",
      steps: [
        {
          title: "Comparte una idea",
          description:
            "Empieza con el tema como lo tienes hoy, incluso si esta incompleto o todavia no tiene un titulo claro.",
        },
        {
          title: "Ordena el enfoque",
          description:
            "IngenioIA identifica ejes, palabras clave, supuestos y decisiones pendientes para reducir ambiguedad.",
        },
        {
          title: "Revisa con criterio",
          description:
            "La salida esta pensada para discusion humana: asesoria, revision academica o validacion profesional.",
        },
        {
          title: "Avanza con una ruta",
          description:
            "El resultado sirve como base para continuar hacia una estructura mas completa y trazable.",
        },
      ],
    },
    traceability: {
      eyebrow: "Trazabilidad",
      title: "IA para ordenar. Fuentes para sostener. Criterio para decidir.",
      description:
        "Ingeniometrix separa asistencia, evidencia y decisiones humanas para mantener una experiencia mas clara, verificable y revisable.",
      providers: [
        ...providerDescriptions.es,
        {
          name: "Exportaciones",
          description:
            "Salidas preparadas para documentos, gestores bibliograficos y bitacoras.",
          logoSrc: "/marketing/icon-engine-export.svg",
          logoClassName: "w-7",
        },
      ],
    },
    audience: {
      eyebrow: "Para quien es",
      title:
        "Una base comun para personas que investigan de formas distintas.",
      description:
        "El valor principal es ordenar el inicio: aclarar tema, evidencia, supuestos y ruta antes de invertir mas tiempo.",
      cards: [
        {
          title: "Estudiantes de posgrado",
          description:
            "Para quienes necesitan convertir un tema amplio en una base clara para avanzar hacia el plan de tesis.",
          iconSrc: "/marketing/icons/thesis-plan.svg",
        },
        {
          title: "Investigadores",
          description:
            "Para ordenar lineas de trabajo, detectar vacios iniciales y preparar rutas de revision mas consistentes.",
          iconSrc: "/marketing/icons/source-library.svg",
        },
        {
          title: "Asesores y revisores",
          description:
            "Para revisar coherencia entre tema, problema, objetivos, evidencia y decisiones metodologicas.",
          iconSrc: "/marketing/icons/method-compass.svg",
        },
        {
          title: "Equipos academicos",
          description:
            "Para trabajar con procesos mas visibles, salidas comparables y criterios compartidos de revision.",
          iconSrc: "/marketing/icons/export-package.svg",
        },
      ],
    },
    responsible: {
      eyebrow: "Uso responsable",
      title: "Disenado para apoyar la investigacion, no para reemplazarla.",
      items: [
        "No es un generador automatico de tesis.",
        "No promete aprobacion ni resultados academicos.",
        "No inventa citas, datos ni resultados.",
        "La informacion faltante se declara como supuesto o pendiente.",
        "Cada salida debe pasar por revision humana.",
      ],
    },
    promise: {
      eyebrow: "Promesa",
      title: "Menos friccion al inicio. Mas claridad para decidir.",
      description:
        "Ingeniometrix se enfoca en el primer bloqueo: saber si el tema empieza a tener forma, direccion y una ruta razonable hacia el requisito academico del plan de tesis.",
    },
    resources: {
      eyebrow: "Recursos",
      title: "Guias breves para investigar con mejor criterio.",
      cta: "Ver recursos",
      cards: [
        {
          title: "Como convertir una idea en plan de tesis",
          href: "/recursos/como-convertir-idea-en-plan-de-tesis",
          description:
            "Una guia para pasar de una intuicion amplia a una estructura inicial mas defendible.",
        },
        {
          title: "Que debe tener un plan de tesis",
          href: "/recursos/que-debe-tener-un-plan-de-tesis",
          description:
            "Elementos clave para revisar coherencia entre problema, objetivos, metodo y evidencia.",
        },
        {
          title: "IA en investigacion sin perder criterio",
          href: "/recursos/ia-en-investigacion-sin-perder-criterio",
          description:
            "Como usar asistencia de IA sin abandonar trazabilidad, revision y responsabilidad academica.",
        },
      ],
    },
    partners: {
      eyebrow: "Aliados",
      title: "Respaldo para construir una experiencia seria y sostenible.",
      description:
        "Simetrika y VivaCore acompanan el desarrollo del ecosistema Ingeniometrix.",
      label: "Aliado",
    },
    faq: {
      eyebrow: "Preguntas frecuentes",
      title: "Lo esencial para entender Ingeniometrix.",
      items: [
        {
          question: "Ingeniometrix hace mi tesis?",
          answer:
            "No. Ingeniometrix ayuda a estructurar el punto de partida y preparar una base revisable. No reemplaza el trabajo academico ni la revision humana.",
        },
        {
          question: "Sirve solo para tesis?",
          answer:
            "No. La primera experiencia esta enfocada en plan de tesis, pero la logica de claridad, trazabilidad y revision aplica a otros procesos de investigacion.",
        },
        {
          question: "Que hace IngenioIA?",
          answer:
            "Ordena una idea inicial, identifica ejes, palabras clave, supuestos y una ruta inicial para seguir investigando con mayor claridad.",
        },
        {
          question: "Que pasa con las fuentes?",
          answer:
            "La experiencia prioriza fuentes recuperables y metadatos verificables. Si algo no esta disponible, debe quedar indicado como pendiente.",
        },
      ],
    },
    contact: {
      eyebrow: "Contacto",
      title: "Hablemos sobre el siguiente paso con Ingeniometrix.",
      description:
        "Escribenos para solicitar acceso, resolver dudas o explorar una conversacion inicial sobre IngenioIA.",
      primaryCta: "Iniciar sesion",
      emailCta: "Escribir por correo",
      cards: [
        {
          label: "Correo",
          title: "hola@simetrika.pe",
          description: "Contacto para acceso, consultas y conversaciones iniciales.",
          iconSrc: "/marketing/icon-contact-mail.svg",
        },
        {
          label: "Dominio",
          title: "ingeniometrix.com",
          description: "Punto de entrada publico para Ingeniometrix e IngenioIA.",
          iconSrc: "/marketing/icon-contact-domain.svg",
        },
      ],
      newsletter: {
        eyebrow: "Newsletter",
        title: "Recibe novedades del producto",
        placeholder: "Tu correo",
        button: "Agregar",
      },
      social: "Redes",
    },
    footer: {
      description:
        "Investigacion asistida para empezar con mas claridad, criterio y trazabilidad.",
      rights: "2026 Ingeniometrix. Todos los derechos reservados.",
      links: {
        workspace: "Workspace",
        resources: "Recursos",
        contact: "Contacto",
        partners: "Aliados",
      },
    },
  },
  en: {
    metadata: {
      title: "Ingeniometrix | Research assistance with clarity and traceability",
      description:
        "Ingeniometrix helps turn early ideas into clearer, reviewable, and traceable research foundations with AI support.",
      ogDescription:
        "An experience for turning early ideas into clearer, reviewable, and traceable research foundations.",
      twitterDescription:
        "Turn early ideas into clearer, reviewable, and traceable research foundations with AI support.",
      keywords: [
        "research assistance",
        "academic research",
        "research assistant",
        "thesis",
        "graduate study",
        "academic AI",
        "traceability",
        "OpenAlex",
        "Crossref",
        "thesis plan",
        "research resources",
      ],
    },
    nav: {
      product: "Product",
      traceability: "Traceability",
      resources: "Resources",
      contact: "Contact",
      login: "Sign in",
      workspace: "Go to workspace",
    },
    hero: {
      eyebrow: "Ingeniometrix",
      title:
        "Research assistance for moving forward with clarity, judgment, and traceability.",
      description:
        "Ingeniometrix helps turn an initial idea into a reviewable thesis-plan foundation: refined topic, key axes, assumptions, and an initial route for continued research.",
      primaryCta: "Sign in",
      secondaryCta: "View product",
      imageAlt: "Academic library assisted by artificial intelligence",
      overlayEyebrow: "From idea to reviewable foundation",
      overlayTitle: "An initial research route without losing traceability.",
      signals: ["Clarity to start", "Recoverable sources", "Reviewable route"],
    },
    productCards: [
      {
        title: "IngenioIA",
        status: "Available",
        description:
          "Research assistant for organizing ideas, delimiting topics, and preparing a first foundation toward a thesis plan.",
        iconSrc: "/marketing/icon-ingenioia.svg",
      },
      {
        title: "Ingenio Mentor",
        status: "Coming soon",
        description:
          "A support layer for feedback, tracking, and review conversations with more continuity.",
        iconSrc: "/marketing/icon-mentor.svg",
      },
      {
        title: "Ingenio Lab",
        status: "Coming soon",
        description:
          "A space to explore new routes, compare approaches, and work with evidence iteratively.",
        iconSrc: "/marketing/icon-lab.svg",
      },
      {
        title: "Ingenio Studio",
        status: "Coming soon",
        description:
          "An experience for teams that need more orderly, visible, and repeatable research processes.",
        iconSrc: "/marketing/icon-studio.svg",
      },
    ],
    focus: {
      eyebrow: "IngenioIA",
      title: "From a diffuse topic to a first thesis-plan foundation.",
      description:
        "The main experience is designed to organize the beginning of the work: it does not promise to solve the thesis, but to clarify the starting point and make it easier to review.",
      primaryCta: "Go to workspace",
      secondaryCta: "Read resources",
    },
    how: {
      eyebrow: "How it works",
      title: "A short experience for moving forward with more control.",
      description:
        "The goal is to reduce ambiguity at the start, not replace human review or automate academic work.",
      stepPrefix: "Step",
      steps: [
        {
          title: "Share an idea",
          description:
            "Start with the topic as you have it today, even if it is incomplete or still lacks a clear title.",
        },
        {
          title: "Organize the focus",
          description:
            "IngenioIA identifies axes, keywords, assumptions, and pending decisions to reduce ambiguity.",
        },
        {
          title: "Review with judgment",
          description:
            "The output is meant for human discussion: advising, academic review, or professional validation.",
        },
        {
          title: "Move with a route",
          description:
            "The result becomes a base for continuing toward a more complete and traceable structure.",
        },
      ],
    },
    traceability: {
      eyebrow: "Traceability",
      title: "AI to organize. Sources to support. Judgment to decide.",
      description:
        "Ingeniometrix separates assistance, evidence, and human decisions to keep the experience clearer, verifiable, and reviewable.",
      providers: [
        ...providerDescriptions.en,
        {
          name: "Exports",
          description:
            "Outputs prepared for documents, bibliographic managers, and logs.",
          logoSrc: "/marketing/icon-engine-export.svg",
          logoClassName: "w-7",
        },
      ],
    },
    audience: {
      eyebrow: "Who it is for",
      title: "A shared foundation for people who research in different ways.",
      description:
        "The core value is organizing the beginning: clarifying topic, evidence, assumptions, and route before investing more time.",
      cards: [
        {
          title: "Graduate students",
          description:
            "For those who need to turn a broad topic into a clear foundation for moving toward a thesis plan.",
          iconSrc: "/marketing/icons/thesis-plan.svg",
        },
        {
          title: "Researchers",
          description:
            "For organizing lines of work, detecting initial gaps, and preparing more consistent review routes.",
          iconSrc: "/marketing/icons/source-library.svg",
        },
        {
          title: "Advisors and reviewers",
          description:
            "For reviewing coherence among topic, problem, objectives, evidence, and methodological decisions.",
          iconSrc: "/marketing/icons/method-compass.svg",
        },
        {
          title: "Academic teams",
          description:
            "For working with more visible processes, comparable outputs, and shared review criteria.",
          iconSrc: "/marketing/icons/export-package.svg",
        },
      ],
    },
    responsible: {
      eyebrow: "Responsible use",
      title: "Designed to support research, not replace it.",
      items: [
        "It is not an automatic thesis generator.",
        "It does not promise approval or academic results.",
        "It does not invent citations, data, or results.",
        "Missing information is declared as an assumption or pending item.",
        "Every output must go through human review.",
      ],
    },
    promise: {
      eyebrow: "Promise",
      title: "Less friction at the start. More clarity to decide.",
      description:
        "Ingeniometrix focuses on the first blockage: knowing whether the topic is starting to gain shape, direction, and a reasonable route toward the academic thesis-plan requirement.",
    },
    resources: {
      eyebrow: "Resources",
      title: "Short guides for researching with better judgment.",
      cta: "View resources",
      cards: [
        {
          title: "How to turn an idea into a thesis plan",
          href: "/recursos/como-convertir-idea-en-plan-de-tesis",
          description:
            "A guide for moving from a broad intuition to a more defensible initial structure.",
        },
        {
          title: "What a thesis plan should include",
          href: "/recursos/que-debe-tener-un-plan-de-tesis",
          description:
            "Key elements for reviewing coherence among problem, objectives, method, and evidence.",
        },
        {
          title: "AI in research without losing judgment",
          href: "/recursos/ia-en-investigacion-sin-perder-criterio",
          description:
            "How to use AI assistance without abandoning traceability, review, and academic responsibility.",
        },
      ],
    },
    partners: {
      eyebrow: "Partners",
      title: "Support for building a serious and sustainable experience.",
      description:
        "Simetrika and VivaCore support the development of the Ingeniometrix ecosystem.",
      label: "Partner",
    },
    faq: {
      eyebrow: "FAQ",
      title: "The essentials for understanding Ingeniometrix.",
      items: [
        {
          question: "Does Ingeniometrix write my thesis?",
          answer:
            "No. Ingeniometrix helps structure the starting point and prepare a reviewable foundation. It does not replace academic work or human review.",
        },
        {
          question: "Is it only for theses?",
          answer:
            "No. The first experience is focused on thesis plans, but the logic of clarity, traceability, and review applies to other research processes.",
        },
        {
          question: "What does IngenioIA do?",
          answer:
            "It organizes an initial idea, identifies axes, keywords, assumptions, and an initial route for continuing research with more clarity.",
        },
        {
          question: "What happens with sources?",
          answer:
            "The experience prioritizes recoverable sources and verifiable metadata. If something is not available, it should be marked as pending.",
        },
      ],
    },
    contact: {
      eyebrow: "Contact",
      title: "Let us talk about the next step with Ingeniometrix.",
      description:
        "Write to request access, resolve questions, or explore an initial conversation about IngenioIA.",
      primaryCta: "Sign in",
      emailCta: "Write by email",
      cards: [
        {
          label: "Email",
          title: "hola@simetrika.pe",
          description: "Contact for access, questions, and initial conversations.",
          iconSrc: "/marketing/icon-contact-mail.svg",
        },
        {
          label: "Domain",
          title: "ingeniometrix.com",
          description: "Public entry point for Ingeniometrix and IngenioIA.",
          iconSrc: "/marketing/icon-contact-domain.svg",
        },
      ],
      newsletter: {
        eyebrow: "Newsletter",
        title: "Receive product updates",
        placeholder: "Your email",
        button: "Add",
      },
      social: "Social",
    },
    footer: {
      description:
        "Research assistance to start with more clarity, judgment, and traceability.",
      rights: "2026 Ingeniometrix. All rights reserved.",
      links: {
        workspace: "Workspace",
        resources: "Resources",
        contact: "Contact",
        partners: "Partners",
      },
    },
  },
} satisfies Record<SupportedLanguage, Record<string, unknown>>;

export const campaignCopy = {
  es: {
    metadata: {
      title: "De idea difusa a plan de tesis inicial",
      description:
        "Ordena una idea inicial de investigacion con Ingeniometrix: tema refinado, ejes clave, palabras clave, supuestos y ruta inicial hacia el plan de tesis.",
      ogTitle: "De idea difusa a plan de tesis inicial | Ingeniometrix",
      ogDescription:
        "Convierte un tema difuso en una primera base mas clara para seguir investigando con criterio y trazabilidad.",
      twitterDescription:
        "Una primera lectura para ordenar tu tema, ver ejes clave y decidir si avanzas con una base mas completa.",
      imageAlt: "Chatbox de investigacion de Ingeniometrix",
    },
    nav: {
      chatbox: "Chatbox",
      delivery: "Entrega",
      faq: "FAQ",
      portal: "Ver portal",
      login: "Iniciar sesion",
    },
    hero: {
      eyebrow: "Ingeniometrix para investigacion",
      title:
        "Convierte una idea de investigacion en una base clara para tu plan de tesis.",
      description:
        "Ordena tu tema, identifica ejes clave, declara supuestos y prepara una ruta inicial revisable antes de avanzar a una estructura mas completa.",
      primaryCta: "Probar con mi tema",
      secondaryCta: "Ver que recibo",
      imageAlt: "Biblioteca academica asistida por inteligencia artificial",
      overlayEyebrow: "Biblioteca inteligente",
      overlayTitle: "Del tema inicial a una ruta de investigacion mas clara.",
      tags: ["Fuentes", "Evidencia", "Plan"],
      signals: ["Tema refinado", "Ejes clave", "Ruta inicial revisable"],
    },
    painSignals: [
      {
        title: "Tu idea existe, pero todavia no tiene forma",
        description:
          "Ingeniometrix ayuda a convertir una intuicion amplia en un punto de partida mas claro para investigacion.",
        iconSrc: "/marketing/icons/ai-lens.svg",
      },
      {
        title: "Necesitas avanzar con criterio academico",
        description:
          "La salida declara supuestos, limites y decisiones pendientes para evitar conclusiones apresuradas.",
        iconSrc: "/marketing/icons/method-compass.svg",
      },
      {
        title: "Tu asesor necesita ver estructura",
        description:
          "Un snapshot visual facilita conversar sobre alcance, viabilidad, enfoque y siguientes pasos.",
        iconSrc: "/marketing/icons/thesis-plan.svg",
      },
    ],
    deliverablesSection: {
      eyebrow: "Que recibes",
      title: "Un snapshot visual para entender tu tema antes de escribir paginas.",
      description:
        "La primera salida busca claridad: no resuelve todo el proyecto, pero te ayuda a ver si el enfoque tiene forma, limites y una ruta razonable.",
      items: [
        "Tema refinado y mejor delimitado",
        "Sintesis breve del problema",
        "Ejes clave para orientar la investigacion",
        "Palabras clave para buscar literatura",
        "Supuestos y decisiones pendientes",
        "Ruta inicial hacia el plan de tesis",
      ],
    },
    how: {
      eyebrow: "Como funciona",
      title: "Un recorrido corto para avanzar con mas control.",
      description:
        "La experiencia reduce friccion al inicio y deja claro que debe revisarse antes de continuar.",
      stepPrefix: "Paso",
      steps: [
        {
          title: "Escribe tu idea",
          description:
            "Comparte el tema como lo tienes hoy, aunque todavia este incompleto o desordenado.",
        },
        {
          title: "Recibe un snapshot",
          description:
            "Obten una primera lectura con enfoque, ejes, palabras clave y una vista visual del problema.",
        },
        {
          title: "Revisa el alcance",
          description:
            "Identifica supuestos, limites y decisiones que deben revisarse antes de avanzar.",
        },
        {
          title: "Define el siguiente paso",
          description:
            "Usa la base inicial para conversar mejor con tu asesor y continuar con mas claridad.",
        },
      ],
    },
    traceability: {
      eyebrow: "Trazabilidad",
      title: "IA para ordenar. Fuentes para sostener. Criterio para decidir.",
      description:
        "Ingeniometrix separa asistencia, evidencia y decisiones humanas para mantener una experiencia mas clara y revisable.",
      providers: providerDescriptions.es,
    },
    responsible: {
      eyebrow: "Uso responsable",
      title: "Disenado para apoyar la investigacion, no para reemplazarla.",
      items: [
        "No es un generador automatico de tesis.",
        "No promete aprobacion ni resultados academicos.",
        "No inventa citas, datos ni resultados.",
        "La informacion faltante se declara como supuesto o pendiente.",
        "La salida esta pensada para revision humana.",
      ],
    },
    promise: {
      eyebrow: "Promesa",
      title: "Menos friccion al inicio. Mas claridad para decidir.",
      description:
        "El snapshot se enfoca en el primer bloqueo: saber si el tema empieza a tener forma, direccion y una ruta razonable hacia el requisito academico del plan de tesis.",
    },
    faq: {
      eyebrow: "Preguntas frecuentes",
      title: "Lo esencial antes de avanzar.",
      description: "Respuestas breves sobre alcance, responsabilidad, fuentes y acceso.",
      items: [
        {
          question: "Que es el snapshot?",
          answer:
            "Es una primera lectura visual de tu idea: tema refinado, sintesis, ejes clave, palabras clave, supuestos y ruta inicial.",
        },
        {
          question: "Reemplaza a mi asesor?",
          answer:
            "No. Ingeniometrix ayuda a preparar una base mas clara para conversar, revisar y decidir con acompanamiento humano.",
        },
        {
          question: "La herramienta hace mi tesis?",
          answer:
            "No. Ayuda a estructurar el punto de partida. No redacta una tesis completa ni promete aprobacion academica.",
        },
        {
          question: "Puedo usarlo si mi tema esta muy amplio?",
          answer:
            "Si. Ese es el caso ideal: ordenar una idea amplia y convertirla en una base inicial mas clara.",
        },
        {
          question: "Que pasa con las fuentes?",
          answer:
            "La experiencia prioriza fuentes recuperables y trazabilidad. Si falta informacion, debe quedar indicada.",
        },
        {
          question: "Como solicito acceso?",
          answer:
            "Por ahora la coordinacion es manual por correo. El producto requiere una cuenta habilitada en backend.",
        },
      ],
    },
    access: {
      eyebrow: "Acceso al workspace",
      title: "Inicia sesion para generar tu snapshot.",
      description:
        "El acceso al producto esta limitado por ahora a cuentas habilitadas previamente en el backend.",
      formEyebrow: "Autenticacion",
      formTitle: "Entra con una cuenta habilitada",
      formDescription:
        "Desde el workspace podras crear proyectos, completar intake y generar el blueprint con fuentes trazables.",
      fields: [
        {
          label: "Correo",
          name: "correo",
          placeholder: "tu.correo@email.com",
          type: "email",
        },
        {
          label: "Programa o carrera",
          name: "programa",
          placeholder: "Ej. Maestria en Educacion",
          type: "text",
        },
        {
          label: "Tipo de trabajo",
          name: "tipo",
          placeholder: "Tesis, articulo, trabajo de investigacion...",
          type: "text",
        },
      ],
      ideaLabel: "Tema o idea inicial",
      ideaPlaceholder:
        "Escribe tu tema como lo tienes hoy, aunque todavia este desordenado.",
      submit: "Ir a autenticar",
      secondary: "Volver al chatbox",
    },
    footer: {
      description:
        "Investigacion asistida para empezar con mas claridad, criterio y trazabilidad.",
      portal: "Sitio principal",
      snapshot: "Solicitar snapshot",
      rights: "2026 Ingeniometrix. Todos los derechos reservados.",
    },
  },
  en: {
    metadata: {
      title: "From diffuse idea to initial thesis plan",
      description:
        "Organize an initial research idea with Ingeniometrix: refined topic, key axes, keywords, assumptions, and an initial route toward the thesis plan.",
      ogTitle: "From diffuse idea to initial thesis plan | Ingeniometrix",
      ogDescription:
        "Turn a diffuse topic into a clearer first foundation for continued research with judgment and traceability.",
      twitterDescription:
        "A first reading to organize your topic, see key axes, and decide whether to move forward with a fuller foundation.",
      imageAlt: "Ingeniometrix research chatbox",
    },
    nav: {
      chatbox: "Chatbox",
      delivery: "Delivery",
      faq: "FAQ",
      portal: "View portal",
      login: "Sign in",
    },
    hero: {
      eyebrow: "Ingeniometrix for research",
      title:
        "Turn a research idea into a clear foundation for your thesis plan.",
      description:
        "Organize your topic, identify key axes, declare assumptions, and prepare a reviewable initial route before moving into a fuller structure.",
      primaryCta: "Try my topic",
      secondaryCta: "See what I receive",
      imageAlt: "Academic library assisted by artificial intelligence",
      overlayEyebrow: "Smart library",
      overlayTitle: "From an initial topic to a clearer research route.",
      tags: ["Sources", "Evidence", "Plan"],
      signals: ["Refined topic", "Key axes", "Reviewable initial route"],
    },
    painSignals: [
      {
        title: "Your idea exists, but it does not have shape yet",
        description:
          "Ingeniometrix helps turn a broad intuition into a clearer research starting point.",
        iconSrc: "/marketing/icons/ai-lens.svg",
      },
      {
        title: "You need to move with academic judgment",
        description:
          "The output declares assumptions, limits, and pending decisions to avoid premature conclusions.",
        iconSrc: "/marketing/icons/method-compass.svg",
      },
      {
        title: "Your advisor needs to see structure",
        description:
          "A visual snapshot makes it easier to discuss scope, feasibility, focus, and next steps.",
        iconSrc: "/marketing/icons/thesis-plan.svg",
      },
    ],
    deliverablesSection: {
      eyebrow: "What you receive",
      title: "A visual snapshot to understand your topic before writing pages.",
      description:
        "The first output seeks clarity: it does not solve the whole project, but helps you see whether the focus has shape, limits, and a reasonable route.",
      items: [
        "Refined and better delimited topic",
        "Brief problem synthesis",
        "Key axes to orient the research",
        "Keywords for literature search",
        "Assumptions and pending decisions",
        "Initial route toward the thesis plan",
      ],
    },
    how: {
      eyebrow: "How it works",
      title: "A short path for moving forward with more control.",
      description:
        "The experience reduces friction at the start and makes clear what must be reviewed before continuing.",
      stepPrefix: "Step",
      steps: [
        {
          title: "Write your idea",
          description:
            "Share the topic as you have it today, even if it is still incomplete or disorganized.",
        },
        {
          title: "Receive a snapshot",
          description:
            "Get a first reading with focus, axes, keywords, and a visual view of the problem.",
        },
        {
          title: "Review the scope",
          description:
            "Identify assumptions, limits, and decisions that must be reviewed before moving forward.",
        },
        {
          title: "Define the next step",
          description:
            "Use the initial foundation to have a better conversation with your advisor and continue with more clarity.",
        },
      ],
    },
    traceability: {
      eyebrow: "Traceability",
      title: "AI to organize. Sources to support. Judgment to decide.",
      description:
        "Ingeniometrix separates assistance, evidence, and human decisions to keep the experience clearer and reviewable.",
      providers: providerDescriptions.en,
    },
    responsible: {
      eyebrow: "Responsible use",
      title: "Designed to support research, not replace it.",
      items: [
        "It is not an automatic thesis generator.",
        "It does not promise approval or academic results.",
        "It does not invent citations, data, or results.",
        "Missing information is declared as an assumption or pending item.",
        "The output is designed for human review.",
      ],
    },
    promise: {
      eyebrow: "Promise",
      title: "Less friction at the start. More clarity to decide.",
      description:
        "The snapshot focuses on the first blockage: knowing whether the topic is starting to gain shape, direction, and a reasonable route toward the academic thesis-plan requirement.",
    },
    faq: {
      eyebrow: "FAQ",
      title: "The essentials before moving forward.",
      description: "Short answers about scope, responsibility, sources, and access.",
      items: [
        {
          question: "What is the snapshot?",
          answer:
            "It is a first visual reading of your idea: refined topic, synthesis, key axes, keywords, assumptions, and initial route.",
        },
        {
          question: "Does it replace my advisor?",
          answer:
            "No. Ingeniometrix helps prepare a clearer foundation for conversation, review, and decision-making with human guidance.",
        },
        {
          question: "Does the tool write my thesis?",
          answer:
            "No. It helps structure the starting point. It does not write a complete thesis or promise academic approval.",
        },
        {
          question: "Can I use it if my topic is too broad?",
          answer:
            "Yes. That is the ideal case: organizing a broad idea and turning it into a clearer initial foundation.",
        },
        {
          question: "What happens with sources?",
          answer:
            "The experience prioritizes recoverable sources and traceability. Missing information must be marked.",
        },
        {
          question: "How do I request access?",
          answer:
            "For now, access is coordinated manually. The product requires a backend-enabled account.",
        },
      ],
    },
    access: {
      eyebrow: "Workspace access",
      title: "Sign in to generate your snapshot.",
      description:
        "Product access is currently limited to accounts enabled beforehand in the backend.",
      formEyebrow: "Authentication",
      formTitle: "Enter with an enabled account",
      formDescription:
        "From the workspace you can create projects, complete intake, and generate the blueprint with traceable sources.",
      fields: [
        {
          label: "Email",
          name: "correo",
          placeholder: "your.email@example.com",
          type: "email",
        },
        {
          label: "Program or major",
          name: "programa",
          placeholder: "E.g. Master in Education",
          type: "text",
        },
        {
          label: "Work type",
          name: "tipo",
          placeholder: "Thesis, article, research project...",
          type: "text",
        },
      ],
      ideaLabel: "Topic or initial idea",
      ideaPlaceholder:
        "Write your topic as you have it today, even if it is still disorganized.",
      submit: "Go to sign in",
      secondary: "Back to chatbox",
    },
    footer: {
      description:
        "Research assistance to start with more clarity, judgment, and traceability.",
      portal: "Main site",
      snapshot: "Request snapshot",
      rights: "2026 Ingeniometrix. All rights reserved.",
    },
  },
} satisfies Record<SupportedLanguage, Record<string, unknown>>;

export const chatboxCopy = {
  es: {
    assistantSubtitle: "Asistente de investigacion",
    mode: "Modo tesis",
    snapshot: "Snapshot",
    userMessage:
      "Tengo una idea de investigacion, pero todavia esta muy amplia. Quiero convertirla en una base clara para mi plan de tesis.",
    assistantMessage:
      "Podemos ordenar tu punto de partida sin reemplazar la revision academica.",
    responseItems: [
      {
        title: "Tema mas claro",
        description: "Delimita alcance, poblacion y foco inicial.",
      },
      {
        title: "Ejes de analisis",
        description: "Ordena variables, conceptos y posibles relaciones.",
      },
      {
        title: "Ruta revisable",
        description: "Declara supuestos y proximos pasos.",
      },
    ],
    suggestedTopics: [
      "IA en retroalimentacion academica",
      "Clima laboral y desempeno",
      "Gestion de riesgos en construccion",
      "Lectura critica en educacion superior",
    ],
    settings: [
      {
        label: "Salida",
        name: "salida",
        options: ["Snapshot visual", "Plan inicial", "Ruta de lectura"],
      },
      {
        label: "Enfoque",
        name: "enfoque",
        options: ["Plan de tesis", "Articulo", "Proyecto aplicado"],
      },
      {
        label: "Fuentes",
        name: "fuentes",
        options: ["Abiertas y trazables", "Base academica", "Sin busqueda por ahora"],
      },
    ],
    ideaPlaceholder: "Escribe tu tema o idea inicial...",
    attachLabel: "Adjuntar contexto",
    searchLabel: "Activar busqueda",
    dictateLabel: "Dictar idea",
    submit: "Iniciar sesion",
  },
  en: {
    assistantSubtitle: "Research assistant",
    mode: "Thesis mode",
    snapshot: "Snapshot",
    userMessage:
      "I have a research idea, but it is still too broad. I want to turn it into a clear foundation for my thesis plan.",
    assistantMessage:
      "We can organize your starting point without replacing academic review.",
    responseItems: [
      {
        title: "Clearer topic",
        description: "Delimits scope, population, and initial focus.",
      },
      {
        title: "Analysis axes",
        description: "Organizes variables, concepts, and possible relationships.",
      },
      {
        title: "Reviewable route",
        description: "Declares assumptions and next steps.",
      },
    ],
    suggestedTopics: [
      "AI in academic feedback",
      "Work climate and performance",
      "Risk management in construction",
      "Critical reading in higher education",
    ],
    settings: [
      {
        label: "Output",
        name: "salida",
        options: ["Visual snapshot", "Initial plan", "Reading route"],
      },
      {
        label: "Focus",
        name: "enfoque",
        options: ["Thesis plan", "Article", "Applied project"],
      },
      {
        label: "Sources",
        name: "fuentes",
        options: ["Open and traceable", "Academic base", "No search for now"],
      },
    ],
    ideaPlaceholder: "Write your topic or initial idea...",
    attachLabel: "Attach context",
    searchLabel: "Activate search",
    dictateLabel: "Dictate idea",
    submit: "Sign in",
  },
} satisfies Record<SupportedLanguage, Record<string, unknown>>;

export function getPortalHomeCopy(language: SupportedLanguage) {
  return portalHomeCopy[language];
}

export function getCampaignCopy(language: SupportedLanguage) {
  return campaignCopy[language];
}

export function getChatboxCopy(language: SupportedLanguage) {
  return chatboxCopy[language];
}

export function getPortalVisualCopy(language: SupportedLanguage) {
  return portalVisualCopy[language];
}
