import {
  getProjectTemplateKeyForUniversity,
  type ProjectTemplateKey,
  type ProjectUniversityCode,
} from "@/lib/peru-universities";

export type ProjectPresetDegreeLevel = "MAESTRIA" | "POSGRADO";

export type IntakePreset = {
  id: string;
  projectPresetId: string;
  label: string;
  topic: string;
  problemContext: string;
  researchLine: string;
  academicConstraints: string;
  targetPopulation: string;
  availableData: string;
  preferredMethodology: string;
  advisorNotes: string;
};

export type ProjectPreset = {
  id: string;
  careerId: string;
  careerLabel: string;
  label: string;
  title: string;
  degreeLevel: ProjectPresetDegreeLevel;
  university: ProjectUniversityCode;
  program: string;
  templateKey: ProjectTemplateKey;
  researchLine: string;
  intakePresets: IntakePreset[];
};

export type ProjectCareer = {
  id: string;
  label: string;
  topicCount: number;
};

type TopicDefinition = {
  slug: string;
  label: string;
  title: string;
  researchLine: string;
};

type CareerContext = {
  slug: string;
  label: string;
  topicSuffix: string;
  problemFrame: string;
  targetPopulation: string;
};

type MethodProfile = {
  slug: string;
  label: string;
  preferredMethodology: string;
  availableData: string;
  academicConstraints: string;
  advisorNotes: string;
};

type CareerDefinition = {
  id: string;
  label: string;
  universities: readonly Exclude<ProjectUniversityCode, "OTHER">[];
  programs: Record<ProjectPresetDegreeLevel, string>;
  topics: readonly TopicDefinition[];
  contexts: readonly CareerContext[];
};

const METHOD_PROFILES: readonly MethodProfile[] = [
  {
    slug: "cuantitativo-descriptivo",
    label: "Encuesta descriptiva",
    preferredMethodology:
      "Enfoque cuantitativo no experimental de corte transversal con alcance descriptivo.",
    availableData:
      "Encuestas estructuradas, registros administrativos disponibles y literatura indexada abierta para operacionalizar variables.",
    academicConstraints:
      "Delimitar el estudio a una sola cohorte y evitar inferencias causales porque no existira intervencion experimental.",
    advisorNotes:
      "Definir indicadores observables desde el inicio y mantener consistencia entre objetivos, variables e instrumento.",
  },
  {
    slug: "cuantitativo-correlacional",
    label: "Correlacional aplicado",
    preferredMethodology:
      "Diseno cuantitativo correlacional con validacion de instrumento y analisis inferencial basico.",
    availableData:
      "Encuestas online, bases institucionales anonimizadas y metadatos operativos que permitan contrastar asociaciones entre variables.",
    academicConstraints:
      "No mezclar demasiadas variables dependientes; trabajar con una relacion principal y controles minimos.",
    advisorNotes:
      "Priorizar un modelo parsimonioso y justificar cada dimension teorica con bibliografia reciente y recuperable.",
  },
  {
    slug: "mixto-secuencial",
    label: "Mixto secuencial",
    preferredMethodology:
      "Enfoque mixto secuencial explicativo con una fase cuantitativa breve y entrevistas semiestructuradas para profundizar hallazgos.",
    availableData:
      "Encuestas piloto, entrevistas a informantes clave, documentos institucionales y evidencia secundaria abierta.",
    academicConstraints:
      "Mantener una muestra manejable y usar la fase cualitativa solo para explicar patrones relevantes, no para abrir nuevas preguntas.",
    advisorNotes:
      "Dejar explicito como se integran ambas fases y evitar que el trabajo termine siendo dos estudios desconectados.",
  },
  {
    slug: "cualitativo-aplicado",
    label: "Cualitativo aplicado",
    preferredMethodology:
      "Estudio cualitativo aplicado con entrevistas, revision documental y analisis tematico orientado a mejora.",
    availableData:
      "Entrevistas semiestructuradas, protocolos internos, reportes institucionales y literatura academica open access.",
    academicConstraints:
      "Sostener un alcance acotado a pocos casos comparables y no prometer representatividad estadistica.",
    advisorNotes:
      "Conviene explicitar criterios de seleccion de casos y una ruta clara de codificacion para asegurar trazabilidad.",
  },
] as const;

const CAREER_DEFINITIONS: readonly CareerDefinition[] = [
  {
    id: "administracion",
    label: "Administracion de empresas",
    universities: ["UP", "UPC", "PUCP", "USMP", "UCV"],
    programs: {
      MAESTRIA: "Maestria en Administracion y Direccion de Empresas",
      POSGRADO: "Posgrado en Gestion Empresarial",
    },
    topics: [
      {
        slug: "inteligencia-negocios-mypes",
        label: "Inteligencia de negocios en mypes",
        title:
          "Factores que influyen en la adopcion de tableros de inteligencia de negocios en mypes comerciales peruanas",
        researchLine: "Gestion estrategica y analitica empresarial",
      },
      {
        slug: "liderazgo-equipos-hibridos",
        label: "Liderazgo en equipos hibridos",
        title:
          "Relacion entre liderazgo adaptativo y compromiso laboral en equipos hibridos de empresas de servicios",
        researchLine: "Direccion de personas y cambio organizacional",
      },
      {
        slug: "gestion-procesos-municipal",
        label: "Gestion por procesos municipal",
        title:
          "Madurez de gestion por procesos en municipalidades urbanas y su impacto en la atencion administrativa",
        researchLine: "Gestion publica y mejora de procesos",
      },
      {
        slug: "innovacion-empresas-familiares",
        label: "Innovacion en empresas familiares",
        title:
          "Cultura de innovacion y continuidad estrategica en empresas familiares del sector comercial peruano",
        researchLine: "Innovacion y sostenibilidad empresarial",
      },
      {
        slug: "servicio-interno-clinicas",
        label: "Servicio interno en clinicas",
        title:
          "Clima de servicio interno y coordinacion interareas en clinicas privadas de Lima",
        researchLine: "Calidad de servicio y gestion operativa",
      },
      {
        slug: "decision-cooperativas-ahorro",
        label: "Decision en cooperativas de ahorro",
        title:
          "Uso gerencial de reportes digitales para la toma de decisiones en cooperativas de ahorro y credito",
        researchLine: "Gobierno corporativo y analitica gerencial",
      },
      {
        slug: "gestion-cambio-automatizacion",
        label: "Gestion del cambio en automatizacion",
        title:
          "Factores de gestion del cambio en proyectos de automatizacion administrativa de empresas medianas",
        researchLine: "Transformacion organizacional y productividad",
      },
      {
        slug: "onboarding-digital-retencion",
        label: "Onboarding digital y retencion",
        title:
          "Efectividad del onboarding digital en la retencion temprana de personal administrativo",
        researchLine: "Gestion del talento y experiencia del colaborador",
      },
      {
        slug: "coordinacion-remota-consultoras",
        label: "Coordinacion remota en consultoras",
        title:
          "Coordinacion remota y productividad percibida en equipos de consultoria empresarial",
        researchLine: "Organizacion del trabajo y desempeno",
      },
      {
        slug: "marca-empleadora-exportadoras",
        label: "Marca empleadora en exportadoras",
        title:
          "Practicas de sostenibilidad interna y marca empleadora en empresas exportadoras peruanas",
        researchLine: "Sostenibilidad corporativa y gestion humana",
      },
    ],
    contexts: [
      {
        slug: "lima-servicios",
        label: "Lima servicios",
        topicSuffix: "Delimitado a empresas de servicios de Lima Metropolitana.",
        problemFrame:
          "las organizaciones de servicios muestran brechas para convertir iniciativas de gestion en resultados consistentes y medibles",
        targetPopulation:
          "Jefaturas, coordinadores y analistas administrativos de empresas de servicios ubicadas en Lima Metropolitana.",
      },
      {
        slug: "mypes-norte",
        label: "Mypes del norte",
        topicSuffix: "Enfocado en mypes comerciales de la macroregion norte.",
        problemFrame:
          "las mypes comerciales de la macroregion norte operan con decisiones reactivas y procesos poco estandarizados",
        targetPopulation:
          "Propietarios, administradores y responsables funcionales de mypes comerciales de Piura, Chiclayo y Trujillo.",
      },
      {
        slug: "sector-publico-urbano",
        label: "Sector publico urbano",
        topicSuffix: "Acotado a entidades publicas urbanas con servicios administrativos recurrentes.",
        problemFrame:
          "las entidades publicas urbanas enfrentan rezagos de coordinacion interna, seguimiento y servicio al ciudadano",
        targetPopulation:
          "Funcionarios, especialistas y personal administrativo de entidades publicas urbanas con procesos de atencion recurrente.",
      },
      {
        slug: "empresas-familiares",
        label: "Empresas familiares",
        topicSuffix: "Con foco en empresas familiares de segunda generacion.",
        problemFrame:
          "las empresas familiares de segunda generacion requieren profesionalizar decisiones sin perder continuidad estrategica",
        targetPopulation:
          "Gerentes, mandos medios y sucesores involucrados en la gestion de empresas familiares peruanas.",
      },
      {
        slug: "organizaciones-regionales",
        label: "Organizaciones regionales",
        topicSuffix: "Aplicado a organizaciones medianas de Arequipa y Cusco.",
        problemFrame:
          "las organizaciones regionales medianas necesitan evidencia local para sostener mejoras sin sobredimensionar soluciones corporativas",
        targetPopulation:
          "Responsables de gestion, operaciones o talento de organizaciones medianas ubicadas en Arequipa y Cusco.",
      },
    ],
  },
  {
    id: "ingenieria-industrial",
    label: "Ingenieria industrial",
    universities: ["UNI", "UPC", "PUCP", "ULIMA", "UCV"],
    programs: {
      MAESTRIA: "Maestria en Ingenieria Industrial y Productividad",
      POSGRADO: "Posgrado en Gestion de Operaciones",
    },
    topics: [
      {
        slug: "lean-alimentos",
        label: "Lean en alimentos",
        title:
          "Aplicacion de principios lean para reducir desperdicios en plantas procesadoras de alimentos",
        researchLine: "Mejora continua y productividad operacional",
      },
      {
        slug: "mantenimiento-predictivo-metalmecanica",
        label: "Mantenimiento predictivo metalmecanico",
        title:
          "Factores de adopcion de mantenimiento predictivo en empresas metalmecanicas peruanas",
        researchLine: "Confiabilidad y mantenimiento industrial",
      },
      {
        slug: "trazabilidad-cadena-frio",
        label: "Trazabilidad de cadena de frio",
        title:
          "Trazabilidad operativa en cadenas de frio para distribucion de productos farmaceuticos",
        researchLine: "Logistica y aseguramiento de calidad",
      },
      {
        slug: "seguridad-construccion",
        label: "Cultura de seguridad en construccion",
        title:
          "Relacion entre cultura de seguridad y cumplimiento operativo en proyectos de construccion urbana",
        researchLine: "Seguridad industrial y gestion de riesgos",
      },
      {
        slug: "inventarios-agroindustria",
        label: "Inventarios en agroindustria",
        title:
          "Optimizacion de inventarios de alta rotacion en distribuidoras agroindustriales regionales",
        researchLine: "Planeamiento y control de operaciones",
      },
      {
        slug: "ultima-milla-retail",
        label: "Ultima milla retail",
        title:
          "Factores operativos que afectan la eficiencia de la ultima milla en retail urbano peruano",
        researchLine: "Logistica urbana y nivel de servicio",
      },
      {
        slug: "eficiencia-energetica-textil",
        label: "Eficiencia energetica textil",
        title:
          "Practicas de eficiencia energetica y productividad en plantas textiles medianas",
        researchLine: "Sostenibilidad y gestion de recursos",
      },
      {
        slug: "cuellos-botella-laboratorios",
        label: "Cuellos de botella en laboratorios",
        title:
          "Identificacion de cuellos de botella en laboratorios de diagnostico clinico con alta demanda",
        researchLine: "Analisis de procesos y capacidad",
      },
      {
        slug: "proveedores-hospitales",
        label: "Evaluacion de proveedores en hospitales",
        title:
          "Criterios de evaluacion de proveedores criticos en hospitales de mediana complejidad",
        researchLine: "Abastecimiento y calidad de proveedores",
      },
      {
        slug: "esperas-centros-servicio",
        label: "Esperas en centros de servicio",
        title:
          "Analisis de tiempos de espera y capacidad de atencion en centros publicos de servicio",
        researchLine: "Simulacion y gestion de colas",
      },
    ],
    contexts: [
      {
        slug: "plantas-lima",
        label: "Plantas de Lima",
        topicSuffix: "Aplicado a operaciones industriales y semindustriales de Lima Metropolitana.",
        problemFrame:
          "las operaciones de Lima Metropolitana enfrentan variabilidad, reprocesos y baja trazabilidad para sostener mejoras",
        targetPopulation:
          "Supervisores, jefes de planta, analistas de operaciones y personal de aseguramiento de calidad en Lima Metropolitana.",
      },
      {
        slug: "macroregion-sur",
        label: "Macroregion sur",
        topicSuffix: "En organizaciones productivas de la macroregion sur.",
        problemFrame:
          "las organizaciones productivas del sur necesitan soluciones acotadas para mejorar productividad sin inversiones desproporcionadas",
        targetPopulation:
          "Responsables de operaciones, mantenimiento y seguridad de Arequipa, Moquegua y Tacna.",
      },
      {
        slug: "servicios-salud",
        label: "Servicios de salud",
        topicSuffix: "Delimitado a operaciones de apoyo y servicios de salud.",
        problemFrame:
          "los servicios de salud presentan congestiones y decisiones reactivas que afectan tiempos, calidad y continuidad",
        targetPopulation:
          "Coordinadores operativos, personal logistico y mandos medios de clinicas u hospitales con procesos medibles.",
      },
      {
        slug: "logistica-urbana",
        label: "Logistica urbana",
        topicSuffix: "Con foco en operaciones de distribucion urbana y abastecimiento.",
        problemFrame:
          "la logistica urbana peruana enfrenta restricciones de trafico, coordinacion y visibilidad sobre el flujo real",
        targetPopulation:
          "Coordinadores de distribucion, planificadores de ruta y supervisores de ultima milla en ciudades principales.",
      },
      {
        slug: "organizaciones-regionales",
        label: "Organizaciones regionales",
        topicSuffix: "En empresas medianas regionales con procesos repetitivos.",
        problemFrame:
          "las empresas medianas regionales requieren diagnosticos aplicados para mejorar procesos repetitivos con evidencia propia",
        targetPopulation:
          "Jefaturas de operaciones y mejora continua de organizaciones medianas en Trujillo, Huancayo y Chiclayo.",
      },
    ],
  },
  {
    id: "ingenieria-sistemas",
    label: "Ingenieria de sistemas",
    universities: ["UNI", "UPC", "PUCP", "USMP", "UCV"],
    programs: {
      MAESTRIA: "Maestria en Ingenieria de Sistemas y Transformacion Digital",
      POSGRADO: "Posgrado en Tecnologia e Innovacion",
    },
    topics: [
      {
        slug: "ciberseguridad-pymes",
        label: "Ciberseguridad en pymes",
        title:
          "Madurez de practicas de ciberseguridad en pymes del sector servicios peruano",
        researchLine: "Gobierno TI y gestion de riesgos",
      },
      {
        slug: "ia-generativa-administracion",
        label: "IA generativa administrativa",
        title:
          "Percepcion del valor de la IA generativa en tareas administrativas de empresas medianas",
        researchLine: "Productividad digital e innovacion aplicada",
      },
      {
        slug: "usabilidad-erp",
        label: "Usabilidad de ERP",
        title:
          "Usabilidad percibida de sistemas ERP y continuidad de uso en empresas manufactureras",
        researchLine: "Sistemas empresariales y experiencia de usuario",
      },
      {
        slug: "gobierno-datos-universidades",
        label: "Gobierno de datos universitario",
        title:
          "Factores de implementacion de practicas de gobierno de datos en universidades privadas peruanas",
        researchLine: "Arquitectura de datos y gestion de informacion",
      },
      {
        slug: "analitica-crm-seguros",
        label: "Analitica CRM en seguros",
        title:
          "Uso de analitica CRM para mejorar seguimiento comercial en empresas de seguros",
        researchLine: "Analitica de clientes y sistemas de informacion",
      },
      {
        slug: "migracion-nube-cooperativas",
        label: "Migracion a nube en cooperativas",
        title:
          "Riesgos percibidos y capacidades requeridas para migracion a la nube en cooperativas financieras",
        researchLine: "Infraestructura digital y gestion del cambio TI",
      },
      {
        slug: "satisfaccion-service-desk",
        label: "Satisfaccion con service desk",
        title:
          "Factores de satisfaccion con mesas de ayuda TI en entidades publicas urbanas",
        researchLine: "Gestion de servicios TI",
      },
      {
        slug: "calidad-software-fintech",
        label: "Calidad de software en fintech",
        title:
          "Practicas de aseguramiento de calidad de software en fintech peruanas en crecimiento",
        researchLine: "Ingenieria de software y calidad",
      },
      {
        slug: "interoperabilidad-municipal",
        label: "Interoperabilidad municipal",
        title:
          "Barreras de interoperabilidad en tramites digitales de municipalidades peruanas",
        researchLine: "Transformacion digital publica",
      },
      {
        slug: "confianza-identidad-digital",
        label: "Confianza en identidad digital",
        title:
          "Factores de confianza en mecanismos de identidad digital para portales ciudadanos",
        researchLine: "Seguridad digital y experiencia ciudadana",
      },
    ],
    contexts: [
      {
        slug: "empresas-lima",
        label: "Empresas de Lima",
        topicSuffix: "Delimitado a organizaciones privadas de Lima Metropolitana.",
        problemFrame:
          "las organizaciones privadas de Lima implementan tecnologia con rapidez, pero no siempre cuentan con practicas formales para sostener valor y control",
        targetPopulation:
          "Responsables TI, analistas funcionales, usuarios lideres y jefaturas de organizaciones privadas de Lima Metropolitana.",
      },
      {
        slug: "sector-publico",
        label: "Sector publico",
        topicSuffix: "Con foco en entidades publicas urbanas y tramites digitales.",
        problemFrame:
          "las entidades publicas urbanas enfrentan brechas de interoperabilidad, servicio y adopcion interna en sus iniciativas digitales",
        targetPopulation:
          "Especialistas TIC, personal administrativo y usuarios internos de entidades publicas urbanas con servicios digitalizados.",
      },
      {
        slug: "pymes-regionales",
        label: "Pymes regionales",
        topicSuffix: "Aplicado a pymes y organizaciones medianas de regiones.",
        problemFrame:
          "las pymes regionales necesitan soluciones digitales viables, pero enfrentan limitaciones de capacidades y gobierno de tecnologia",
        targetPopulation:
          "Propietarios, administradores y responsables TI de pymes o empresas medianas de regiones peruanas.",
      },
      {
        slug: "educacion-superior",
        label: "Educacion superior",
        topicSuffix: "Acotado a instituciones de educacion superior con procesos de informacion.",
        problemFrame:
          "las instituciones de educacion superior requieren ordenar datos, servicios y experiencia de usuario sin sobredimensionar infraestructura",
        targetPopulation:
          "Directivos, coordinadores academicos y personal TIC de universidades o escuelas de posgrado peruanas.",
      },
      {
        slug: "servicios-financieros",
        label: "Servicios financieros",
        topicSuffix: "En organizaciones de servicios financieros y fintech locales.",
        problemFrame:
          "los servicios financieros digitales combinan exigencias de confianza, velocidad y control que tensionan su operacion diaria",
        targetPopulation:
          "Analistas de negocio, responsables de producto y equipos TI de servicios financieros o fintech en Peru.",
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    universities: ["UP", "UPC", "ULIMA", "USMP", "UCV"],
    programs: {
      MAESTRIA: "Maestria en Marketing y Gestion Comercial",
      POSGRADO: "Posgrado en Marketing Digital",
    },
    topics: [
      {
        slug: "omnicanal-retail",
        label: "Experiencia omnicanal retail",
        title:
          "Experiencia omnicanal y su relacion con la intencion de recompra en retail peruano",
        researchLine: "Experiencia del cliente y comportamiento digital",
      },
      {
        slug: "influencers-cosmetica",
        label: "Confianza en influencers",
        title:
          "Credibilidad de influencers y confianza de compra en marcas de cosmetica digital",
        researchLine: "Comunicacion digital y decision de compra",
      },
      {
        slug: "personalizacion-edtech",
        label: "Personalizacion en edtech",
        title:
          "Personalizacion de contenidos y satisfaccion de usuarios en plataformas edtech peruanas",
        researchLine: "Analitica de marketing y personalizacion",
      },
      {
        slug: "reputacion-hoteles",
        label: "Reputacion digital hotelera",
        title:
          "Influencia de la reputacion digital en la decision de compra de hoteles urbanos",
        researchLine: "Marketing de servicios y reputacion online",
      },
      {
        slug: "sostenibilidad-supermercados",
        label: "Sostenibilidad en supermercados",
        title:
          "Sostenibilidad percibida y preferencia de compra en cadenas de supermercados del Peru",
        researchLine: "Consumo responsable y branding",
      },
      {
        slug: "fidelizacion-food-delivery",
        label: "Fidelizacion en food delivery",
        title:
          "Experiencia de servicio y fidelizacion en aplicaciones de entrega de alimentos",
        researchLine: "Fidelizacion y experiencia digital",
      },
      {
        slug: "social-commerce-emprendedores",
        label: "Social commerce emprendedor",
        title:
          "Factores de adopcion de social commerce en emprendedores que venden por redes sociales",
        researchLine: "Canales digitales y ventas",
      },
      {
        slug: "estimulos-banca-landing",
        label: "Landing pages bancarias",
        title:
          "Elementos de persuasion digital en landing pages bancarias y su efecto en conversion declarada",
        researchLine: "Comportamiento del consumidor digital",
      },
      {
        slug: "propuesta-telemedicina",
        label: "Valor en telemedicina",
        title:
          "Propuesta de valor percibida y confianza de usuarios en servicios de telemedicina",
        researchLine: "Marketing de servicios de salud",
      },
      {
        slug: "marketing-relacional-logistica",
        label: "Marketing relacional B2B",
        title:
          "Practicas de marketing relacional B2B en operadores logisticos peruanos",
        researchLine: "Relacion cliente empresa y lealtad B2B",
      },
    ],
    contexts: [
      {
        slug: "consumidor-lima",
        label: "Consumidor de Lima",
        topicSuffix: "Delimitado a consumidores urbanos de Lima Metropolitana.",
        problemFrame:
          "las marcas que operan en Lima Metropolitana enfrentan audiencias saturadas y decisiones cada vez mas mediadas por experiencias digitales",
        targetPopulation:
          "Consumidores mayores de edad que interactuan con marcas, plataformas o servicios digitales en Lima Metropolitana.",
      },
      {
        slug: "marcas-regionales",
        label: "Marcas regionales",
        topicSuffix: "Aplicado a marcas o servicios con presencia en regiones del Peru.",
        problemFrame:
          "las marcas regionales necesitan evidencia sobre reputacion, confianza y experiencia para sostener conversion y recompra",
        targetPopulation:
          "Clientes o usuarios de marcas regionales presentes en Arequipa, Trujillo, Chiclayo o Piura.",
      },
      {
        slug: "servicios-digitales",
        label: "Servicios digitales",
        topicSuffix: "Con foco en plataformas y servicios que operan principalmente por canales digitales.",
        problemFrame:
          "los servicios digitales crecen rapido, pero muchas decisiones comerciales se toman sin suficiente claridad sobre factores de confianza y uso repetido",
        targetPopulation:
          "Usuarios activos de plataformas o aplicaciones digitales peruanas con al menos una experiencia reciente de uso o compra.",
      },
      {
        slug: "b2b-servicios",
        label: "Mercado B2B",
        topicSuffix: "Acotado a relaciones comerciales entre empresas de servicios.",
        problemFrame:
          "las relaciones B2B requieren entender mejor como se construye valor y confianza en contextos de venta consultiva",
        targetPopulation:
          "Tomadores de decision, ejecutivos comerciales y clientes corporativos de empresas de servicios B2B.",
      },
      {
        slug: "sectores-regulados",
        label: "Sectores regulados",
        topicSuffix: "En sectores donde confianza y reputacion son decisivas para la compra.",
        problemFrame:
          "en sectores regulados, la confianza digital y la claridad de la propuesta de valor condicionan fuertemente la decision del usuario",
        targetPopulation:
          "Usuarios y potenciales clientes de servicios financieros, salud o educacion digital en Peru.",
      },
    ],
  },
  {
    id: "psicologia",
    label: "Psicologia",
    universities: ["PUCP", "UPCH", "ULIMA", "USMP", "UCV"],
    programs: {
      MAESTRIA: "Maestria en Psicologia Organizacional",
      POSGRADO: "Posgrado en Psicologia Aplicada",
    },
    topics: [
      {
        slug: "burnout-posgrado",
        label: "Burnout en posgrado",
        title:
          "Relacion entre sobrecarga digital y burnout academico en estudiantes de posgrado",
        researchLine: "Salud mental y bienestar en contextos educativos",
      },
      {
        slug: "salario-emocional-call-center",
        label: "Salario emocional",
        title:
          "Salario emocional y compromiso laboral en colaboradores de centros de contacto",
        researchLine: "Psicologia organizacional y motivacion",
      },
      {
        slug: "seguridad-psicologica-agiles",
        label: "Seguridad psicologica en agiles",
        title:
          "Seguridad psicologica y colaboracion en equipos agiles de empresas tecnologicas",
        researchLine: "Clima laboral y trabajo en equipo",
      },
      {
        slug: "engagement-enfermeria",
        label: "Engagement en enfermeria",
        title:
          "Work engagement y percepcion de apoyo organizacional en personal de enfermeria",
        researchLine: "Bienestar ocupacional en salud",
      },
      {
        slug: "procrastinacion-maestria-virtual",
        label: "Procrastinacion en maestria virtual",
        title:
          "Procrastinacion academica y autorregulacion en maestrandos de programas virtuales",
        researchLine: "Aprendizaje adulto y autorregulacion",
      },
      {
        slug: "justicia-organizacional-colegios",
        label: "Justicia organizacional escolar",
        title:
          "Justicia organizacional percibida y satisfaccion laboral en colegios privados",
        researchLine: "Clima y percepciones organizacionales",
      },
      {
        slug: "bienestar-digital-docentes",
        label: "Bienestar digital docente",
        title:
          "Bienestar digital y fatiga tecnologica en docentes con modalidad remota o hibrida",
        researchLine: "Psicologia de la salud ocupacional",
      },
      {
        slug: "resiliencia-empresas-familiares",
        label: "Resiliencia gerencial",
        title:
          "Resiliencia y afrontamiento en directivos de empresas familiares peruanas",
        researchLine: "Recursos psicologicos para el liderazgo",
      },
      {
        slug: "liderazgo-motivacion-municipal",
        label: "Liderazgo y motivacion municipal",
        title:
          "Estilo de liderazgo y motivacion laboral en personal administrativo municipal",
        researchLine: "Liderazgo y conducta organizacional",
      },
      {
        slug: "ansiedad-adaptacion-posgrado",
        label: "Ansiedad de adaptacion en posgrado",
        title:
          "Ansiedad de adaptacion y sentido de autoeficacia en estudiantes que inician posgrado",
        researchLine: "Transiciones academicas y bienestar",
      },
    ],
    contexts: [
      {
        slug: "organizaciones-servicios",
        label: "Organizaciones de servicios",
        topicSuffix: "Aplicado a organizaciones de servicios con alta interaccion humana.",
        problemFrame:
          "las organizaciones de servicios enfrentan exigencias emocionales y de coordinacion que pueden afectar bienestar, motivacion y permanencia",
        targetPopulation:
          "Colaboradores, mandos medios y lideres de organizaciones de servicios con actividades intensivas en interaccion humana.",
      },
      {
        slug: "educacion-superior",
        label: "Educacion superior",
        topicSuffix: "Delimitado a programas universitarios o de posgrado.",
        problemFrame:
          "en educacion superior se observan tensiones entre exigencia academica, uso intensivo de tecnologia y salud mental",
        targetPopulation:
          "Estudiantes, docentes o coordinadores de programas universitarios y de posgrado en el Peru.",
      },
      {
        slug: "sector-salud",
        label: "Sector salud",
        topicSuffix: "Con foco en personal de instituciones de salud.",
        problemFrame:
          "el sector salud combina demandas operativas y emocionales que hacen visible la necesidad de medir recursos psicologicos y apoyo organizacional",
        targetPopulation:
          "Personal de salud, coordinadores asistenciales y jefaturas de instituciones publicas o privadas de salud.",
      },
      {
        slug: "sector-publico",
        label: "Sector publico",
        topicSuffix: "Acotado a organizaciones publicas urbanas.",
        problemFrame:
          "el sector publico urbano requiere evidencia aplicada sobre liderazgo, motivacion y clima para sostener mejoras de gestion",
        targetPopulation:
          "Personal administrativo, profesionales y jefaturas de entidades publicas urbanas del Peru.",
      },
      {
        slug: "empresas-familiares",
        label: "Empresas familiares",
        topicSuffix: "En directivos y equipos de empresas familiares peruanas.",
        problemFrame:
          "las empresas familiares exigen procesos de adaptacion y afrontamiento ante cambios generacionales y operativos",
        targetPopulation:
          "Directivos, mandos medios y colaboradores clave de empresas familiares peruanas.",
      },
    ],
  },
  {
    id: "educacion",
    label: "Educacion",
    universities: ["PUCP", "UPC", "UNMSM", "USMP", "UCV"],
    programs: {
      MAESTRIA: "Maestria en Educacion y Docencia",
      POSGRADO: "Posgrado en Innovacion Educativa",
    },
    topics: [
      {
        slug: "feedback-competencias-investigativas",
        label: "Feedback y competencias investigativas",
        title:
          "Retroalimentacion digital y desarrollo de competencias investigativas en maestrandos",
        researchLine: "Aprendizaje superior y evaluacion formativa",
      },
      {
        slug: "gamificacion-posgrado",
        label: "Gamificacion en posgrado",
        title:
          "Percepcion de utilidad de estrategias de gamificacion en cursos virtuales de posgrado",
        researchLine: "Innovacion pedagogica y engagement",
      },
      {
        slug: "engagement-lms-salud",
        label: "Engagement en LMS de salud",
        title:
          "Factores de engagement en plataformas LMS de programas de especializacion en salud",
        researchLine: "Tecnologia educativa y experiencia del estudiante",
      },
      {
        slug: "evaluacion-formativa-hibrida",
        label: "Evaluacion formativa hibrida",
        title:
          "Practicas de evaluacion formativa en programas de aprendizaje hibrido para adultos",
        researchLine: "Didactica y evaluacion autentica",
      },
      {
        slug: "tutoria-avance-tesis",
        label: "Tutoria y avance de tesis",
        title:
          "Acompanamiento tutorial y avance percibido de tesis en programas de maestria",
        researchLine: "Acompanamiento academico y permanencia",
      },
      {
        slug: "asistentes-ia-aprendizaje",
        label: "Asistentes de IA y aprendizaje",
        title:
          "Uso de asistentes de IA y autorregulacion del aprendizaje en educacion continua",
        researchLine: "Aprendizaje autonomo y tecnologia emergente",
      },
      {
        slug: "microlearning-capacitacion",
        label: "Microlearning corporativo",
        title:
          "Microlearning y transferencia al puesto en programas de capacitacion corporativa",
        researchLine: "Formacion continua y aprendizaje aplicado",
      },
      {
        slug: "accesibilidad-universitaria",
        label: "Accesibilidad digital universitaria",
        title:
          "Accesibilidad digital en entornos universitarios y experiencia academica del estudiante",
        researchLine: "Inclusion educativa y diseno instruccional",
      },
      {
        slug: "competencias-docentes-flipped",
        label: "Competencias docentes flipped",
        title:
          "Competencias docentes para implementar aula invertida en programas de posgrado",
        researchLine: "Desarrollo docente e innovacion metodologica",
      },
      {
        slug: "integridad-academica-citacion",
        label: "Integridad academica y citacion",
        title:
          "Cultura de integridad academica y practicas de citacion en estudiantes de maestria",
        researchLine: "Etica academica y alfabetizacion informacional",
      },
    ],
    contexts: [
      {
        slug: "universidades-lima",
        label: "Universidades de Lima",
        topicSuffix: "Delimitado a universidades y escuelas de posgrado de Lima Metropolitana.",
        problemFrame:
          "las instituciones de Lima Metropolitana necesitan evidencia aplicada para mejorar experiencia de aprendizaje, retroalimentacion y acompanamiento",
        targetPopulation:
          "Estudiantes, docentes y coordinadores de universidades o escuelas de posgrado de Lima Metropolitana.",
      },
      {
        slug: "programas-virtuales",
        label: "Programas virtuales",
        topicSuffix: "Con foco en programas virtuales o semivirtuales para adultos.",
        problemFrame:
          "los programas virtuales para adultos enfrentan retos de engagement, acompanamiento y continuidad que deben delimitarse con claridad",
        targetPopulation:
          "Participantes, docentes y gestores de programas virtuales o semivirtuales para adultos en el Peru.",
      },
      {
        slug: "capacitacion-corporativa",
        label: "Capacitacion corporativa",
        topicSuffix: "Acotado a formacion continua y capacitacion dentro de organizaciones.",
        problemFrame:
          "la capacitacion corporativa requiere demostrar utilidad y transferencia real sin convertir el estudio en evaluacion integral de talento",
        targetPopulation:
          "Colaboradores, formadores internos y responsables de aprendizaje de organizaciones peruanas.",
      },
      {
        slug: "educacion-superior-regional",
        label: "Educacion superior regional",
        topicSuffix: "Aplicado a instituciones de educacion superior fuera de Lima.",
        problemFrame:
          "las instituciones regionales necesitan evidencia localizada para adaptar innovaciones educativas a sus propias condiciones",
        targetPopulation:
          "Estudiantes, docentes y coordinadores de instituciones de educacion superior de regiones del Peru.",
      },
      {
        slug: "tesis-posgrado",
        label: "Proceso de tesis",
        topicSuffix: "Con foco en cursos, talleres o acompanamiento de tesis.",
        problemFrame:
          "el proceso de tesis suele combinar incertidumbre metodologica, carga laboral y demandas institucionales que afectan el avance sostenido",
        targetPopulation:
          "Estudiantes de maestria, asesores y coordinadores vinculados al proceso de tesis en programas de posgrado.",
      },
    ],
  },
  {
    id: "contabilidad-finanzas",
    label: "Contabilidad y finanzas",
    universities: ["UP", "UPC", "UNMSM", "USMP", "UCV"],
    programs: {
      MAESTRIA: "Maestria en Finanzas y Control Gerencial",
      POSGRADO: "Posgrado en Contabilidad y Gestion Financiera",
    },
    topics: [
      {
        slug: "alfabetizacion-ahorro-digital",
        label: "Ahorro digital y alfabetizacion financiera",
        title:
          "Alfabetizacion financiera y uso de herramientas de ahorro digital en profesionales jovenes",
        researchLine: "Finanzas personales y comportamiento financiero",
      },
      {
        slug: "control-interno-ong",
        label: "Control interno en ONG",
        title:
          "Madurez de control interno y rendicion de cuentas en organizaciones sin fines de lucro",
        researchLine: "Control, auditoria y transparencia",
      },
      {
        slug: "facturacion-electronica-analitica",
        label: "Analitica de facturacion electronica",
        title:
          "Uso de informacion de facturacion electronica para la gestion comercial de pymes",
        researchLine: "Analitica financiera y decisiones gerenciales",
      },
      {
        slug: "riesgo-cooperativas",
        label: "Riesgo crediticio en cooperativas",
        title:
          "Criterios de evaluacion de riesgo crediticio en cooperativas de ahorro y credito",
        researchLine: "Gestion de riesgos financieros",
      },
      {
        slug: "costos-clinicas",
        label: "Gestion de costos en clinicas",
        title:
          "Gestion de costos y eficiencia operativa en clinicas privadas de mediana escala",
        researchLine: "Costos gerenciales y eficiencia",
      },
      {
        slug: "esg-exportadoras",
        label: "Preparacion de reportes ESG",
        title:
          "Preparacion para reportes ESG en empresas exportadoras peruanas de mediana escala",
        researchLine: "Finanzas sostenibles y cumplimiento",
      },
      {
        slug: "cumplimiento-tributario-servicios",
        label: "Cumplimiento tributario en servicios",
        title:
          "Percepcion de cumplimiento tributario y controles internos en firmas de servicios profesionales",
        researchLine: "Tributacion aplicada y control",
      },
      {
        slug: "capital-trabajo-distribuidoras",
        label: "Capital de trabajo en distribuidoras",
        title:
          "Capital de trabajo y rentabilidad operativa en distribuidoras comerciales peruanas",
        researchLine: "Gestion financiera empresarial",
      },
      {
        slug: "presupuesto-fintech-freelancers",
        label: "Fintech para freelancers",
        title:
          "Uso de herramientas fintech de presupuesto y control de gastos en trabajadores independientes",
        researchLine: "Tecnologia financiera y finanzas personales",
      },
      {
        slug: "controles-forenses-municipal",
        label: "Controles forenses municipales",
        title:
          "Controles preventivos de fraude y trazabilidad documental en municipalidades provinciales",
        researchLine: "Auditoria forense y sector publico",
      },
    ],
    contexts: [
      {
        slug: "empresas-privadas",
        label: "Empresas privadas",
        topicSuffix: "Delimitado a empresas privadas con procesos financieros formales.",
        problemFrame:
          "las empresas privadas requieren decisiones financieras mas oportunas, pero no siempre integran control, analitica y disciplina operativa",
        targetPopulation:
          "Responsables financieros, contables, auditores internos y gerentes de empresas privadas peruanas.",
      },
      {
        slug: "cooperativas-fintech",
        label: "Cooperativas y fintech",
        topicSuffix: "Con foco en cooperativas, cajas o soluciones fintech locales.",
        problemFrame:
          "las organizaciones financieras locales combinan exigencias de control, confianza y velocidad en un contexto de digitalizacion creciente",
        targetPopulation:
          "Analistas financieros, responsables de riesgo y usuarios de servicios financieros locales en el Peru.",
      },
      {
        slug: "sector-salud",
        label: "Sector salud",
        topicSuffix: "Acotado a organizaciones de salud con procesos administrativos medibles.",
        problemFrame:
          "las organizaciones de salud necesitan visibilidad sobre costos, control y eficiencia para sostener decisiones gerenciales",
        targetPopulation:
          "Gerencias administrativas, responsables de costos y personal contable de organizaciones de salud peruanas.",
      },
      {
        slug: "sector-publico",
        label: "Sector publico",
        topicSuffix: "Aplicado a entidades publicas con trazabilidad documental.",
        problemFrame:
          "el sector publico requiere fortalecer control y rendicion de cuentas con herramientas concretas y alcance razonable",
        targetPopulation:
          "Especialistas administrativos, auditores y responsables de control interno de entidades publicas peruanas.",
      },
      {
        slug: "mypes-profesionales",
        label: "Mypes y profesionales",
        topicSuffix: "En mypes, despachos y trabajadores independientes.",
        problemFrame:
          "las mypes y profesionales independientes suelen gestionar finanzas con baja estandarizacion y poco aprovechamiento de herramientas digitales",
        targetPopulation:
          "Propietarios, contadores externos y trabajadores independientes que gestionan finanzas de pequena escala en el Peru.",
      },
    ],
  },
  {
    id: "salud-publica",
    label: "Salud publica y gestion en salud",
    universities: ["UPCH", "PUCP", "UNMSM", "UPC", "UCV"],
    programs: {
      MAESTRIA: "Maestria en Gestion de Servicios de Salud",
      POSGRADO: "Posgrado en Salud Publica",
    },
    topics: [
      {
        slug: "programacion-citas",
        label: "Programacion de citas",
        title:
          "Programacion digital de citas y continuidad de atencion en consultorios ambulatorios",
        researchLine: "Gestion de servicios de salud y acceso",
      },
      {
        slug: "recordatorios-adherencia",
        label: "Recordatorios y adherencia",
        title:
          "Uso de recordatorios digitales y adherencia al tratamiento en pacientes cronicos",
        researchLine: "Salud digital y seguimiento del paciente",
      },
      {
        slug: "teleorientacion-satisfaccion",
        label: "Satisfaccion en teleorientacion",
        title:
          "Factores de satisfaccion en servicios de teleorientacion para pacientes urbanos",
        researchLine: "Experiencia del paciente y canales digitales",
      },
      {
        slug: "logistica-medicamentos",
        label: "Logistica de medicamentos",
        title:
          "Trazabilidad de abastecimiento de medicamentos en redes de salud de mediana escala",
        researchLine: "Logistica sanitaria y abastecimiento",
      },
      {
        slug: "bienestar-personal-primaria",
        label: "Bienestar en atencion primaria",
        title:
          "Bienestar laboral y carga operativa en personal de atencion primaria",
        researchLine: "Gestion del talento en salud",
      },
      {
        slug: "triaje-calidad",
        label: "Calidad del triaje",
        title:
          "Percepcion de calidad del triaje y tiempos de atencion en servicios de emergencia",
        researchLine: "Calidad asistencial y gestion de demanda",
      },
      {
        slug: "dashboards-redes-salud",
        label: "Dashboards en redes de salud",
        title:
          "Uso gerencial de tableros de salud para seguimiento de indicadores en redes regionales",
        researchLine: "Analitica para decision en salud",
      },
      {
        slug: "seguimiento-materno",
        label: "Seguimiento materno",
        title:
          "Seguimiento digital de gestantes y continuidad de controles en centros publicos",
        researchLine: "Salud materna y gestion territorial",
      },
      {
        slug: "esperas-imagenes",
        label: "Esperas en diagnostico por imagenes",
        title:
          "Factores operativos asociados a tiempos de espera en servicios de diagnostico por imagenes",
        researchLine: "Capacidad instalada y flujo asistencial",
      },
      {
        slug: "comunicacion-preventiva",
        label: "Comunicacion preventiva",
        title:
          "Efectividad percibida de mensajes digitales en campanas preventivas de salud urbana",
        researchLine: "Promocion de la salud y comunicacion",
      },
    ],
    contexts: [
      {
        slug: "clinicas-lima",
        label: "Clinicas de Lima",
        topicSuffix: "Delimitado a clinicas y consultorios privados de Lima Metropolitana.",
        problemFrame:
          "los servicios privados de salud combinan expectativas altas de experiencia con restricciones operativas y de seguimiento",
        targetPopulation:
          "Pacientes adultos, personal asistencial y responsables administrativos de clinicas o consultorios privados de Lima Metropolitana.",
      },
      {
        slug: "redes-publicas",
        label: "Redes publicas",
        topicSuffix: "Aplicado a redes y establecimientos publicos de salud.",
        problemFrame:
          "las redes publicas requieren soluciones de gestion y seguimiento que mejoren acceso sin sobrepasar capacidades reales",
        targetPopulation:
          "Personal asistencial, gestores y usuarios de redes o establecimientos publicos de salud del Peru.",
      },
      {
        slug: "salud-digital",
        label: "Salud digital",
        topicSuffix: "Con foco en canales digitales de atencion o seguimiento.",
        problemFrame:
          "las soluciones de salud digital prometen continuidad y cercania, pero su uso efectivo depende de confianza, usabilidad y capacidad de respuesta",
        targetPopulation:
          "Usuarios y gestores de servicios de salud que incorporan canales digitales en seguimiento o atencion.",
      },
      {
        slug: "servicios-diagnosticos",
        label: "Servicios diagnosticos",
        topicSuffix: "Acotado a servicios diagnosticos con alta demanda.",
        problemFrame:
          "los servicios diagnosticos operan con demanda concentrada y requieren visibilidad sobre flujo, espera y coordinacion",
        targetPopulation:
          "Personal tecnico, coordinadores y usuarios de servicios diagnosticos de mediana o alta demanda.",
      },
      {
        slug: "programas-preventivos",
        label: "Programas preventivos",
        topicSuffix: "Aplicado a programas y campanas preventivas de salud.",
        problemFrame:
          "las acciones preventivas dependen de seguimiento sostenido y mensajes oportunos para lograr continuidad en la participacion",
        targetPopulation:
          "Usuarios, promotores y responsables de programas preventivos en contextos urbanos peruanos.",
      },
    ],
  },
  {
    id: "derecho",
    label: "Derecho",
    universities: ["PUCP", "UNMSM", "UP", "ULIMA", "USMP"],
    programs: {
      MAESTRIA: "Maestria en Derecho Empresarial y Regulatorio",
      POSGRADO: "Posgrado en Derecho Aplicado",
    },
    topics: [
      {
        slug: "compliance-medianas",
        label: "Compliance en empresas medianas",
        title:
          "Cultura de compliance y gestion preventiva de riesgos en empresas medianas peruanas",
        researchLine: "Cumplimiento corporativo y gobierno",
      },
      {
        slug: "mediacion-consumo-digital",
        label: "Mediacion digital en consumo",
        title:
          "Uso de mecanismos de mediacion digital en controversias de consumo de bajo monto",
        researchLine: "Resolucion alternativa de conflictos",
      },
      {
        slug: "datos-personales-universidades",
        label: "Datos personales en universidades",
        title:
          "Cumplimiento de proteccion de datos personales en universidades privadas peruanas",
        researchLine: "Derecho digital y privacidad",
      },
      {
        slug: "debido-proceso-municipal",
        label: "Debido proceso municipal",
        title:
          "Garantias de debido proceso en procedimientos sancionadores de municipalidades urbanas",
        researchLine: "Derecho administrativo sancionador",
      },
      {
        slug: "transparencia-informacion-publica",
        label: "Transparencia y acceso",
        title:
          "Transparencia activa y acceso a informacion publica en entidades locales peruanas",
        researchLine: "Gestion publica y transparencia",
      },
      {
        slug: "riesgo-contractual-salud",
        label: "Riesgo contractual en salud",
        title:
          "Riesgos contractuales en la tercerizacion de servicios de salud privada",
        researchLine: "Derecho contractual y regulacion sectorial",
      },
      {
        slug: "evidencia-ciberdelitos",
        label: "Evidencia en ciberdelitos",
        title:
          "Trazabilidad de evidencia digital en denuncias vinculadas con ciberdelitos",
        researchLine: "Derecho penal tecnologico",
      },
      {
        slug: "rutas-violencia-universidades",
        label: "Rutas de denuncia universitarias",
        title:
          "Rutas institucionales de denuncia frente a violencia de genero en universidades peruanas",
        researchLine: "Proteccion de derechos y protocolos institucionales",
      },
      {
        slug: "arbitraje-proveedores-pyme",
        label: "Arbitraje en contratos pyme",
        title:
          "Clausulas arbitrales y gestion de controversias en contratos de suministro para pymes",
        researchLine: "Derecho comercial y contratacion",
      },
      {
        slug: "gobierno-etico-colegios",
        label: "Gobierno etico gremial",
        title:
          "Practicas de gobierno etico y control interno en colegios profesionales",
        researchLine: "Gobernanza institucional y etica",
      },
    ],
    contexts: [
      {
        slug: "empresa-privada",
        label: "Empresa privada",
        topicSuffix: "Delimitado a empresas privadas con procesos formales de cumplimiento o contratacion.",
        problemFrame:
          "las empresas privadas necesitan traducir obligaciones regulatorias en practicas operativas y evidencia de cumplimiento",
        targetPopulation:
          "Abogados internos, responsables de cumplimiento, gerentes administrativos y asesores corporativos de empresas privadas.",
      },
      {
        slug: "sector-publico",
        label: "Sector publico",
        topicSuffix: "Aplicado a entidades publicas y gobiernos locales.",
        problemFrame:
          "el sector publico urbano requiere revisar practicas administrativas y garantias procedimentales con enfoque aplicable",
        targetPopulation:
          "Funcionarios, asesores legales y administradores vinculados a procedimientos o transparencia en entidades publicas.",
      },
      {
        slug: "educacion-superior",
        label: "Educacion superior",
        topicSuffix: "Con foco en universidades y organizaciones educativas.",
        problemFrame:
          "las organizaciones educativas combinan exigencias de proteccion de derechos, privacidad y protocolos institucionales cada vez mas visibles",
        targetPopulation:
          "Asesores legales, autoridades universitarias, personal administrativo y usuarios de instituciones educativas superiores.",
      },
      {
        slug: "servicios-regulados",
        label: "Servicios regulados",
        topicSuffix: "Acotado a sectores con regulacion y alta sensibilidad contractual.",
        problemFrame:
          "los servicios regulados requieren diagnosticos juridicos acotados para reducir riesgos sin alejarse del funcionamiento real de la organizacion",
        targetPopulation:
          "Responsables contractuales, proveedores y asesores legales de sectores regulados en el Peru.",
      },
      {
        slug: "ciudadania-digital",
        label: "Ciudadania digital",
        topicSuffix: "Aplicado a interacciones ciudadanas y canales digitales.",
        problemFrame:
          "las interacciones digitales han ampliado la necesidad de trazabilidad, proteccion de datos y mecanismos de respuesta oportunos",
        targetPopulation:
          "Ciudadanos usuarios, asesores legales y operadores de canales digitales con impacto juridico o administrativo.",
      },
    ],
  },
  {
    id: "arquitectura-urbanismo",
    label: "Arquitectura y urbanismo",
    universities: ["PUCP", "UNI", "ULIMA", "UPC", "UCV"],
    programs: {
      MAESTRIA: "Maestria en Arquitectura y Gestion del Entorno Urbano",
      POSGRADO: "Posgrado en Urbanismo y Diseno Espacial",
    },
    topics: [
      {
        slug: "caminabilidad-centros-distritales",
        label: "Caminabilidad distrital",
        title:
          "Caminabilidad y activacion comercial en centros distritales de Lima Metropolitana",
        researchLine: "Movilidad urbana y espacio publico",
      },
      {
        slug: "confort-termico-vivienda-social",
        label: "Confort termico en vivienda social",
        title:
          "Confort termico percibido en conjuntos de vivienda social de clima templado seco",
        researchLine: "Habitabilidad y sostenibilidad arquitectonica",
      },
      {
        slug: "espacio-publico-bordes",
        label: "Espacio publico en bordes urbanos",
        title:
          "Percepcion de uso y seguridad en espacios publicos de bordes urbanos metropolitanos",
        researchLine: "Espacio publico y cohesion urbana",
      },
      {
        slug: "accesibilidad-centros-salud",
        label: "Accesibilidad en centros de salud",
        title:
          "Accesibilidad universal en centros de salud de atencion ambulatoria",
        researchLine: "Diseno inclusivo y equipamiento publico",
      },
      {
        slug: "urbanismo-tactico",
        label: "Urbanismo tactico",
        title:
          "Urbanismo tactico y apropiacion ciudadana en intervenciones barriales de bajo costo",
        researchLine: "Participacion ciudadana y regeneracion urbana",
      },
      {
        slug: "materiales-sostenibles-escuelas",
        label: "Materiales sostenibles en escuelas",
        title:
          "Uso de materiales sostenibles en proyectos de infraestructura educativa de escala barrial",
        researchLine: "Construccion sostenible y materialidad",
      },
      {
        slug: "riesgo-asentamientos-riberas",
        label: "Riesgo en asentamientos riberenos",
        title:
          "Criterios de gestion del riesgo para asentamientos ubicados en riberas urbanas",
        researchLine: "Planificacion urbana y resiliencia",
      },
      {
        slug: "wayfinding-hospitales",
        label: "Wayfinding hospitalario",
        title:
          "Orientacion espacial y experiencia de usuario en hospitales de alta complejidad",
        researchLine: "Diseno centrado en el usuario y senaletica",
      },
      {
        slug: "resiliencia-parques",
        label: "Resiliencia de parques",
        title:
          "Resiliencia de parques vecinales frente a eventos climaticos extremos",
        researchLine: "Infraestructura verde y resiliencia urbana",
      },
      {
        slug: "coworking-productividad",
        label: "Coworking y productividad",
        title:
          "Percepcion de funcionalidad espacial y productividad en espacios coworking urbanos",
        researchLine: "Diseno interior y comportamiento del usuario",
      },
    ],
    contexts: [
      {
        slug: "lima-metropolitana",
        label: "Lima Metropolitana",
        topicSuffix: "Delimitado a contextos urbanos de Lima Metropolitana.",
        problemFrame:
          "los distritos de Lima Metropolitana combinan crecimiento, congestion y demandas de habitabilidad que exigen estudios acotados y observables",
        targetPopulation:
          "Usuarios, residentes, gestores locales y especialistas vinculados a espacios o equipamientos de Lima Metropolitana.",
      },
      {
        slug: "ciudades-intermedias",
        label: "Ciudades intermedias",
        topicSuffix: "Aplicado a ciudades intermedias del Peru.",
        problemFrame:
          "las ciudades intermedias requieren soluciones de diseno y planificacion adaptadas a escalas locales y recursos limitados",
        targetPopulation:
          "Usuarios, funcionarios locales y equipos tecnicos vinculados a proyectos urbanos o arquitectonicos en ciudades intermedias.",
      },
      {
        slug: "equipamientos-publicos",
        label: "Equipamientos publicos",
        topicSuffix: "Con foco en equipamientos publicos y servicios colectivos.",
        problemFrame:
          "los equipamientos publicos necesitan mejorar accesibilidad, orientacion y experiencia de uso desde evidencia directa del usuario",
        targetPopulation:
          "Usuarios frecuentes, personal operativo y gestores de equipamientos publicos peruanos.",
      },
      {
        slug: "barrios-residenciales",
        label: "Barrios residenciales",
        topicSuffix: "Acotado a barrios residenciales y espacios de proximidad.",
        problemFrame:
          "los barrios residenciales cambian rapidamente y requieren entender mejor apropiacion, seguridad y confort del espacio cotidiano",
        targetPopulation:
          "Residentes, dirigentes vecinales y usuarios recurrentes de barrios o parques residenciales en el Peru.",
      },
      {
        slug: "infraestructura-educativa-salud",
        label: "Infraestructura social",
        topicSuffix: "Aplicado a infraestructura educativa o de salud de escala barrial.",
        problemFrame:
          "la infraestructura social demanda soluciones funcionales y sostenibles que respondan al uso real y no solo a criterios normativos",
        targetPopulation:
          "Usuarios, directivos y personal de equipamientos educativos o de salud de escala barrial.",
      },
    ],
  },
] as const;

function buildIntakePresets(
  projectId: string,
  topic: TopicDefinition,
  contexts: readonly CareerContext[],
) {
  return contexts.flatMap((context) =>
    METHOD_PROFILES.map((method) => ({
      id: `${projectId}-${context.slug}-${method.slug}`,
      projectPresetId: projectId,
      label: `${context.label} | ${method.label}`,
      topic: `${topic.title}. ${context.topicSuffix}`,
      problemContext: `En ${context.problemFrame}, el proyecto "${topic.title}" permite estudiar un problema acotado, observable y trazable con evidencia recuperable.`,
      researchLine: topic.researchLine,
      academicConstraints: method.academicConstraints,
      targetPopulation: context.targetPopulation,
      availableData: method.availableData,
      preferredMethodology: method.preferredMethodology,
      advisorNotes: method.advisorNotes,
    })),
  );
}

export const PROJECT_PRESETS: ProjectPreset[] = CAREER_DEFINITIONS.flatMap((career) =>
  career.topics.map((topic, topicIndex) => {
    const degreeLevel = topicIndex % 2 === 0 ? "MAESTRIA" : "POSGRADO";
    const university = career.universities[topicIndex % career.universities.length];
    const id = `${career.id}-${topic.slug}`;

    return {
      id,
      careerId: career.id,
      careerLabel: career.label,
      label: topic.label,
      title: topic.title,
      degreeLevel,
      university,
      program: career.programs[degreeLevel],
      templateKey: getProjectTemplateKeyForUniversity(university),
      researchLine: topic.researchLine,
      intakePresets: buildIntakePresets(id, topic, career.contexts),
    };
  }),
);

export const PROJECT_CAREERS: ProjectCareer[] = CAREER_DEFINITIONS.map((career) => ({
  id: career.id,
  label: career.label,
  topicCount: career.topics.length,
}));

export function getProjectPresetById(projectPresetId: string | null | undefined) {
  if (!projectPresetId) {
    return null;
  }

  return PROJECT_PRESETS.find((preset) => preset.id === projectPresetId) ?? null;
}

export function findProjectPresetByTitle(title: string | null | undefined) {
  if (!title) {
    return null;
  }

  return PROJECT_PRESETS.find((preset) => preset.title === title) ?? null;
}

export function getProjectPresetsByCareer(careerId: string) {
  return PROJECT_PRESETS.filter((preset) => preset.careerId === careerId);
}

export function getIntakePresetsForProject(projectPresetId: string | null | undefined) {
  return getProjectPresetById(projectPresetId)?.intakePresets ?? [];
}
