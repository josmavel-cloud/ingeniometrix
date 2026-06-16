# Thread Brief

- Thread: `IMX-REPORT-exports`
- Date: 2026-04-20
- Worktree: primary workspace
- Goal: investigar formatos, contenidos, sistemas de cita, referencias y criterios de estilo para un plan de tesis tipico en Peru, priorizando UPC, UCV y USMP.

## What Changed

- Se levanto una base documental de fuentes oficiales para definir una plantilla de plan de tesis mas cercana al uso real en Peru.
- Se identifico un nucleo comun de contenido para planes de tesis de maestria y posgrado.
- Se identificaron diferencias que afectan el diseno de plantilla:
  - universidad
  - enfoque metodologico
  - area disciplinar
  - requisitos de repositorio y publicacion

## Decisions

- La plantilla base de Ingeniometrix debe ser modular, no unica y rigida.
  Debe existir un tronco comun peruano y overlays por universidad y, mas adelante, por disciplina.

- Para Release 0, el tronco comun debe cubrir sobre todo planes cuantitativos y cualitativos.
  La investigacion tecnica se debe dejar prevista como variante, pero no debe dominar la primera version.

- El sistema de citas no debe fijarse globalmente a un unico estilo en el motor.
  Debe resolverse por `template_key` y, cuando sea necesario, por area disciplinar.

- El contenido del plan debe mantenerse mas estable que el formato visual.
  Lo que cambia poco entre universidades es la logica academica del plan; lo que cambia mas es portada, rotulos, estilo de citas, interlineado, tipografia y exigencias complementarias.

## Findings

- Patron comun peruano del plan de tesis
  En las fuentes revisadas aparece repetidamente este nucleo:
  - portada o caratula
  - indice
  - planteamiento del problema
  - formulacion del problema
  - objetivos
  - justificacion
  - marco teorico o estado del arte
  - antecedentes
  - hipotesis y variables cuando aplica
  - metodologia
  - muestra o unidad de analisis cuando aplica
  - tecnicas e instrumentos
  - aspectos eticos
  - cronograma
  - referencias o fuentes de informacion
  - anexos solo cuando aportan directamente a la investigacion

- Lo que confirma USMP
  El manual institucional aprobado en 2022 distingue planes cuantitativos, cualitativos y tecnicos. Para planes cuantitativos exige problema, objetivos, justificacion, marco teorico, hipotesis y variables, metodologia, cronograma y fuentes de informacion. Para cualitativos elimina el capitulo de hipotesis y variables y enfatiza el diseno metodologico y el procedimiento de muestreo. Tambien fija reglas formales concretas para la tesis final:
  - Arial 12
  - A4
  - margen izquierdo 3 cm y demas margenes 2.5 cm
  - doble espacio, excepto tablas
  - tablas con titulo arriba y sin lineas verticales
  - figuras con leyenda breve abajo
  - resumen y abstract
  - anexos solo si complementan directamente el estudio

- Lo que confirma UCV
  El reglamento de trabajos conducentes a grados y titulos aprobado en 2023 exige que la tesis de maestria respete la estructura de la guia institucional y tenga base en un proyecto de investigacion aprobado. En posgrado, la tesis y el trabajo de investigacion son individuales. Para el repositorio institucional, la UCV exige que los documentos cumplan APA, ISO o Vancouver, segun corresponda. Ademas, su manual de presentacion de productos de investigacion alineados a APA 7 fue publicado en 2023, lo que confirma que APA 7 es una referencia fuerte al menos para varias areas.

- Lo que confirma UPC
  La UPC mantiene plantillas Word institucionales para tesis y trabajos de investigacion. En sus paginas vigentes de apoyo indica que la plantilla ya trae formato y secciones. La version visible para EPG describe una plantilla adaptada de APA 7 con:
  - Times New Roman 12
  - interlineado 2 en caratula
  - interlineado 1.5 en el resto
  Ademas, la UPC publica una guia tematica activa de citas y referencias en APA 7, actualizada en 2025, y exige para repositorio que el trabajo use plantilla y cumpla validaciones editoriales como resumen, palabras clave, abstract, keywords y secciones completas.

- Implicacion practica para Ingeniometrix
  El "plan de tesis tipico en Peru" no es un solo formato. Se parece mas a:
  - un contenido comun academico
  - mas una piel institucional
  - mas una politica de citas por area

## Recommended Template Strategy

- Base comun `PE_POSGRADO_PLAN`
  Debe cubrir:
  - portada neutral
  - indice
  - problema
  - delimitacion
  - justificacion
  - objetivo general
  - objetivos especificos
  - preguntas de investigacion
  - hipotesis o preguntas orientadoras segun enfoque
  - marco teorico y antecedentes
  - variables o categorias
  - metodologia
  - poblacion, muestra o unidad de analisis
  - tecnicas e instrumentos
  - plan de analisis
  - aspectos eticos
  - cronograma
  - referencias
  - anexos

- Variantes por universidad
  - `UPC_POSGRADO`: portada, rotulos, tipografia y reglas cercanas a APA 7 institucional.
  - `UCV_POSGRADO`: portada y rotulos institucionales; citacion configurable por area, con APA como opcion por defecto en areas sociales/administrativas.
  - `USMP_POSGRADO`: variante con soporte explicito para cuantitativo, cualitativo y tecnico.

- Variantes por enfoque
  - `quantitative`
  - `qualitative`
  - `technical`
  Esta capa debe controlar:
  - presencia o ausencia de hipotesis
  - variables vs categorias
  - matriz o tabla de operacionalizacion
  - muestreo vs seleccion de casos
  - tecnicas estadisticas vs estrategia de analisis cualitativo

- Politica de citacion
  - default Release 0: APA 7
  - excepciones futuras:
    - Vancouver para salud
    - ISO 690 para ingenieria/arquitectura cuando el template lo requiera
  La referencia exportable debe salir de un mismo modelo canonico para DOCX, BibTeX, RIS y LaTeX.

## What To Generate Now

- estructura base del plan
- portada institucional parametrizable
- secciones textuales principales
- tablas academicas seguras:
  - matriz de consistencia
  - cronograma
  - operacionalizacion de variables cuando aplique
- bloque de referencias normalizadas
- anexos de trazabilidad y supuestos

## What To Leave For Later

- diferencias finas por facultad o programa especifico
- estilos bibliograficos no cubiertos por Release 0
- figuras automaticas
- diagramas complejos
- requisitos fisicos de empaste o impresion
- flujos ligados a publicacion en revistas indexadas

## Risks

- Riesgo de sobregeneralizar.
  Peru no usa un formato unico; incluso dentro de una misma universidad hay diferencias por facultad y disciplina.

- Riesgo de mezclar "plan de tesis" con "tesis final".
  Algunos manuales describen ambas cosas. La plantilla Release 0 debe centrarse en el plan, no en el manuscrito final completo.

- Riesgo de fijar un solo estilo de cita para todo.
  UCV ya evidencia variacion por area; si fijamos APA para todo, podemos romper compatibilidad futura con salud o ingenieria.

- Riesgo de copiar exigencias de repositorio como si fueran exigencias del plan.
  Resumen en ingles, ODS, autorizaciones o requisitos de publicacion no siempre pertenecen al plan inicial.

- Riesgo de soporte insuficiente para cualitativo.
  Varias guias peruanas distinguen cuantitativo y cualitativo. Una plantilla solo cuantitativa quedaria corta.

## Files Touched

- `docs/thread-briefs/20260420-IMX-REPORT-peru-thesis-plan-format-research.md`

## Verification

- Se revisaron fuentes oficiales o institucionales vigentes/accesibles de:
  - UPC Biblioteca y Explora UPC
  - UCV reglamentos y repositorio institucional
  - USMP manual institucional de tesis
  - UNMSM guias de proyecto de tesis de posgrado
  - SUNEDU/RENATI para contexto de registro y repositorio

## Sources

- UPC plantillas y requisitos de repositorio:
  - https://biblioteca.upc.edu.pe/plantilla-de-tesis
  - https://explora.upc.edu.pe/es_ES/repositorio-acad%C3%A9mico/%C2%BFen-que-consiste-el-formato-de-plantilla-para-tesis-trabajos-de-investigacion-o-tsp
  - https://biblioteca.upc.edu.pe/citas-referencias-APA7

- UCV:
  - https://webadminportal.ucv.edu.pe/uploads/files/backup/RCU-N--128-2023-UCV-REGLAMENTO-DE-TRABAJOS-CONDUCENTES-A-GRADOS-Y-TITULOS-1.pdf
  - https://webadminportal.ucv.edu.pe/uploads/files/backup/RCUN-0185-2020-UCV-Aprueba-Reglamento-Repositorio-Institucional-de-la-UCV.pdf
  - https://repositorio.ucv.edu.pe/handle/20.500.12692/144461

- USMP:
  - https://isegc.usmp.edu.pe/grados-y-titulos/titulacion-de-tesis/
  - https://isegc.usmp.edu.pe/wp-content/uploads/2026/02/Manual-para-la-elaboracion-deTesis-1.pdf

- UNMSM:
  - https://matematicas.unmsm.edu.pe/img/about/GUIA%20DE%20PRESENTACION%20DE%20PROYECTO%20DE%20TESIS%20MAESTRIA%20Y%20DOCTORADO.pdf

- SUNEDU / RENATI:
  - https://www.sunedu.gob.pe/sunedu-presenta-repositorio-digital-para-trabajos-de-investigacion/

## Follow-ups

- Definir un modelo canonico de `thesis_plan_document` separado del `research_blueprint`.
- Convertir esta investigacion en una ADR corta cuando se cierre la primera version de la plantilla.
- Disenar la primera tabla de mapeo:
  - universidad
  - enfoque
  - estilo de cita
  - campos obligatorios
