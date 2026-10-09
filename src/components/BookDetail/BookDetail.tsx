import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';
import IconButton from '@/components/ui/IconButton';
import Label from '@/components/ui/Label';
import Panel from '@/components/ui/Panel';
import Select from '@/components/ui/Select';
import TextArea from '@/components/ui/TextArea';
import TextInput from '@/components/ui/TextInput';
import { BOOK_KINDS, BOOK_LIMITS, BOOK_TITLE_MAX } from '@/constants';

import { DIMENSIONS, ISBN_CONFIDENCES, ISSN_PATTERN, metaText } from './constants';
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
    <Panel
      as="aside"
      className={`pointer-events-auto relative flex min-h-0 w-full [scrollbar-width:none] flex-col overflow-y-auto px-[18px] pt-4 pb-3.5 transition-[opacity,transform] duration-200 [&::-webkit-scrollbar]:hidden ${
        book ? '' : 'pointer-events-none translate-x-5 opacity-0'
      }`}
      aria-hidden={!book}
      // fiche masquée : ses champs ne doivent ni prendre le focus ni être lus
      inert={!book}
      onFocusCapture={(e) => readOnly && e.target.matches('input,textarea') && onDenied?.()}
      onClickCapture={(e) => {
        if (readOnly && (e.target as HTMLElement).closest('select,input[type=file],[data-edit]')) {
          e.preventDefault();
          onDenied?.();
        }
      }}
    >
      <IconButton
        variant="ghost"
        className="absolute top-2 right-2 rounded-lg px-2 py-1 text-xl max-md:min-h-11 max-md:min-w-11"
        label="Ranger le livre"
        title="Ranger le livre (Échap)"
        onClick={onClose}
      >
        ×
      </IconButton>
      <Label htmlFor="detailTitle">Titre</Label>
      <TextInput
        id="detailTitle"
        readOnly={readOnly}
        className="text-[17px] font-semibold"
        maxLength={BOOK_TITLE_MAX}
        autoComplete="off"
        value={book?.title ?? ''}
        onChange={(e) => onChange({ title: e.target.value })}
      />
      <div className="grid grid-cols-[1fr_1fr_72px] gap-1.5">
        <div>
          <Label htmlFor="detailAuthor">Auteur</Label>
          <TextInput
            id="detailAuthor"
            readOnly={readOnly}
            autoComplete="off"
            value={book?.author ?? ''}
            onChange={(e) => onChange({ author: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="detailPublisher">Éditeur</Label>
          <TextInput
            id="detailPublisher"
            readOnly={readOnly}
            autoComplete="off"
            value={book?.publisher ?? ''}
            onChange={(e) => onChange({ publisher: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="detailYear">Année</Label>
          <TextInput
            id="detailYear"
            readOnly={readOnly}
            type="number"
            min={1400}
            max={2100}
            value={book?.year ?? ''}
            onChange={(e) =>
              onChange({ year: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </div>
        <div className="col-span-3">
          <Label htmlFor="detailIsbn">
            {ISSN_PATTERN.test(book?.isbn ?? '') ? 'ISSN :' : 'ISBN :'}
          </Label>
          <div className="flex gap-1.5">
            <TextInput
              id="detailIsbn"
              readOnly={readOnly}
              inputMode="numeric"
              className="min-w-0 flex-1"
              autoComplete="off"
              value={book?.isbn ?? ''}
              onChange={(e) => onChange({ isbn: e.target.value, isbnConfidence: 'verifie' })}
            />
            <Select
              aria-label="Confiance dans l'ISBN"
              disabled={readOnly || !book?.isbn}
              className="w-28 shrink-0"
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
            </Select>
          </div>
        </div>
      </div>
      <Label htmlFor="detailKind">Type</Label>
      <Select
        id="detailKind"
        disabled={readOnly}
        value={book?.kind ?? 'autre'}
        onChange={(e) => onChange({ kind: e.target.value as (typeof BOOK_KINDS)[number]['kind'] })}
      >
        {BOOK_KINDS.map(({ kind, label }) => (
          <option key={kind} value={kind}>
            {label}
          </option>
        ))}
      </Select>
      <Label as="div">Dimensions du livre</Label>
      <div className="grid grid-cols-3 gap-1.5">
        {DIMENSIONS.map(({ key, label, title, factor, step }) => (
          <div key={key}>
            <Label htmlFor={`detail-${key}`}>{label}</Label>
            <TextInput
              // non contrôlé : on peut taper « 28 » en passant par « 2 » (hors bornes, ignoré) ; remonté si le livre change
              key={`${key}-${book?.id}`}
              id={`detail-${key}`}
              readOnly={readOnly}
              type="number"
              inputMode="decimal"
              title={title}
              min={BOOK_LIMITS[key][0] * factor}
              max={BOOK_LIMITS[key][1] * factor}
              step={step}
              defaultValue={book ? Math.round(book[key] * factor * 10) / 10 : ''}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                if (Number.isFinite(v)) onChange({ [key]: v / factor });
              }}
              // à la sortie du champ, on réaffiche la valeur réellement retenue (une saisie hors bornes est ignorée)
              onBlur={(e) => {
                if (book) e.target.value = String(Math.round(book[key] * factor * 10) / 10);
              }}
            />
          </div>
        ))}
      </div>
      <Label htmlFor="detailSummary">Résumé</Label>
      <TextArea
        id="detailSummary"
        readOnly={readOnly}
        className="min-h-24 flex-1 resize-none leading-relaxed"
        placeholder="Écris le résumé ici…"
        value={book?.summary ?? ''}
        onChange={(e) => onChange({ summary: e.target.value })}
      />
      <div className="mt-1.5 text-xs text-muted">
        {book ? metaText(book.h, book.d, book.t, crateLabel) : ''}
      </div>
      <Label htmlFor="detailCover">Couverture</Label>
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
          <Button variant="ghost" size="sm" data-edit onClick={() => onChange({ cover: '' })}>
            Supprimer
          </Button>
        )}
      </div>
      {series && (
        <>
          <Label as="div">
            Série · {series.name} ({series.owned}/{series.total || series.owned})
          </Label>
          <div className="flex flex-wrap gap-1">
            {series.items.map((it) =>
              it.id === null ? (
                <Chip
                  key={`missing-${it.num}`}
                  state="missing"
                  label={it.label}
                  title={`${series.name} ${it.label} : manquant`}
                />
              ) : (
                <Chip
                  key={it.id}
                  state={it.id === book?.id ? 'current' : 'owned'}
                  label={it.label}
                  title={`Ouvrir ${series.name} ${it.label}`}
                  onClick={() => onOpen(it.id!)}
                />
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
          onFocus={() => book?.crate && onHint(book.crate)}
          onBlur={() => onHint(null)}
          onClick={onClose}
        >
          {crateLabel ? `Ranger dans ${crateLabel}` : 'Ranger à côté'}
        </Button>
      </div>
    </Panel>
  );
};
