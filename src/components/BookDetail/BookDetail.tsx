import Button from '@/components/ui/Button';
import { BOOK_KINDS, BOOK_TITLE_MAX } from '@/constants';

import { FIELD, ISBN_CONFIDENCES, LABEL, metaText } from './constants';
import { fileToCoverDataUrl, seriesOf } from './helpers';
import type { IsbnConfidence } from '@/types';

import type { BookDetailProps } from './types';

export const BookDetail = ({
  book,
  crateLabel,
  allBooks,
  readOnly = false,
  onDenied,
  onChange: applyChange,
  onOpen,
  onHint,
  onClose,
}: BookDetailProps) => {
  const series = book ? seriesOf(book, allBooks) : null;
  const onChange: BookDetailProps['onChange'] = (patch) =>
    readOnly ? onDenied?.() : applyChange(patch);

  return (
    <aside
      className={`pointer-events-auto relative flex min-h-0 w-full [scrollbar-width:none] flex-col overflow-y-auto rounded-2xl border border-ink/10 bg-white/85 px-[18px] pt-4 pb-3.5 text-sm shadow-[0_10px_30px_rgba(31,42,55,0.14)] backdrop-blur-md transition-[opacity,transform] duration-200 [&::-webkit-scrollbar]:hidden ${
        book ? '' : 'pointer-events-none translate-x-5 opacity-0'
      }`}
      aria-hidden={!book}
      onFocusCapture={(e) => readOnly && e.target.matches('input,textarea') && onDenied?.()}
      onClickCapture={(e) => {
        if (readOnly && (e.target as HTMLElement).closest('select,input[type=file],[data-edit]')) {
          e.preventDefault();
          onDenied?.();
        }
      }}
    >
      <Button
        variant="ghost"
        className="absolute top-2 right-2 px-2 py-1 text-xl leading-none"
        title="Ranger le livre (Échap)"
        onClick={onClose}
      >
        ×
      </Button>
      <label htmlFor="detailTitle" className={LABEL}>
        Titre
      </label>
      <input
        id="detailTitle"
        readOnly={readOnly}
        type="text"
        className={`${FIELD} text-[17px] font-semibold`}
        maxLength={BOOK_TITLE_MAX}
        autoComplete="off"
        value={book?.title ?? ''}
        onChange={(e) => onChange({ title: e.target.value })}
      />
      <div className="grid grid-cols-[1fr_1fr_72px] gap-1.5">
        <div>
          <label htmlFor="detailAuthor" className={LABEL}>
            Auteur
          </label>
          <input
            id="detailAuthor"
            readOnly={readOnly}
            type="text"
            className={FIELD}
            autoComplete="off"
            value={book?.author ?? ''}
            onChange={(e) => onChange({ author: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="detailPublisher" className={LABEL}>
            Éditeur
          </label>
          <input
            id="detailPublisher"
            readOnly={readOnly}
            type="text"
            className={FIELD}
            autoComplete="off"
            value={book?.publisher ?? ''}
            onChange={(e) => onChange({ publisher: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="detailYear" className={LABEL}>
            Année
          </label>
          <input
            id="detailYear"
            readOnly={readOnly}
            type="number"
            className={FIELD}
            min={1400}
            max={2100}
            value={book?.year ?? ''}
            onChange={(e) =>
              onChange({ year: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </div>
        <div className="col-span-3">
          <label htmlFor="detailIsbn" className={LABEL}>
            ISBN :
          </label>
          <div className="flex gap-1.5">
            <input
              id="detailIsbn"
              readOnly={readOnly}
              type="text"
              inputMode="numeric"
              className={FIELD}
              autoComplete="off"
              value={book?.isbn ?? ''}
              onChange={(e) => onChange({ isbn: e.target.value, isbnConfidence: 'verifie' })}
            />
            <select
              aria-label="Confiance dans l'ISBN"
              disabled={readOnly || !book?.isbn}
              className={`${FIELD} w-28 shrink-0`}
              value={book?.isbnConfidence ?? 'moyenne'}
              onChange={(e) =>
                onChange({ isbn: book?.isbn, isbnConfidence: e.target.value as IsbnConfidence })
              }
            >
              {ISBN_CONFIDENCES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <label htmlFor="detailKind" className={LABEL}>
        Type
      </label>
      <select
        id="detailKind"
        disabled={readOnly}
        className={FIELD}
        value={book?.kind ?? 'autre'}
        onChange={(e) => onChange({ kind: e.target.value as (typeof BOOK_KINDS)[number]['kind'] })}
      >
        {BOOK_KINDS.map(({ kind, label }) => (
          <option key={kind} value={kind}>
            {label}
          </option>
        ))}
      </select>
      <label htmlFor="detailSummary" className={LABEL}>
        Résumé
      </label>
      <textarea
        id="detailSummary"
        readOnly={readOnly}
        className={`${FIELD} min-h-24 flex-1 resize-none leading-relaxed`}
        placeholder="Écris le résumé ici…"
        value={book?.summary ?? ''}
        onChange={(e) => onChange({ summary: e.target.value })}
      />
      <div className="mt-1.5 text-xs text-muted">
        {book ? metaText(book.h, book.d, book.t, crateLabel) : ''}
      </div>
      <label htmlFor="detailCover" className={LABEL}>
        Couverture
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        {book?.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.cover} alt="" className="h-16 w-11 rounded-sm object-cover shadow" />
        )}
        <input
          id="detailCover"
          type="file"
          accept="image/*"
          className="max-w-[180px] text-xs text-muted"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) fileToCoverDataUrl(f).then((cover) => onChange({ cover }));
            e.target.value = '';
          }}
        />
        {book?.cover && (
          <Button
            variant="ghost"
            className="px-1.5 py-1 text-xs"
            data-edit
            onClick={() => onChange({ cover: '' })}
          >
            Supprimer
          </Button>
        )}
      </div>
      {series && (
        <>
          <div className={LABEL}>
            Série · {series.name} ({series.owned}/{series.total || series.owned})
          </div>
          <div className="flex flex-wrap gap-1">
            {series.items.map((it) =>
              it.id === null ? (
                <span
                  key={`missing-${it.num}`}
                  className="cursor-default rounded-lg border border-dashed border-ink/25 px-1.5 py-0.5 text-xs text-muted"
                  title={`${series.name} ${it.label} : manquant`}
                >
                  {it.label} · manquant
                </span>
              ) : (
                <Button
                  key={it.id}
                  variant={it.id === book?.id ? 'active' : 'default'}
                  className="px-1.5 py-0.5 text-xs"
                  title={`Ouvrir ${series.name} ${it.label}`}
                  onClick={() => it.id !== book?.id && onOpen(it.id!)}
                >
                  {it.label}
                </Button>
              ),
            )}
          </div>
        </>
      )}
      <div className="mt-3">
        <Button
          variant="primary"
          className="w-full"
          title="Ranger le livre à sa place (Échap)"
          onMouseEnter={() => book?.crate && onHint(book.crate)}
          onMouseLeave={() => onHint(null)}
          onClick={onClose}
        >
          {crateLabel ? `Ranger dans ${crateLabel}` : 'Ranger à côté'}
        </Button>
      </div>
    </aside>
  );
};
