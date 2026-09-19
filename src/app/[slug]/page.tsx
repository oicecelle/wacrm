'use client';

import { useEffect, useState } from 'react';
import { useParams, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isReservedSlug } from '@/lib/bio-page/reserved-slugs';
import { BioFormModal, type BioFormDefinition, type BioFormField } from '@/components/bio-page/bio-form-modal';
import { Loader2, ExternalLink, ChevronRight } from 'lucide-react';

type BlockBase = { id: string };
type CardBlock = BlockBase & {
  type: 'card';
  title: string;
  subtitle?: string;
  action: { kind: 'form'; form_id: string } | { kind: 'link'; url: string };
};
type BannerBlock = BlockBase & { type: 'banner'; image_url: string; link_url?: string };
type CarouselBlock = BlockBase & {
  type: 'banner_carousel';
  images: { image_url: string; link_url?: string }[];
};
type TestimonialsBlock = BlockBase & { type: 'testimonials'; title?: string };
type ExternalLinkBlock = BlockBase & { type: 'external_link'; label: string; url: string };
type Block = CardBlock | BannerBlock | CarouselBlock | TestimonialsBlock | ExternalLinkBlock;

interface BioPageData {
  id: string;
  account_id: string;
  title: string | null;
  subtitle: string | null;
  avatar_url: string | null;
  theme_color: string;
  blocks: Block[];
}

export default function BioLinkPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const supabase = createClient();

  const [page, setPage] = useState<BioPageData | null>(null);
  const [notFoundState, setNotFoundState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [testimonials, setTestimonials] = useState<{ author_name: string; content: string; rating: number | null }[]>([]);
  const [forms, setForms] = useState<Record<string, BioFormDefinition>>({});
  const [activeForm, setActiveForm] = useState<BioFormDefinition | null>(null);

  const reserved = !!slug && isReservedSlug(slug);

  useEffect(() => {
    if (!slug || reserved) return;

    const load = async () => {
      const { data: bioPage } = await supabase
        .from('bio_pages')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle();

      if (!bioPage) {
        setNotFoundState(true);
        setLoading(false);
        return;
      }
      setPage(bioPage as BioPageData);

      const [{ data: clinic }, { data: testimonialRows }, { data: formRows }] = await Promise.all([
        supabase.from('clinics').select('whatsapp_url, phone, numero_whatsapp').eq('id', bioPage.account_id).maybeSingle(),
        supabase
          .from('bio_testimonials')
          .select('author_name, content, rating')
          .eq('account_id', bioPage.account_id)
          .eq('is_approved', true)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('bio_forms').select('*').eq('account_id', bioPage.account_id),
      ]);

      const rawNumber = clinic?.numero_whatsapp || clinic?.phone || '';
      setWhatsappNumber(rawNumber.replace(/\D/g, ''));
      setTestimonials(testimonialRows || []);

      const formsMap: Record<string, BioFormDefinition> = {};
      (formRows || []).forEach((f: { id: string; name: string; fields: BioFormField[]; whatsapp_message_template: string }) => {
        formsMap[f.id] = { id: f.id, name: f.name, fields: f.fields || [], whatsapp_message_template: f.whatsapp_message_template };
      });
      setForms(formsMap);
      setLoading(false);
    };

    load();
  }, [slug, supabase, reserved]);

  if (reserved || notFoundState) {
    notFound();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!page) return null;

  const theme = page.theme_color || '#2563eb';

  function handleCardClick(card: CardBlock) {
    if (card.action.kind === 'link') {
      window.open(card.action.url, '_blank', 'noopener,noreferrer');
    } else {
      const form = forms[card.action.form_id];
      if (form) setActiveForm(form);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 px-5 py-10">
        {page.avatar_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={page.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover shadow-md" />
        )}
        <div className="text-center">
          <h1 className="text-lg font-black text-neutral-900">{page.title}</h1>
          {page.subtitle && <p className="mt-1 text-sm text-neutral-500">{page.subtitle}</p>}
        </div>

        <div className="w-full space-y-4">
          {page.blocks.map((block) => {
            if (block.type === 'card') {
              return (
                <button
                  key={block.id}
                  onClick={() => handleCardClick(block)}
                  className="flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99]"
                >
                  <div>
                    <p className="text-sm font-bold text-neutral-800">{block.title}</p>
                    {block.subtitle && <p className="mt-0.5 text-xs text-neutral-500">{block.subtitle}</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
                </button>
              );
            }

            if (block.type === 'external_link') {
              return (
                <a
                  key={block.id}
                  href={block.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition-transform hover:scale-[1.01]"
                >
                  <span className="text-sm font-bold text-neutral-800">{block.label}</span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-neutral-300" />
                </a>
              );
            }

            if (block.type === 'banner') {
              const content = (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={block.image_url} alt="" className="w-full rounded-2xl object-cover shadow-sm" />
              );
              return block.link_url ? (
                <a key={block.id} href={block.link_url} target="_blank" rel="noopener noreferrer">
                  {content}
                </a>
              ) : (
                <div key={block.id}>{content}</div>
              );
            }

            if (block.type === 'banner_carousel') {
              return <BannerCarousel key={block.id} images={block.images} />;
            }

            if (block.type === 'testimonials') {
              return (
                <TestimonialsCarousel key={block.id} title={block.title} items={testimonials} theme={theme} />
              );
            }

            return null;
          })}
        </div>

        <a
          href="https://leadpluz.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 text-[11px] font-semibold text-neutral-400 hover:text-neutral-600"
        >
          Feito com <span style={{ color: theme }}>leadpluz</span>
        </a>
      </div>

      {activeForm && whatsappNumber && (
        <BioFormModal
          form={activeForm}
          whatsappNumber={whatsappNumber}
          themeColor={theme}
          onClose={() => setActiveForm(null)}
        />
      )}
    </div>
  );
}

function BannerCarousel({ images }: { images: { image_url: string; link_url?: string }[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % images.length), 4000);
    return () => clearInterval(timer);
  }, [images.length]);

  if (images.length === 0) return null;
  const current = images[index];

  const content = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={current.image_url} alt="" className="w-full rounded-2xl object-cover shadow-sm aspect-[16/9]" />
  );

  return (
    <div className="space-y-2">
      {current.link_url ? (
        <a href={current.link_url} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      ) : (
        content
      )}
      {images.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {images.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-neutral-700' : 'w-1.5 bg-neutral-300'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TestimonialsCarousel({
  title,
  items,
  theme,
}: {
  title?: string;
  items: { author_name: string; content: string; rating: number | null }[];
  theme: string;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), 5000);
    return () => clearInterval(timer);
  }, [items.length]);

  if (items.length === 0) return null;
  const current = items[index];

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      {title && <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">{title}</p>}
      {current.rating && (
        <div className="mb-1.5 flex gap-0.5" style={{ color: theme }}>
          {Array.from({ length: current.rating }).map((_, i) => (
            <span key={i}>★</span>
          ))}
        </div>
      )}
      <p className="text-sm italic text-neutral-700">&ldquo;{current.content}&rdquo;</p>
      <p className="mt-2 text-xs font-bold text-neutral-500">— {current.author_name}</p>
    </div>
  );
}
