import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandBadge } from "@/components/brand/brand-badge";
import { ThesisPlanMockup } from "@/components/marketing/research-visuals";
import { getResourceArticle, resourceArticles } from "@/lib/marketing/resources";
import { getPublicUrl } from "@/lib/public-site";

type ResourceArticlePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return resourceArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: ResourceArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getResourceArticle(slug);

  if (!article) {
    return {};
  }

  return {
    title: article.title,
    description: article.description,
    alternates: {
      canonical: `/recursos/${article.slug}`,
    },
    openGraph: {
      title: `${article.title} | Ingeniometrix`,
      description: article.description,
      url: getPublicUrl(`/recursos/${article.slug}`),
      type: "article",
      publishedTime: article.publishedAt,
    },
  };
}

export default async function ResourceArticlePage({ params }: ResourceArticlePageProps) {
  const { slug } = await params;
  const article = getResourceArticle(slug);

  if (!article) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    author: {
      "@type": "Organization",
      name: "Ingeniometrix",
    },
    publisher: {
      "@type": "Organization",
      name: "Ingeniometrix",
    },
    mainEntityOfPage: getPublicUrl(`/recursos/${article.slug}`),
  };

  return (
    <main className="min-h-screen overflow-x-hidden px-4 pb-14 pt-6 sm:px-6 lg:px-8">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        type="application/ld+json"
      />
      <header className="sticky top-4 z-30 mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[30px] border border-[rgba(74,58,97,0.12)] bg-[rgba(255,255,255,0.88)] px-3 py-3 shadow-[0_20px_50px_rgba(23,19,31,0.08)] backdrop-blur sm:gap-3 sm:px-5 sm:py-4">
          <Link className="min-w-0 flex-1" href="/">
            <BrandBadge compact context="company" />
          </Link>
          <div className="flex items-center gap-2">
            <Link className="brand-button-secondary hidden px-4 py-2 text-sm font-semibold sm:inline-flex" href="/recursos">
              Recursos
            </Link>
            <Link className="brand-button-primary px-3 py-2 text-sm font-semibold sm:px-4" href="/campana">
              Snapshot
            </Link>
          </div>
        </div>
      </header>

      <article className="mx-auto mt-8 grid w-full max-w-[var(--page-max-width)] gap-6 lg:grid-cols-[0.72fr_0.28fr] lg:items-start">
        <div className="surface-panel rounded-[40px] px-6 py-8 sm:px-8 lg:px-10">
          <Link className="brand-pill text-sm hover:text-[var(--color-plum)]" href="/recursos">
            ← Volver a recursos
          </Link>
          <p className="mt-8 brand-kicker">{article.eyebrow}</p>
          <h1 className="mt-4 font-[var(--font-heading)] text-4xl font-semibold leading-tight text-[var(--color-ink)] sm:text-5xl">
            {article.title}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[var(--color-muted)]">
            {article.description}
          </p>
          <p className="mt-4 text-sm font-semibold text-[var(--color-plum)]">
            {article.readingTime}
          </p>

          <div className="mt-8 space-y-8">
            {article.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
                  {section.heading}
                </h2>
                <div className="mt-4 space-y-4">
                  {section.body.map((paragraph) => (
                    <p className="text-base leading-8 text-[var(--color-muted)]" key={paragraph}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <aside className="grid gap-4">
          <ThesisPlanMockup size="compact" />
          <div className="surface-panel rounded-[30px] p-6">
            <p className="brand-kicker">Siguiente paso</p>
            <h2 className="mt-4 font-[var(--font-heading)] text-2xl font-semibold text-[var(--color-ink)]">
              ¿Quieres aterrizar tu tema?
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">
              Solicita un snapshot para convertir tu idea inicial en una primera
              base visual y revisable.
            </p>
            <Link className="mt-5 brand-button-primary px-5 py-3 text-sm font-semibold" href="/campana">
              Ver snapshot
            </Link>
          </div>
        </aside>
      </article>
    </main>
  );
}
