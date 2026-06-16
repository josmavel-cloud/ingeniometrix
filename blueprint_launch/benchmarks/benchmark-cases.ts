import type { IntakeInput } from "@/server/projects/project-validation";

export type BlueprintLaunchBenchmarkCase = {
  id: string;
  knowledgeAreaLabel: string;
  title: string;
  intake: IntakeInput;
  expectations: {
    expectedSubdomainTerms: string[];
    expectedNecessaryKeywords: string[];
    expectedComplementaryKeywords: string[];
    expectedOptionalKeywords: string[];
    expectedQueryTerms: string[];
    forbiddenTerms: string[];
    minRelevantTop5: number;
  };
};

export const blueprintLaunchBenchmarkCases: BlueprintLaunchBenchmarkCase[] = [
  {
    id: "structural-shaking-table-control",
    knowledgeAreaLabel: "Ingenieria Estructural",
    title: "Control multigrado para mesa vibratoria sismica",
    intake: {
      topic:
        "Diseno de sistemas de control para mesas vibratorias de varios grados de libertad aplicadas a laboratorios de estructuras que permitan simular sismos sobre especimenes de edificios a escala natural de hasta 2 pisos en zonas de alta intensidad sismica en Sudamerica.",
      problemContext:
        "Los laboratorios de estructuras requieren plataformas experimentales capaces de reproducir registros sismicos intensos con alta fidelidad. El problema tecnico se centra en el control multivariable de mesas vibratorias con acoplamiento dinamico mesa-especimen, saturacion de actuadores y errores de seguimiento bajo excitacion multiaxial.",
      researchLine:
        "Dinamica estructural experimental, control avanzado y simulacion sismica.",
      academicConstraints:
        "Tesis de maestria con validacion virtual y revision bibliografica trazable, sin construir el hardware completo.",
      targetPopulation:
        "Mesas vibratorias servo-hidraulicas multigrado para ensayos de edificios de hasta 2 pisos a escala natural o cuasi natural.",
      availableData:
        "Modelos dinamicos, limites de actuadores, registros sismicos, parametros de control y herramientas de simulacion en espacio de estados.",
      preferredMethodology:
        "Modelado dinamico acoplado, diseno de control multivariable y evaluacion mediante simulacion en tiempo y frecuencia.",
      advisorNotes:
        "Mantener el foco en control, tracking y fidelidad de reproduccion sismica.",
    },
    expectations: {
      expectedSubdomainTerms: ["control", "shaking table", "seismic simulation"],
      expectedNecessaryKeywords: [
        "shaking table",
        "control system",
        "earthquake simulation",
        "multi degree of freedom",
      ],
      expectedComplementaryKeywords: [
        "tracking accuracy",
        "servo-hydraulic",
        "table-specimen interaction",
      ],
      expectedOptionalKeywords: ["South America", "two-story building"],
      expectedQueryTerms: ["shaking table", "control", "earthquake simulation"],
      forbiddenTerms: ["protein", "rna", "hospital", "marketing"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "structural-base-isolation-rc",
    knowledgeAreaLabel: "Ingenieria Estructural",
    title: "Aisladores sismicos en edificios de concreto armado",
    intake: {
      topic:
        "Evaluacion del efecto de aisladores sismicos de base en la respuesta dinamica y control de derivas de edificios de concreto armado de 10 a 15 niveles en Lima Metropolitana.",
      problemContext:
        "En Lima Metropolitana persiste la necesidad de evaluar con mayor claridad el impacto de los aisladores sismicos en la reduccion de aceleraciones, desplazamientos laterales y derivas entre pisos.",
      researchLine:
        "Dinamica de estructuras y desempeno sismico de edificaciones.",
      academicConstraints:
        "Proyecto en espanol con enfoque aplicado de maestria y simulacion estructural.",
      targetPopulation:
        "Edificios aporticados de concreto armado de 10 a 15 niveles para uso residencial en Lima Metropolitana.",
      availableData:
        "Parametros tipicos de edificios de concreto armado, espectros normativos y registros sismicos de referencia.",
      preferredMethodology:
        "Modelacion computacional y comparacion de respuesta dinamica entre configuraciones con y sin aislamiento sismico.",
      advisorNotes:
        "Priorizar variables estructurales medibles como deriva, periodo y cortante basal.",
    },
    expectations: {
      expectedSubdomainTerms: ["seismic", "structural", "base isolation"],
      expectedNecessaryKeywords: [
        "base isolation",
        "reinforced concrete",
        "seismic response",
        "interstory drift",
      ],
      expectedComplementaryKeywords: [
        "nonlinear time history",
        "mid-rise buildings",
        "floor acceleration",
      ],
      expectedOptionalKeywords: ["Lima", "Peru"],
      expectedQueryTerms: ["base isolation", "reinforced concrete", "interstory drift"],
      forbiddenTerms: ["sepsis", "customer churn", "teacher"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "systems-saas-churn-xai",
    knowledgeAreaLabel: "Ingenieria de Sistemas",
    title: "Prediccion de churn en SaaS B2B con modelos explicables",
    intake: {
      topic:
        "Diseno de modelos explicables para la deteccion temprana de abandono de clientes en plataformas SaaS B2B mediante aprendizaje automatico supervisado.",
      problemContext:
        "Las empresas SaaS B2B requieren identificar señales tempranas de churn para intervenir antes de la cancelacion, pero los modelos opacos limitan la accion operativa.",
      researchLine:
        "Analitica avanzada, aprendizaje automatico aplicado y sistemas de soporte a decisiones.",
      academicConstraints:
        "Tesis de maestria con datos historicos anonimizados, sin despliegue productivo obligatorio.",
      targetPopulation:
        "Cuentas empresariales activas y canceladas en plataformas SaaS B2B con eventos de uso, facturacion y soporte.",
      availableData:
        "Logs de uso, tickets, historial de renovacion, facturacion, usuarios activos y variables contractuales.",
      preferredMethodology:
        "Modelos supervisados con interpretabilidad local y global, comparacion de rendimiento y explicabilidad.",
      advisorNotes:
        "Priorizar churn, explainability, temporalidad de senales y utilidad para retencion.",
    },
    expectations: {
      expectedSubdomainTerms: ["machine learning", "churn", "explainable"],
      expectedNecessaryKeywords: [
        "customer churn",
        "machine learning",
        "explainable ai",
      ],
      expectedComplementaryKeywords: ["saas", "b2b", "retention"],
      expectedOptionalKeywords: ["support tickets", "billing"],
      expectedQueryTerms: ["customer churn", "explainable", "saas"],
      forbiddenTerms: ["earthquake", "sepsis", "curriculum"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "systems-zero-trust-iot",
    knowledgeAreaLabel: "Ingenieria de Sistemas",
    title: "Zero trust para IoT industrial",
    intake: {
      topic:
        "Diseno de una arquitectura zero trust para redes IoT industriales con restricciones de latencia y disponibilidad en plantas de manufactura.",
      problemContext:
        "Las redes IoT industriales incrementan la superficie de ataque y requieren mecanismos de segmentacion, autenticacion continua y control de acceso con bajo impacto operativo.",
      researchLine:
        "Ciberseguridad aplicada, arquitecturas distribuidas y sistemas industriales conectados.",
      academicConstraints:
        "Proyecto de maestria orientado a diseno y validacion conceptual sin implementacion completa en planta.",
      targetPopulation:
        "Dispositivos IoT industriales, gateways y servicios de supervision en ambientes de manufactura.",
      availableData:
        "Topologias de red, politicas de acceso, patrones de trafico y requisitos de latencia.",
      preferredMethodology:
        "Analisis de arquitectura, evaluacion de amenazas y simulacion de politicas de control de acceso.",
      advisorNotes:
        "Mantener foco en zero trust, segmentacion y continuidad operativa.",
    },
    expectations: {
      expectedSubdomainTerms: ["cybersecurity", "zero trust", "iot"],
      expectedNecessaryKeywords: ["zero trust", "industrial iot", "access control"],
      expectedComplementaryKeywords: ["latency", "network segmentation", "manufacturing"],
      expectedOptionalKeywords: ["gateway", "threat model"],
      expectedQueryTerms: ["zero trust", "industrial iot"],
      forbiddenTerms: ["earthquake", "hospital", "teacher"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "medicine-sepsis-biomarkers",
    knowledgeAreaLabel: "Medicina",
    title: "Biomarcadores multimodales para sepsis",
    intake: {
      topic:
        "Evaluacion del valor pronostico incremental de biomarcadores inflamatorios, metabolomicos y de dano endotelial integrados con aprendizaje automatico para la estratificacion temprana de sepsis con disfuncion organica en pacientes criticos adultos.",
      problemContext:
        "La sepsis presenta elevada mortalidad y heterogeneidad biologica, lo que limita la capacidad de los scores clinicos convencionales para discriminar subfenotipos con trayectorias divergentes.",
      researchLine:
        "Medicina intensiva, modelamiento pronostico clinico y biologia de sistemas aplicada.",
      academicConstraints:
        "Proyecto observacional con datos anonimizados y bibliografia trazable.",
      targetPopulation:
        "Pacientes adultos con sepsis o shock septico admitidos a unidades de cuidados intensivos.",
      availableData:
        "Biomarcadores seriados, variables fisiologicas continuas, SOFA, APACHE II y mortalidad a 28 dias.",
      preferredMethodology:
        "Modelamiento pronostico supervisado y comparacion de modelos con validacion interna.",
      advisorNotes:
        "Mantener foco en utilidad pronostica, interpretabilidad y comparacion con scores clinicos.",
    },
    expectations: {
      expectedSubdomainTerms: ["sepsis", "critical care", "prognostic"],
      expectedNecessaryKeywords: ["sepsis", "biomarkers", "prognostic model"],
      expectedComplementaryKeywords: ["intensive care", "organ dysfunction", "machine learning"],
      expectedOptionalKeywords: ["sofa", "apache ii"],
      expectedQueryTerms: ["sepsis", "prognostic biomarkers"],
      forbiddenTerms: ["earthquake", "customer churn", "curriculum"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "medicine-radiomics-glioblastoma",
    knowledgeAreaLabel: "Medicina",
    title: "Radiomica para glioblastoma",
    intake: {
      topic:
        "Desarrollo de modelos radiomicos y clinicos para predecir supervivencia global en pacientes con glioblastoma a partir de resonancia magnetica multiparametrica.",
      problemContext:
        "La estratificacion pronostica en glioblastoma sigue siendo limitada y los biomarcadores imagenologicos cuantitativos podrian aportar valor incremental.",
      researchLine:
        "Imagen medica avanzada, oncologia traslacional y modelamiento pronostico.",
      academicConstraints:
        "Tesis de maestria con cohortes retrospectivas y validacion interna.",
      targetPopulation:
        "Pacientes adultos con glioblastoma y resonancia magnetica pretratamiento.",
      availableData:
        "Secuencias multiparametricas, variables clinicas y desenlaces de supervivencia.",
      preferredMethodology:
        "Extraccion de caracteristicas radiomicas, seleccion de variables y modelos de supervivencia.",
      advisorNotes:
        "Priorizar radiomics, MRI y overall survival.",
    },
    expectations: {
      expectedSubdomainTerms: ["radiomics", "glioblastoma", "survival"],
      expectedNecessaryKeywords: ["glioblastoma", "radiomics", "magnetic resonance imaging"],
      expectedComplementaryKeywords: ["survival prediction", "multiparametric MRI"],
      expectedOptionalKeywords: ["overall survival"],
      expectedQueryTerms: ["glioblastoma radiomics"],
      forbiddenTerms: ["earthquake", "saas", "teacher"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "education-reading-comprehension",
    knowledgeAreaLabel: "Educacion",
    title: "Comprension lectora en secundaria",
    intake: {
      topic:
        "Efecto de una estrategia metacognitiva de lectura guiada sobre la comprension lectora inferencial en estudiantes de secundaria de instituciones publicas urbanas.",
      problemContext:
        "Los estudiantes muestran dificultades persistentes en comprension inferencial y monitoreo de la propia lectura.",
      researchLine:
        "Didactica de la lectura, innovacion pedagogica y evaluacion educativa.",
      academicConstraints:
        "Intervencion educativa acotada y medicion pretest-postest.",
      targetPopulation:
        "Estudiantes de secundaria de escuelas publicas urbanas.",
      availableData:
        "Pruebas de comprension lectora, fichas de observacion y registros de aula.",
      preferredMethodology:
        "Diseno cuasi experimental con grupo control y analisis comparativo de ganancias.",
      advisorNotes:
        "Mantener foco en reading comprehension, metacognition y secondary education.",
    },
    expectations: {
      expectedSubdomainTerms: ["reading", "education", "metacognitive"],
      expectedNecessaryKeywords: ["reading comprehension", "metacognitive strategy", "secondary education"],
      expectedComplementaryKeywords: ["inferential comprehension", "quasi-experimental"],
      expectedOptionalKeywords: ["public school", "urban students"],
      expectedQueryTerms: ["reading comprehension metacognitive strategy"],
      forbiddenTerms: ["earthquake", "sepsis", "supply chain"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "education-ai-feedback-writing",
    knowledgeAreaLabel: "Educacion",
    title: "Retroalimentacion asistida por IA para escritura academica",
    intake: {
      topic:
        "Uso de retroalimentacion asistida por inteligencia artificial para mejorar la coherencia textual en ensayos academicos de estudiantes universitarios de primer ciclo.",
      problemContext:
        "Los estudiantes de primeros ciclos presentan dificultades para organizar ideas y sostener coherencia global en sus textos.",
      researchLine:
        "Tecnologia educativa, alfabetizacion academica y evaluacion formativa.",
      academicConstraints:
        "Estudio aplicado con intervencion corta y evaluacion de productos escritos.",
      targetPopulation:
        "Estudiantes universitarios de primer ciclo en cursos introductorios de comunicacion academica.",
      availableData:
        "Ensayos, rubricas, retroalimentacion automatizada y evaluacion docente.",
      preferredMethodology:
        "Diseno mixto con comparacion pre y post de calidad textual.",
      advisorNotes:
        "Centrar la busqueda en AI-assisted feedback y academic writing.",
    },
    expectations: {
      expectedSubdomainTerms: ["educational technology", "writing", "feedback"],
      expectedNecessaryKeywords: ["ai feedback", "academic writing", "text coherence"],
      expectedComplementaryKeywords: ["higher education", "formative assessment"],
      expectedOptionalKeywords: ["essay writing"],
      expectedQueryTerms: ["AI-assisted feedback academic writing"],
      forbiddenTerms: ["earthquake", "biomarker", "zero trust"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "business-supply-chain-resilience",
    knowledgeAreaLabel: "Administracion",
    title: "Resiliencia de cadena de suministro",
    intake: {
      topic:
        "Estrategias de resiliencia en cadenas de suministro de alimentos perecibles frente a disrupciones logisticas y climaticas en ciudades costeras.",
      problemContext:
        "Las cadenas de alimentos perecibles enfrentan interrupciones recurrentes que afectan disponibilidad, desperdicio y costos.",
      researchLine:
        "Gestion de operaciones, resiliencia organizacional y logistica.",
      academicConstraints:
        "Tesis aplicada de maestria con enfoque de mejora de gestion y evidencia bibliografica trazable.",
      targetPopulation:
        "Empresas distribuidoras y operadores logisticos de alimentos perecibles.",
      availableData:
        "Indicadores logisticos, tiempos de entrega, perdidas por merma y practicas de mitigacion.",
      preferredMethodology:
        "Revision sistematica aplicada y propuesta de framework de resiliencia operativa.",
      advisorNotes:
        "Priorizar supply chain resilience, perishables y disruption management.",
    },
    expectations: {
      expectedSubdomainTerms: ["supply chain", "resilience", "logistics"],
      expectedNecessaryKeywords: ["supply chain resilience", "perishable food", "logistics disruption"],
      expectedComplementaryKeywords: ["climate disruption", "operational resilience"],
      expectedOptionalKeywords: ["coastal cities"],
      expectedQueryTerms: ["supply chain resilience perishables"],
      forbiddenTerms: ["earthquake engineering", "sepsis", "classroom"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "business-microfinance-default",
    knowledgeAreaLabel: "Administracion",
    title: "Riesgo de mora en microfinanzas",
    intake: {
      topic:
        "Factores de riesgo asociados a la mora temprana en creditos de microfinanzas para pequenos negocios urbanos.",
      problemContext:
        "Las instituciones microfinancieras requieren comprender mejor las senales tempranas de incumplimiento para ajustar politicas de riesgo.",
      researchLine:
        "Gestion financiera, analitica de riesgo y microfinanzas.",
      academicConstraints:
        "Estudio de maestria con datos anonimizados y alcance analitico.",
      targetPopulation:
        "Clientes de creditos para pequenos negocios en entidades microfinancieras urbanas.",
      availableData:
        "Historial de pagos, variables socioeconomicas, caracteristicas del credito y mora.",
      preferredMethodology:
        "Modelamiento explicativo y predictivo de mora temprana.",
      advisorNotes:
        "Priorizar default risk, microfinance y early delinquency.",
    },
    expectations: {
      expectedSubdomainTerms: ["microfinance", "credit risk", "default"],
      expectedNecessaryKeywords: ["microfinance", "default risk", "delinquency"],
      expectedComplementaryKeywords: ["small business", "credit scoring"],
      expectedOptionalKeywords: ["urban borrowers"],
      expectedQueryTerms: ["microfinance default risk"],
      forbiddenTerms: ["earthquake", "glioblastoma", "curriculum"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "psychology-burnout-nurses",
    knowledgeAreaLabel: "Psicologia",
    title: "Burnout en enfermeria hospitalaria",
    intake: {
      topic:
        "Relacion entre burnout laboral, apoyo organizacional percibido y sintomatologia ansiosa en personal de enfermeria hospitalaria.",
      problemContext:
        "El personal de enfermeria presenta alta carga emocional y riesgo de desgaste profesional con impacto en salud mental y desempeno.",
      researchLine:
        "Psicologia de la salud ocupacional y bienestar laboral.",
      academicConstraints:
        "Estudio transversal con instrumentos psicometricos validados.",
      targetPopulation:
        "Profesionales de enfermeria de hospitales generales.",
      availableData:
        "Escalas de burnout, apoyo organizacional y ansiedad.",
      preferredMethodology:
        "Analisis correlacional y modelos de regresion.",
      advisorNotes:
        "Centrar la busqueda en burnout, nursing staff y organizational support.",
    },
    expectations: {
      expectedSubdomainTerms: ["occupational health", "burnout", "nursing"],
      expectedNecessaryKeywords: ["burnout", "nursing staff", "organizational support"],
      expectedComplementaryKeywords: ["anxiety symptoms", "hospital"],
      expectedOptionalKeywords: ["occupational health"],
      expectedQueryTerms: ["burnout nursing organizational support"],
      forbiddenTerms: ["earthquake", "saas", "radiomics"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "psychology-executive-functions-adhd",
    knowledgeAreaLabel: "Psicologia",
    title: "Funciones ejecutivas en TDAH",
    intake: {
      topic:
        "Alteraciones en funciones ejecutivas y control inhibitorio en adolescentes con trastorno por deficit de atencion e hiperactividad en contexto escolar.",
      problemContext:
        "El TDAH en adolescentes se asocia a dificultades persistentes de atencion sostenida, autorregulacion y desempeno academico.",
      researchLine:
        "Neuropsicologia del desarrollo y evaluacion cognitiva.",
      academicConstraints:
        "Estudio de maestria con instrumentos neuropsicologicos validados y alcance aplicado.",
      targetPopulation:
        "Adolescentes escolarizados con diagnostico de TDAH.",
      availableData:
        "Pruebas de funciones ejecutivas, escalas clinicas y registros academicos.",
      preferredMethodology:
        "Analisis comparativo entre grupo clinico y grupo control.",
      advisorNotes:
        "Priorizar executive function, inhibitory control y ADHD adolescents.",
    },
    expectations: {
      expectedSubdomainTerms: ["neuropsychology", "adhd", "executive function"],
      expectedNecessaryKeywords: ["executive function", "ADHD adolescents", "inhibitory control"],
      expectedComplementaryKeywords: ["school context", "neuropsychological assessment"],
      expectedOptionalKeywords: ["academic performance"],
      expectedQueryTerms: ["executive function ADHD inhibitory control"],
      forbiddenTerms: ["earthquake", "microfinance", "supply chain"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "law-data-privacy-ai",
    knowledgeAreaLabel: "Derecho",
    title: "Proteccion de datos y decisiones automatizadas",
    intake: {
      topic:
        "Criterios de responsabilidad y cumplimiento para sistemas de decisiones automatizadas que procesan datos personales sensibles en servicios financieros digitales.",
      problemContext:
        "Las plataformas financieras digitales utilizan modelos automatizados para perfilar usuarios y tomar decisiones con impacto juridico, lo que exige revisar transparencia, consentimiento y accountability regulatoria.",
      researchLine:
        "Derecho digital, proteccion de datos personales y regulacion tecnologica.",
      academicConstraints:
        "Tesis de maestria basada en analisis normativo, doctrina y evidencia comparada.",
      targetPopulation:
        "Entidades financieras digitales que emplean decisiones automatizadas sobre datos personales sensibles.",
      availableData:
        "Normativa de privacidad, lineamientos regulatorios, resoluciones sancionadoras y doctrina especializada.",
      preferredMethodology:
        "Analisis juridico comparado y sistematizacion doctrinal con enfoque regulatorio.",
      advisorNotes:
        "Priorizar data privacy, automated decision-making y regulatory compliance.",
    },
    expectations: {
      expectedSubdomainTerms: ["data privacy", "automated decision-making", "financial services"],
      expectedNecessaryKeywords: ["data privacy", "automated decision-making", "regulatory compliance"],
      expectedComplementaryKeywords: ["financial services", "sensitive personal data", "algorithmic accountability"],
      expectedOptionalKeywords: ["consent", "transparency"],
      expectedQueryTerms: ["data privacy automated decision-making"],
      forbiddenTerms: ["earthquake", "glioblastoma", "classroom"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "law-public-procurement-integrity",
    knowledgeAreaLabel: "Derecho",
    title: "Integridad en contratacion publica digital",
    intake: {
      topic:
        "Mecanismos normativos para fortalecer integridad y control preventivo en contratacion publica electronica de obras de infraestructura.",
      problemContext:
        "Los procesos de contratacion publica digital enfrentan riesgos de colusion, direccionamiento y deficiencias de trazabilidad en fases tempranas.",
      researchLine:
        "Derecho administrativo, contratacion publica y compliance publico.",
      academicConstraints:
        "Investigacion aplicada con enfasis doctrinal y analisis de marcos regulatorios.",
      targetPopulation:
        "Procesos de contratacion publica electronica de obras de infraestructura.",
      availableData:
        "Normas de contratacion publica, informes de control, resoluciones administrativas y literatura especializada.",
      preferredMethodology:
        "Analisis juridico-institucional con revision comparada de mecanismos de integridad.",
      advisorNotes:
        "Centrar en public procurement, integrity y preventive control.",
    },
    expectations: {
      expectedSubdomainTerms: ["public procurement", "integrity", "administrative law"],
      expectedNecessaryKeywords: ["public procurement", "integrity", "preventive control"],
      expectedComplementaryKeywords: ["electronic procurement", "infrastructure projects", "administrative law"],
      expectedOptionalKeywords: ["collusion", "traceability"],
      expectedQueryTerms: ["public procurement integrity"],
      forbiddenTerms: ["sepsis", "iot", "school"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "architecture-mass-timber-overbuild",
    knowledgeAreaLabel: "Arquitectura",
    title: "Mass-timber overbuild para adaptive reuse",
    intake: {
      topic:
        "Creative business ideas to overcome the housing crisis in Canada considering mass-timber overbuild as a strategy of adaptive reuse on distressed commercial buildings. Case of Toronto type B and C buildings.",
      problemContext:
        "La crisis de vivienda requiere soluciones de densificacion y reutilizacion adaptativa sobre activos comerciales subutilizados sin perder viabilidad normativa ni economica.",
      researchLine:
        "Arquitectura sostenible, adaptive reuse y regeneracion urbana.",
      academicConstraints:
        "Tesis de maestria con enfoque de factibilidad y evidencia bibliografica trazable.",
      targetPopulation:
        "Edificios comerciales distress tipo B y C en Toronto con potencial de reconversion y sobre-elevacion liviana.",
      availableData:
        "Tipologias edilicias, precedentes internacionales, criterios de mass timber y regulaciones urbanas.",
      preferredMethodology:
        "Analisis tipologico, revision comparada y framework de factibilidad arquitectonica y de negocio.",
      advisorNotes:
        "Priorizar adaptive reuse, mass timber overbuild y housing conversion.",
    },
    expectations: {
      expectedSubdomainTerms: ["adaptive reuse", "mass timber", "housing"],
      expectedNecessaryKeywords: ["adaptive reuse", "mass timber", "commercial buildings"],
      expectedComplementaryKeywords: ["housing crisis", "overbuild", "affordable housing"],
      expectedOptionalKeywords: ["Toronto", "distressed assets"],
      expectedQueryTerms: ["adaptive reuse mass timber overbuild"],
      forbiddenTerms: ["sepsis", "procurement", "iot"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "architecture-heritage-retrofitting",
    knowledgeAreaLabel: "Arquitectura",
    title: "Retrofit energetico en patrimonio educativo",
    intake: {
      topic:
        "Estrategias de retrofit energetico pasivo para edificaciones patrimoniales de uso educativo en climas costeros humedos.",
      problemContext:
        "Los edificios patrimoniales educativos presentan bajo desempeno termico y restricciones de intervencion por valor historico.",
      researchLine:
        "Conservacion arquitectonica, sostenibilidad y rehabilitacion energetica.",
      academicConstraints:
        "Investigacion aplicada con revision de precedentes y lineamientos de intervencion compatibles.",
      targetPopulation:
        "Edificios patrimoniales de uso educativo ubicados en climas costeros humedos.",
      availableData:
        "Levantamientos arquitectonicos, precedentes de rehabilitacion, criterios patrimoniales y estrategias pasivas.",
      preferredMethodology:
        "Analisis comparado de casos y simulacion conceptual de mejoras pasivas.",
      advisorNotes:
        "Priorizar heritage buildings, passive retrofit y thermal performance.",
    },
    expectations: {
      expectedSubdomainTerms: ["heritage buildings", "passive retrofit", "thermal performance"],
      expectedNecessaryKeywords: ["heritage buildings", "passive retrofit", "energy performance"],
      expectedComplementaryKeywords: ["educational buildings", "humid climate", "conservation"],
      expectedOptionalKeywords: ["coastal climate", "thermal comfort"],
      expectedQueryTerms: ["heritage passive retrofit energy performance"],
      forbiddenTerms: ["microfinance", "adhd", "shaking table"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "environmental-wetlands-heavy-metals",
    knowledgeAreaLabel: "Ingenieria Ambiental",
    title: "Humedales construidos para metales pesados",
    intake: {
      topic:
        "Desempeno de humedales construidos de flujo subsuperficial para remocion de metales pesados en efluentes mineros de pequena escala.",
      problemContext:
        "Los efluentes mineros con metales pesados requieren soluciones de tratamiento de bajo costo y facil operacion para contextos descentralizados.",
      researchLine:
        "Tratamiento de aguas, remediacion ambiental y tecnologias basadas en la naturaleza.",
      academicConstraints:
        "Tesis aplicada con comparacion de disenos y parametros de remocion reportados.",
      targetPopulation:
        "Efluentes mineros de pequena escala con presencia de metales pesados.",
      availableData:
        "Caracterizacion de efluentes, configuraciones de humedales, especies vegetales y eficiencias reportadas.",
      preferredMethodology:
        "Revision comparada y framework de diseno para escenarios descentralizados.",
      advisorNotes:
        "Priorizar constructed wetlands, heavy metal removal y mining wastewater.",
    },
    expectations: {
      expectedSubdomainTerms: ["constructed wetlands", "heavy metal removal", "wastewater treatment"],
      expectedNecessaryKeywords: ["constructed wetlands", "heavy metal removal", "mining wastewater"],
      expectedComplementaryKeywords: ["subsurface flow", "nature-based treatment", "small-scale mining"],
      expectedOptionalKeywords: ["decentralized treatment", "plant species"],
      expectedQueryTerms: ["constructed wetlands heavy metal removal"],
      forbiddenTerms: ["seismic", "classroom", "credit risk"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "environmental-air-quality-emissions",
    knowledgeAreaLabel: "Ingenieria Ambiental",
    title: "Inventarios de emisiones urbanas",
    intake: {
      topic:
        "Metodologias para estimar inventarios de emisiones de material particulado fino en corredores urbanos con alta congestion vehicular.",
      problemContext:
        "La gestion de calidad del aire urbano requiere inventarios confiables para priorizar intervenciones de movilidad y control ambiental.",
      researchLine:
        "Calidad del aire, modelamiento ambiental y gestion urbana sostenible.",
      academicConstraints:
        "Proyecto de maestria con enfoque metodologico y aplicacion a contexto urbano latinoamericano.",
      targetPopulation:
        "Corredores urbanos con alta congestion vehicular y episodios frecuentes de PM2.5.",
      availableData:
        "Flujos vehiculares, factores de emision, datos meteorologicos y mediciones de calidad del aire.",
      preferredMethodology:
        "Comparacion de metodologias de inventario y evaluacion de sensibilidad de parametros.",
      advisorNotes:
        "Priorizar emission inventory, PM2.5 y urban traffic corridors.",
    },
    expectations: {
      expectedSubdomainTerms: ["emission inventory", "pm2.5", "urban air quality"],
      expectedNecessaryKeywords: ["emission inventory", "PM2.5", "urban traffic"],
      expectedComplementaryKeywords: ["air quality", "vehicle emissions", "urban corridors"],
      expectedOptionalKeywords: ["meteorology", "Latin America"],
      expectedQueryTerms: ["emission inventory PM2.5 urban traffic"],
      forbiddenTerms: ["radiomics", "procurement", "adaptive reuse"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "economics-inflation-expectations",
    knowledgeAreaLabel: "Economia",
    title: "Expectativas inflacionarias en hogares urbanos",
    intake: {
      topic:
        "Determinantes de las expectativas inflacionarias de hogares urbanos y su relacion con decisiones de consumo y ahorro en contextos de alta volatilidad de precios.",
      problemContext:
        "La volatilidad de precios afecta percepciones y decisiones intertemporales de los hogares, con implicancias para politica monetaria y bienestar.",
      researchLine:
        "Macroeconomia aplicada, expectativas y bienestar de hogares.",
      academicConstraints:
        "Investigacion de maestria con analisis econometrico y datos secundarios.",
      targetPopulation:
        "Hogares urbanos expuestos a episodios de alta volatilidad inflacionaria.",
      availableData:
        "Encuestas de expectativas, variables socioeconomicas, indicadores de consumo y ahorro.",
      preferredMethodology:
        "Modelos econometricos de panel y analisis de heterogeneidad.",
      advisorNotes:
        "Priorizar inflation expectations, household behavior y price volatility.",
    },
    expectations: {
      expectedSubdomainTerms: ["inflation expectations", "household behavior", "macroeconomics"],
      expectedNecessaryKeywords: ["inflation expectations", "household behavior", "price volatility"],
      expectedComplementaryKeywords: ["consumption decisions", "savings", "panel data"],
      expectedOptionalKeywords: ["urban households", "monetary policy"],
      expectedQueryTerms: ["inflation expectations household behavior"],
      forbiddenTerms: ["earthquake", "nursing", "adaptive reuse"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "economics-informality-productivity",
    knowledgeAreaLabel: "Economia",
    title: "Informalidad y productividad microempresarial",
    intake: {
      topic:
        "Relacion entre informalidad laboral, acceso a financiamiento y productividad en microempresas urbanas de servicios.",
      problemContext:
        "La informalidad limita crecimiento, acceso a credito y adopcion de practicas de gestion productiva en microempresas.",
      researchLine:
        "Economia del desarrollo, productividad y mercado laboral.",
      academicConstraints:
        "Tesis aplicada con evidencia empirica y enfoque urbano.",
      targetPopulation:
        "Microempresas urbanas de servicios con distintos niveles de formalizacion.",
      availableData:
        "Encuestas empresariales, indicadores de productividad, empleo y acceso a financiamiento.",
      preferredMethodology:
        "Modelos econometricos con control de heterogeneidad observada.",
      advisorNotes:
        "Priorizar informality, productivity y microenterprises.",
    },
    expectations: {
      expectedSubdomainTerms: ["informality", "productivity", "microenterprises"],
      expectedNecessaryKeywords: ["labor informality", "productivity", "microenterprises"],
      expectedComplementaryKeywords: ["access to finance", "urban services", "small firms"],
      expectedOptionalKeywords: ["employment", "development economics"],
      expectedQueryTerms: ["labor informality productivity microenterprises"],
      forbiddenTerms: ["glioblastoma", "public procurement", "shaking table"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "communications-misinformation-elections",
    knowledgeAreaLabel: "Comunicacion",
    title: "Desinformacion politica en redes sociales",
    intake: {
      topic:
        "Estrategias narrativas de desinformacion politica en redes sociales durante campanas electorales municipales y su impacto en engagement digital.",
      problemContext:
        "La desinformacion digital altera la deliberacion publica y amplifica contenido polarizante en contextos electorales locales.",
      researchLine:
        "Comunicacion politica digital, redes sociales y alfabetizacion mediatica.",
      academicConstraints:
        "Investigacion de maestria con enfoque analitico y revision bibliografica trazable.",
      targetPopulation:
        "Contenidos publicados en redes sociales durante campanas electorales municipales.",
      availableData:
        "Publicaciones, interacciones, clasificacion tematica y patrones narrativos.",
      preferredMethodology:
        "Analisis de contenido digital y tipificacion de narrativas de desinformacion.",
      advisorNotes:
        "Priorizar misinformation, political communication y social media engagement.",
    },
    expectations: {
      expectedSubdomainTerms: ["misinformation", "political communication", "social media"],
      expectedNecessaryKeywords: ["misinformation", "political communication", "social media"],
      expectedComplementaryKeywords: ["elections", "audience engagement", "digital narratives"],
      expectedOptionalKeywords: ["media literacy", "municipal campaigns"],
      expectedQueryTerms: ["misinformation political communication social media"],
      forbiddenTerms: ["sepsis", "credit scoring", "constructed wetlands"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "communications-journalism-trust",
    knowledgeAreaLabel: "Comunicacion",
    title: "Confianza en periodismo digital",
    intake: {
      topic:
        "Factores asociados a confianza y credibilidad percibida en medios periodisticos digitales entre usuarios jovenes universitarios.",
      problemContext:
        "Los medios digitales enfrentan desconfianza creciente y competencia con fuentes informales en redes sociales.",
      researchLine:
        "Periodismo digital, audiencias y credibilidad mediaticas.",
      academicConstraints:
        "Estudio aplicado con instrumentos de percepcion y analisis correlacional.",
      targetPopulation:
        "Usuarios universitarios jovenes consumidores de noticias digitales.",
      availableData:
        "Encuestas de percepcion, patrones de consumo y variables de confianza mediaticas.",
      preferredMethodology:
        "Analisis correlacional y segmentacion de perfiles de audiencia.",
      advisorNotes:
        "Priorizar digital journalism, media trust y news credibility.",
    },
    expectations: {
      expectedSubdomainTerms: ["digital journalism", "media trust", "news credibility"],
      expectedNecessaryKeywords: ["digital journalism", "media trust", "news credibility"],
      expectedComplementaryKeywords: ["young audiences", "news consumption", "online media"],
      expectedOptionalKeywords: ["university students", "audience segmentation"],
      expectedQueryTerms: ["digital journalism media trust"],
      forbiddenTerms: ["earthquake", "microfinance", "adhd"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "public-health-vaccination-rural",
    knowledgeAreaLabel: "Salud Publica",
    title: "Cobertura de vacunacion infantil rural",
    intake: {
      topic:
        "Factores comunitarios y de acceso asociados a brechas de cobertura de vacunacion infantil en zonas rurales dispersas.",
      problemContext:
        "Persisten brechas de cobertura y esquemas incompletos en territorios rurales con barreras geograficas y organizacionales.",
      researchLine:
        "Salud publica, inmunizaciones y acceso a servicios de salud.",
      academicConstraints:
        "Investigacion aplicada con enfoque de determinantes y evidencia para gestion local.",
      targetPopulation:
        "Ninos menores de cinco anos y sus cuidadores en comunidades rurales dispersas.",
      availableData:
        "Registros de inmunizacion, encuestas comunitarias y variables de acceso territorial.",
      preferredMethodology:
        "Analisis transversal con enfoque de determinantes sociales y de acceso.",
      advisorNotes:
        "Priorizar vaccination coverage, rural access y community determinants.",
    },
    expectations: {
      expectedSubdomainTerms: ["vaccination coverage", "rural access", "public health"],
      expectedNecessaryKeywords: ["vaccination coverage", "rural access", "community determinants"],
      expectedComplementaryKeywords: ["immunization", "primary care", "health access"],
      expectedOptionalKeywords: ["children under five", "geographic barriers"],
      expectedQueryTerms: ["vaccination coverage rural access"],
      forbiddenTerms: ["mass timber", "zero trust", "radiomics"],
      minRelevantTop5: 2,
    },
  },
  {
    id: "public-health-anemia-adolescents",
    knowledgeAreaLabel: "Salud Publica",
    title: "Anemia y adherencia nutricional en adolescentes",
    intake: {
      topic:
        "Factores asociados a adherencia de suplementacion y persistencia de anemia ferropenica en adolescentes escolares de zonas periurbanas.",
      problemContext:
        "La anemia en adolescentes persiste a pesar de intervenciones de suplementacion y educacion alimentaria.",
      researchLine:
        "Nutricion publica, salud escolar y evaluacion de intervenciones.",
      academicConstraints:
        "Estudio aplicado con evidencia para mejora programatica local.",
      targetPopulation:
        "Adolescentes escolares de zonas periurbanas con antecedente de suplementacion con hierro.",
      availableData:
        "Hemoglobina, registros de adherencia, practicas alimentarias y variables familiares.",
      preferredMethodology:
        "Analisis observacional con identificacion de factores asociados.",
      advisorNotes:
        "Priorizar iron deficiency anemia, supplementation adherence y school health.",
    },
    expectations: {
      expectedSubdomainTerms: ["iron deficiency anemia", "supplementation adherence", "school health"],
      expectedNecessaryKeywords: ["iron deficiency anemia", "supplementation adherence", "adolescents"],
      expectedComplementaryKeywords: ["school health", "nutrition intervention", "peri-urban"],
      expectedOptionalKeywords: ["hemoglobin", "family factors"],
      expectedQueryTerms: ["iron deficiency anemia supplementation adherence"],
      forbiddenTerms: ["earthquake", "public procurement", "digital journalism"],
      minRelevantTop5: 2,
    },
  },
];
